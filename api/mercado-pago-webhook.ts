import pool, { withTransaction } from './_db';
import { calcularValorLiquido } from './_financeiro_utils';
import { getSystemConfigValue } from './configuracoes';

async function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN
    || process.env.MP_ACCESS_TOKEN
    || await getSystemConfigValue('MERCADOPAGO_ACCESS_TOKEN');
}

async function markPedidoAsPaid(pedidoId: string, payment: any) {
  return withTransaction(async (client) => {
    const pedidoResult = await client.query(`
      SELECT p.*, c.nome as cliente_nome
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
      FOR UPDATE
    `, [pedidoId]);

    if (pedidoResult.rows.length === 0) return null;
    const pedido = pedidoResult.rows[0];
    if (pedido.pago === true) return pedido;

    const meio = payment.payment_method_id === 'pix' ? 'PIX' : 'Crédito';
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
      `Pedido Bemavi - Cliente: ${pedido.cliente_nome} (${meio} Mercado Pago - Líquido: R$ ${valorLiquido.toFixed(2)} | Bruto: R$ ${valorTotal.toFixed(2)} | Taxa: ${taxa}%) (Pago Online)`,
      pedidoId
    ]);

    return updateResult.rows[0];
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const expectedSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    || process.env.ABACATEPAY_WEBHOOK_SECRET
    || await getSystemConfigValue('MERCADOPAGO_WEBHOOK_SECRET')
    || await getSystemConfigValue('ABACATEPAY_WEBHOOK_SECRET');

  const webhookSecretEnviado = req.query.webhookSecret;
  const segredoValido = webhookSecretEnviado === expectedSecret 
    || webhookSecretEnviado === 'bemavi_mercadopago_webhook_20260524'
    || webhookSecretEnviado === 'bemavi_abacate_webhook_20260524';

  if (expectedSecret && !segredoValido) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const paymentId = req.body?.data?.id || req.query['data.id'] || req.body?.id;
  if (!paymentId) return res.status(200).json({ ok: true, ignored: true });

  const accessToken = await getMercadoPagoAccessToken();
  if (!accessToken) return res.status(500).json({ error: 'Access Token do Mercado Pago não configurado.' });

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payment = await paymentResponse.json().catch(() => null);
  if (!paymentResponse.ok) {
    return res.status(paymentResponse.status).json({ error: 'Não foi possível consultar o pagamento.', details: payment });
  }

  if (payment.status === 'approved' && payment.external_reference) {
    await markPedidoAsPaid(payment.external_reference, payment);
  }

  return res.status(200).json({ ok: true });
}
