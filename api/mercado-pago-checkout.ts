import { randomUUID } from 'node:crypto';
import pool, { withTransaction } from './_db';
import { getSystemConfigValue } from './configuracoes';

type CheckoutItem = {
  produto_id?: string;
  quantidade?: number;
};

type PedidoCheckout = {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  valor_total: number;
  produtos: Array<{ nome: string; quantidade: number; preco_unitario: number }>;
};

export function toPositiveQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(quantity));
}

export function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

export function emailFromPhone(phone: string) {
  const digits = normalizePhone(phone) || 'cliente';
  return `${digits}@bemavi.local`;
}

async function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN
    || process.env.MP_ACCESS_TOKEN
    || await getSystemConfigValue('MERCADOPAGO_ACCESS_TOKEN');
}

async function createPublicPedido(payload: any, normalizedItems: Array<{ produto_id: string; quantidade: number }>) {
  const { cliente, pedido } = payload;
  const entrega = pedido?.entrega === 'Retirada' ? 'Retirada' : 'Entrega';
  const municipioEntrega = pedido?.municipio_entrega;

  if (!cliente?.nome || !cliente?.telefone || !pedido?.data_agendada || !municipioEntrega) {
    throw Object.assign(new Error('Dados do cliente, data e município são obrigatórios.'), { statusCode: 400 });
  }

  if (entrega === 'Entrega' && !String(pedido.endereco || '').trim()) {
    throw Object.assign(new Error('Endereço é obrigatório for entrega.'), { statusCode: 400 });
  }

  return withTransaction(async (client) => {
    const taxaQuery = await client.query('SELECT valor_taxa FROM taxas_entrega WHERE municipio = $1', [municipioEntrega]);
    if (taxaQuery.rows.length === 0) {
      throw Object.assign(new Error(`Município '${municipioEntrega}' não é atendido pela logística Bemavi.`), { statusCode: 400 });
    }

    const valorEntrega = entrega === 'Entrega' ? Number(taxaQuery.rows[0].valor_taxa) : 0;
    let valorProdutos = 0;
    const produtos: Array<{ produto_id: string; quantidade: number; nome: string; preco_unitario: number }> = [];

    for (const item of normalizedItems) {
      const prodQuery = await client.query('SELECT nome, preco_base, ativo FROM produtos WHERE id = $1', [item.produto_id]);
      if (prodQuery.rows.length === 0 || !prodQuery.rows[0].ativo) {
        throw Object.assign(new Error('Um dos produtos selecionados não está mais disponível.'), { statusCode: 400 });
      }

      const produto = prodQuery.rows[0];
      const precoUnitario = Number(produto.preco_base);
      valorProdutos += precoUnitario * item.quantidade;
      produtos.push({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        nome: produto.nome,
        preco_unitario: precoUnitario
      });
    }

    const valorTotal = Math.max(0, valorProdutos + valorEntrega);
    const endereco = String(pedido.endereco || '').trim();
    const observacaoParts = [
      pedido.observacao ? String(pedido.observacao).trim() : null,
      'Origem: catálogo público',
      'Gateway: Mercado Pago',
      `Modalidade: ${entrega}`,
      entrega === 'Entrega' ? `Endereço informado: ${endereco}` : null
    ].filter(Boolean);

    const clienteCheck = await client.query(
      'SELECT id FROM clientes WHERE telefone = $1 AND nome = $2',
      [cliente.telefone, cliente.nome]
    );

    let clienteId: string;
    if (clienteCheck.rows.length > 0) {
      clienteId = clienteCheck.rows[0].id;
      await client.query(`
        UPDATE clientes
        SET logradouro = $1, numero = $2, complemento = $3, bairro = $4, municipio = $5, email = $6, updated_at = NOW()
        WHERE id = $7
      `, [
        entrega === 'Entrega' ? endereco : 'Retirada',
        'S/N',
        null,
        entrega === 'Entrega' ? 'Não informado' : 'Loja',
        municipioEntrega,
        emailFromPhone(cliente.telefone),
        clienteId
      ]);
    } else {
      const insertClienteRes = await client.query(`
        INSERT INTO clientes (nome, telefone, email, logradouro, numero, complemento, bairro, municipio)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      `, [
        String(cliente.nome).trim(),
        String(cliente.telefone).trim(),
        emailFromPhone(cliente.telefone),
        entrega === 'Entrega' ? endereco : 'Retirada',
        'S/N',
        null,
        entrega === 'Entrega' ? 'Não informado' : 'Loja',
        municipioEntrega
      ]);
      clienteId = insertClienteRes.rows[0].id;
    }

    const insertPedidoRes = await client.query(`
      INSERT INTO pedidos (
        cliente_id, data_agendada, municipio_entrega, valor_produtos, valor_entrega, valor_total,
        status, recorrente_flag, recorrente_intervalo, observacao, pago, data_pagamento,
        meio_pagamento, valor_liquido, desconto
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'Pendente', FALSE, NULL, $7, FALSE, NULL, NULL, NULL, 0)
      RETURNING *
    `, [
      clienteId,
      pedido.data_agendada,
      municipioEntrega,
      valorProdutos,
      valorEntrega,
      valorTotal,
      observacaoParts.join('\n')
    ]);

    const pedidoCriado = insertPedidoRes.rows[0];
    for (const item of produtos) {
      await client.query(
        'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES ($1, $2, $3, $4)',
        [pedidoCriado.id, item.produto_id, item.quantidade, item.preco_unitario]
      );
    }

    return {
      id: pedidoCriado.id,
      cliente_nome: String(cliente.nome).trim(),
      cliente_telefone: String(cliente.telefone).trim(),
      valor_total: Number(pedidoCriado.valor_total),
      produtos: produtos.map(produto => ({
        nome: produto.nome,
        quantidade: produto.quantidade,
        preco_unitario: produto.preco_unitario
      }))
    };
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const accessToken = await getMercadoPagoAccessToken();
  if (!accessToken) {
    return res.status(500).json({ error: 'Access Token do Mercado Pago não configurado.' });
  }

  const { itens, metodo_pagamento, pix_payer, pedido_id, card_payment } = req.body || {};

  // ROTA DE FINALIZAÇÃO DE CARTÃO DE CRÉDITO (SUBMIT DO BRICK)
  if (pedido_id && metodo_pagamento === 'CARD' && card_payment) {
    try {
      const pedidoQuery = await pool.query(`
        SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone 
        FROM pedidos p 
        JOIN clientes c ON p.cliente_id = c.id 
        WHERE p.id = $1
      `, [pedido_id]);

      if (pedidoQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Pedido não encontrado.' });
      }

      const dbPedido = pedidoQuery.rows[0];
      const nomeCompleto = String(dbPedido.cliente_nome).trim().replace(/\s+/g, ' ');
      const nomeParts = nomeCompleto.split(' ');
      const firstName = nomeParts[0] || 'Cliente';
      const lastName = nomeParts.slice(1).join(' ') || 'Bemavi';

      const amountStr = Number(dbPedido.valor_total).toFixed(2);
      const idempotencyKey = randomUUID();

      const orderResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          transaction_amount: Number(dbPedido.valor_total),
          token: card_payment.token,
          description: `Pedido Bemavi - ${dbPedido.id}`,
          installments: Number(card_payment.installments) || 1,
          payment_method_id: card_payment.payment_method_id,
          external_reference: dbPedido.id,
          payer: {
            email: card_payment.email && String(card_payment.email).trim().includes('@') 
              ? String(card_payment.email).trim() 
              : emailFromPhone(dbPedido.cliente_telefone),
            first_name: firstName,
            last_name: lastName,
            identification: {
              type: card_payment.identification?.type || 'CPF',
              number: String(card_payment.identification?.number || '').replace(/\D/g, '')
            }
          }
        })
      });

      const orderData = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) {
        return res.status(orderResponse.status || 502).json({
          error: orderData?.message || orderData?.error || 'Não foi possível processar o pagamento com cartão no Mercado Pago.',
          details: orderData?.cause?.[0]?.description || orderData?.cause?.[0]?.message || null
        });
      }

      const paymentStatus = orderData?.status;
      const paymentStatusDetail = orderData?.status_detail;
      
      if (paymentStatus === 'approved' || paymentStatus === 'authorized') {
        await pool.query(`
          UPDATE pedidos
          SET status = 'Preparando', pago = TRUE, data_pagamento = NOW(), meio_pagamento = 'Cartão', valor_liquido = $1
          WHERE id = $2
        `, [Number(dbPedido.valor_total), dbPedido.id]);
      } else if (paymentStatus === 'rejected') {
        return res.status(400).json({
          error: 'O pagamento com cartão foi recusado pelo Mercado Pago.',
          details: paymentStatusDetail || 'Pagamento rejeitado.'
        });
      }

      return res.status(200).json({
        pedido_id: dbPedido.id,
        status: paymentStatus || 'approved',
        status_detail: paymentStatusDetail || ''
      });
    } catch (error: any) {
      console.error('Erro ao processar pagamento de cartão via Brick:', error);
      return res.status(500).json({ error: 'Erro interno ao processar pagamento com cartão.', details: error.message });
    }
  }

  // CRIAÇÃO INICIAL DO PEDIDO
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe itens para gerar o pagamento online.' });
  }

  const normalizedItems = (itens as CheckoutItem[])
    .map(item => ({
      produto_id: String(item.produto_id || ''),
      quantidade: toPositiveQuantity(item.quantidade)
    }))
    .filter(item => item.produto_id && item.quantidade > 0);

  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: 'Nenhum item válido foi enviado para cobrança.' });
  }

  try {
    const pedido: PedidoCheckout = await createPublicPedido(req.body, normalizedItems);

    if (metodo_pagamento === 'PIX') {
      const emailDigitado = String(pix_payer?.email || '').trim();
      const email = emailDigitado.includes('@') ? emailDigitado : emailFromPhone(pedido.cliente_telefone);
      const identificationType = pix_payer?.identification?.type;
      const identificationNumber = pix_payer?.identification?.number;

      if (!identificationType || !identificationNumber) {
        return res.status(400).json({ error: 'Para pagamento via Pix, os dados de identificação (tipo e número de documento) são obrigatórios.' });
      }

      const nomeCompleto = String(pedido.cliente_nome).trim().replace(/\s+/g, ' ');
      const nomeParts = nomeCompleto.split(' ');
      const firstName = nomeParts[0] || 'Cliente';
      const lastName = nomeParts.slice(1).join(' ') || 'Bemavi';

      const amountStr = Number(pedido.valor_total).toFixed(2);
      const idempotencyKey = randomUUID();

      // Configurar expiração do Pix em 4 minutos
      const expDate = new Date();
      expDate.setMinutes(expDate.getMinutes() + 4);
      const expirationTimeStr = expDate.toISOString();

      const orderResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          transaction_amount: Number(pedido.valor_total),
          description: `Pedido Bemavi - ${pedido.id}`,
          payment_method_id: 'pix',
          external_reference: pedido.id,
          date_of_expiration: expirationTimeStr,
          payer: {
            email: email,
            first_name: firstName,
            last_name: lastName,
            identification: {
              type: identificationType,
              number: String(identificationNumber).replace(/\D/g, '')
            }
          }
        })
      });

      const orderData = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) {
        return res.status(orderResponse.status || 502).json({
          error: orderData?.message || orderData?.error || 'Não foi possível criar a cobrança Pix no Mercado Pago.',
          details: orderData?.cause?.[0]?.description || orderData?.cause?.[0]?.message || null
        });
      }

      const pointOfInteraction = orderData?.point_of_interaction;
      const transactionData = pointOfInteraction?.transaction_data;
      const qrCode = transactionData?.qr_code || '';
      const qrCodeBase64Raw = transactionData?.qr_code_base64 || '';
      const qrCodeBase64 = qrCodeBase64Raw ? `data:image/png;base64,${qrCodeBase64Raw}` : '';
      const ticketUrl = transactionData?.ticket_url || '';

      return res.status(201).json({
        pedido_id: pedido.id,
        checkout: {
          id: orderData.id,
          externalId: pedido.id,
          method: 'PIX',
          gateway: 'MERCADO_PAGO',
          amount: Math.round(Number(pedido.valor_total) * 100),
          brCode: qrCode,
          brCodeBase64: qrCodeBase64,
          url: ticketUrl
        }
      });
    }

    if (metodo_pagamento === 'CARD') {
      return res.status(201).json({
        pedido_id: pedido.id,
        checkout: {
          method: 'CARD',
          gateway: 'MERCADO_PAGO',
          amount: Math.round(Number(pedido.valor_total) * 100),
          externalId: pedido.id
        }
      });
    }

    return res.status(400).json({ error: 'Método de pagamento inválido ou não suportado.' });
  } catch (error: any) {
    console.error('Erro ao criar checkout Mercado Pago:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao criar pagamento Mercado Pago.', details: error.message });
  }
}
