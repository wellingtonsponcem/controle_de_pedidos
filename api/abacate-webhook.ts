import crypto from 'node:crypto';
import pool, { withTransaction } from './_db';
import { calcularValorLiquido } from './_financeiro_utils';
import { getSystemConfigValue } from './configuracoes';

const ABACATEPAY_PUBLIC_KEY = 't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

export const config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifySignature(rawBody: string, signatureFromHeader: string) {
  const expectedSig = crypto
    .createHmac('sha256', ABACATEPAY_PUBLIC_KEY)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64');

  const expected = Buffer.from(expectedSig);
  const received = Buffer.from(signatureFromHeader);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function getHeader(req: any, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getPaymentEntity(event: any) {
  return event?.data?.checkout || event?.data?.transparent || event?.data?.billing || null;
}

function getPedidoId(event: any) {
  const entity = getPaymentEntity(event);
  return entity?.externalId || entity?.metadata?.pedido_id || event?.data?.metadata?.pedido_id || null;
}

function getPaymentMethod(event: any) {
  const entity = getPaymentEntity(event);
  const method = event?.data?.payerInformation?.method || entity?.methods?.[0] || event?.data?.payment?.method || 'PIX';
  return method === 'CARD' ? 'Crédito' : 'PIX';
}

async function ensureWebhookEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abacate_webhook_events (
      id VARCHAR(120) PRIMARY KEY,
      event_name VARCHAR(80) NOT NULL,
      pedido_id UUID,
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function markPedidoAsPaid(event: any) {
  const pedidoId = getPedidoId(event);
  if (!pedidoId) {
    throw Object.assign(new Error('Webhook sem pedido_id/externalId.'), { statusCode: 400 });
  }

  const meio = getPaymentMethod(event);

  return withTransaction(async (client) => {
    const pedidoResult = await client.query(`
      SELECT p.*, c.nome as cliente_nome
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
      FOR UPDATE
    `, [pedidoId]);

    if (pedidoResult.rows.length === 0) {
      throw Object.assign(new Error(`Pedido ${pedidoId} não encontrado.`), { statusCode: 404 });
    }

    const pedido = pedidoResult.rows[0];
    if (pedido.pago === true) return pedido;

    const taxaResult = await client.query(
      'SELECT porcentagem_taxa FROM taxas_maquininha WHERE meio_pagamento = $1',
      [meio]
    );
    const taxa = taxaResult.rows.length > 0 ? Number(taxaResult.rows[0].porcentagem_taxa) : 0;
    const valorTotal = Number(pedido.valor_total);
    const valorLiquido = calcularValorLiquido(valorTotal, taxa);

    const updateResult = await client.query(`
      UPDATE pedidos
      SET pago = TRUE,
          data_pagamento = NOW(),
          meio_pagamento = $1,
          valor_liquido = $2,
          status = CASE WHEN status = 'Rascunho' THEN 'Pendente' ELSE status END,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [meio, valorLiquido, pedidoId]);

    await client.query('DELETE FROM transacoes_financeiras WHERE pedido_id = $1', [pedidoId]);
    await client.query(`
      INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria, pedido_id)
      VALUES ('Receita', $1, CURRENT_DATE, $2, 'Venda de Pedido', $3)
    `, [
      valorLiquido,
      `Pedido Bemavi - Cliente: ${pedido.cliente_nome} (${meio} Abacate Pay - Líquido: R$ ${valorLiquido.toFixed(2)} | Bruto: R$ ${valorTotal.toFixed(2)} | Taxa: ${taxa}%) (Pago Online)`,
      pedidoId
    ]);

    return updateResult.rows[0];
  });
}

async function markPedidoAsRefunded(event: any) {
  const pedidoId = getPedidoId(event);
  if (!pedidoId) {
    throw Object.assign(new Error('Webhook sem pedido_id/externalId.'), { statusCode: 400 });
  }

  return withTransaction(async (client) => {
    await client.query(`
      UPDATE pedidos
      SET pago = FALSE,
          data_pagamento = NULL,
          meio_pagamento = NULL,
          valor_liquido = NULL,
          observacao = CONCAT(COALESCE(observacao, ''), E'\nPagamento Abacate Pay reembolsado em ', NOW()::TEXT),
          updated_at = NOW()
      WHERE id = $1
    `, [pedidoId]);
    await client.query('DELETE FROM transacoes_financeiras WHERE pedido_id = $1', [pedidoId]);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const webhookSecret = process.env.ABACATEPAY_WEBHOOK_SECRET || await getSystemConfigValue('ABACATEPAY_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return res.status(500).json({ error: 'Secret do webhook Abacate Pay não configurado.' });
  }

  if (req.query.webhookSecret !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawBody = await readRawBody(req);
  const signature = getHeader(req, 'x-webhook-signature');
  if (!signature || !verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Assinatura inválida.' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }

  await ensureWebhookEventsTable();
  const eventId = event.id || `${event.event || 'unknown'}-${getPedidoId(event) || 'sem-pedido'}-${Date.now()}`;

  const processedEvent = await pool.query('SELECT id FROM abacate_webhook_events WHERE id = $1', [eventId]);
  if (processedEvent.rows.length > 0) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  try {
    if (event.event === 'checkout.completed' || event.event === 'transparent.completed' || event.event === 'billing.paid') {
      await markPedidoAsPaid(event);
    } else if (event.event === 'checkout.refunded' || event.event === 'transparent.refunded') {
      await markPedidoAsRefunded(event);
    }

    await pool.query(
      'INSERT INTO abacate_webhook_events (id, event_name, pedido_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [eventId, event.event || 'unknown', getPedidoId(event)]
    );

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('Falha ao processar webhook Abacate Pay:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao processar webhook.', details: error.message });
  }
}
