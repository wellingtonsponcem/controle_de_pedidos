import pool, { withTransaction } from './_db';
import { getSystemConfigValue } from './configuracoes';

const ABACATEPAY_BASE_URL = 'https://api.abacatepay.com/v2';
const CARD_INSTALLMENTS_MIN_AMOUNT_IN_CENTS = 10000;
const CARD_MAX_INSTALLMENTS = 3;

type CheckoutItem = {
  produto_id?: string;
  quantidade?: number;
};

type ProductWithPrice = {
  produto_id: string;
  quantidade: number;
  nome: string;
  preco_centavos: number;
};

type PedidoCheckout = {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  valor_total: number;
  produtos: ProductWithPrice[];
};

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function toPositiveQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(quantity));
}

async function abacateRequest(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${ABACATEPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const message = typeof body?.error === 'string'
      ? body.error
      : body?.error?.message || 'Não foi possível criar o checkout na Abacate Pay.';
    throw Object.assign(new Error(message), { statusCode: response.status || 502 });
  }

  return body;
}

async function findOrCreateAbacateProduct(apiKey: string, product: ProductWithPrice) {
  const externalId = `bemavi-${product.produto_id}-${product.preco_centavos}`;
  const listResponse = await abacateRequest(
    apiKey,
    `/products/list?externalId=${encodeURIComponent(externalId)}`
  );
  const existingProduct = Array.isArray(listResponse?.data) ? listResponse.data[0] : null;
  if (existingProduct?.id) return existingProduct.id;

  const createResponse = await abacateRequest(apiKey, '/products/create', {
    method: 'POST',
    body: JSON.stringify({
      externalId,
      name: product.nome,
      price: product.preco_centavos,
      currency: 'BRL',
      description: 'Produto do catálogo Bemavi'
    })
  });

  return createResponse.data.id;
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
    const produtos: ProductWithPrice[] = [];

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
        preco_centavos: Math.round(precoUnitario * 100)
      });
    }

    const valorTotal = Math.max(0, valorProdutos + valorEntrega);
    const endereco = String(pedido.endereco || '').trim();
    const observacaoParts = [
      pedido.observacao ? String(pedido.observacao).trim() : null,
      `Origem: catálogo público`,
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
        null,
        clienteId
      ]);
    } else {
      const insertClienteRes = await client.query(`
        INSERT INTO clientes (nome, telefone, email, logradouro, numero, complemento, bairro, municipio)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      `, [
        String(cliente.nome).trim(),
        String(cliente.telefone).trim(),
        null,
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
        [pedidoCriado.id, item.produto_id, item.quantidade, item.preco_centavos / 100]
      );
    }

    const checkoutProducts = [...produtos];
    if (valorEntrega > 0) {
      checkoutProducts.push({
        produto_id: `entrega-${municipioEntrega}`,
        quantidade: 1,
        nome: `Entrega Bemavi - ${municipioEntrega}`,
        preco_centavos: Math.round(valorEntrega * 100)
      });
    }

    return {
      id: pedidoCriado.id,
      cliente_nome: String(cliente.nome).trim(),
      cliente_telefone: String(cliente.telefone).trim(),
      valor_total: Number(pedidoCriado.valor_total),
      produtos: checkoutProducts
    };
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const apiKey = process.env.ABACATEPAY_API_KEY
    || process.env.ABACATE_PAY_API_KEY
    || process.env.ABACATE_API_KEY
    || await getSystemConfigValue('ABACATEPAY_API_KEY');
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da Abacate Pay não configurada no servidor.' });
  }

  const { itens, metodo_pagamento } = req.body || {};
  const paymentMethod = metodo_pagamento === 'CARD' ? 'CARD' : 'PIX';
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
    const amountInCents = Math.round(pedido.valor_total * 100);
    const productNames = pedido.produtos.map(item => `${item.quantidade}x ${item.nome}`);

    if (amountInCents <= 0) {
      return res.status(400).json({ error: 'O valor da cobrança precisa ser maior que zero.' });
    }

    if (paymentMethod === 'CARD') {
      const checkoutItems = [];
      for (const product of pedido.produtos) {
        checkoutItems.push({
          id: await findOrCreateAbacateProduct(apiKey, product),
          quantity: product.quantidade
        });
      }

      const origin = req.headers.origin || process.env.APP_URL || 'https://bemavi.vercel.app';
      const checkoutResponse = await abacateRequest(apiKey, '/checkouts/create', {
        method: 'POST',
        body: JSON.stringify({
          items: checkoutItems,
          methods: ['CARD'],
          externalId: pedido.id,
          returnUrl: origin,
          completionUrl: origin,
          card: {
            maxInstallments: amountInCents >= CARD_INSTALLMENTS_MIN_AMOUNT_IN_CENTS ? CARD_MAX_INSTALLMENTS : 1
          },
          metadata: {
            origem: 'catalogo_publico',
            pedido_id: pedido.id,
            cliente: pedido.cliente_nome,
            telefone: normalizePhone(pedido.cliente_telefone),
            pedido: productNames.join(', ')
          }
        })
      });

      return res.status(201).json({
        pedido_id: pedido.id,
        checkout: {
          ...checkoutResponse.data,
          externalId: pedido.id,
          method: 'CARD'
        }
      });
    }

    const responseBody = await abacateRequest(apiKey, '/transparents/create', {
      method: 'POST',
      body: JSON.stringify({
        method: 'PIX',
        data: {
          amount: amountInCents,
          expiresIn: 86400,
          description: `Pedido Bemavi - ${pedido.cliente_nome}`,
          externalId: pedido.id,
          customer: {
            name: pedido.cliente_nome,
            cellphone: normalizePhone(pedido.cliente_telefone)
          },
          metadata: {
            origem: 'catalogo_publico',
            pedido_id: pedido.id,
            pedido: productNames.join(', ')
          }
        }
      })
    });

    return res.status(201).json({
      pedido_id: pedido.id,
      checkout: {
        ...responseBody.data,
        externalId: pedido.id,
        method: 'PIX'
      }
    });
  } catch (error: any) {
    console.error('Erro ao criar checkout Abacate Pay:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao criar pagamento online.', details: error.message });
  }
}
