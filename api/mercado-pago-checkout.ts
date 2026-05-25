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
    throw Object.assign(new Error('Endereço é obrigatório para entrega.'), { statusCode: 400 });
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

  const { itens } = req.body || {};

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
    const origin = req.headers.origin || process.env.APP_URL || 'https://bemavi.vercel.app';
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      || process.env.ABACATEPAY_WEBHOOK_SECRET
      || await getSystemConfigValue('MERCADOPAGO_WEBHOOK_SECRET')
      || await getSystemConfigValue('ABACATEPAY_WEBHOOK_SECRET');

    // Montando itens detalhados para exibição elegante no checkout oficial
    const mpItems = pedido.produtos.map(item => ({
      title: item.nome,
      quantity: Number(item.quantidade),
      unit_price: Number(item.preco_unitario),
      currency_id: 'BRL'
    }));

    // Se houver valor de entrega, insere como item adicional
    const taxaQuery = await pool.query('SELECT valor_entrega FROM pedidos WHERE id = $1', [pedido.id]);
    const valorEntrega = taxaQuery.rows.length > 0 ? Number(taxaQuery.rows[0].valor_entrega) : 0;
    if (valorEntrega > 0) {
      mpItems.push({
        title: 'Taxa de Entrega (Logística Bemavi)',
        quantity: 1,
        unit_price: valorEntrega,
        currency_id: 'BRL'
      });
    }

    const backUrls = {
      success: `${origin}/catalogo.html?status=success&pedidoId=${pedido.id}`,
      failure: `${origin}/catalogo.html?status=failure&pedidoId=${pedido.id}`,
      pending: `${origin}/catalogo.html?status=pending&pedidoId=${pedido.id}`
    };

    const mercadoResponse = await fetch('https://api.mercadopago.com/v1/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: mpItems,
        payer: {
          name: pedido.cliente_nome,
          email: emailFromPhone(pedido.cliente_telefone),
          phone: {
            number: pedido.cliente_telefone
          }
        },
        back_urls: backUrls,
        auto_return: 'approved',
        notification_url: webhookSecret
          ? `${origin}/api/mercado-pago-webhook?webhookSecret=${encodeURIComponent(webhookSecret)}`
          : undefined,
        external_reference: pedido.id
      })
    });

    const body = await mercadoResponse.json().catch(() => null);
    if (!mercadoResponse.ok) {
      return res.status(mercadoResponse.status || 502).json({
        error: body?.message || body?.error || 'Não foi possível criar a preferência de pagamento no Mercado Pago.',
        details: body?.cause?.[0]?.description || body?.cause?.[0]?.message || null
      });
    }

    return res.status(201).json({
      pedido_id: pedido.id,
      checkout: {
        id: body.id,
        externalId: pedido.id,
        method: 'PRO',
        gateway: 'MERCADO_PAGO',
        amount: Math.round(Number(pedido.valor_total) * 100),
        url: body.init_point
      }
    });
  } catch (error: any) {
    console.error('Erro ao criar checkout Mercado Pago:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao criar pagamento Mercado Pago.', details: error.message });
  }
}
