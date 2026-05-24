import pool from './_db';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const apiKey = process.env.ABACATEPAY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da Abacate Pay não configurada no servidor.' });
  }

  const { cliente, itens, metodo_pagamento } = req.body || {};
  const paymentMethod = metodo_pagamento === 'CARD' ? 'CARD' : 'PIX';
  if (!cliente?.nome || !cliente?.telefone || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe cliente e itens para gerar o pagamento online.' });
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
    let amountInCents = 0;
    const productNames: string[] = [];
    const productsWithPrice: ProductWithPrice[] = [];

    for (const item of normalizedItems) {
      const productResult = await pool.query(
        'SELECT nome, preco_base, ativo FROM produtos WHERE id = $1',
        [item.produto_id]
      );

      if (productResult.rows.length === 0 || !productResult.rows[0].ativo) {
        return res.status(400).json({ error: 'Um dos produtos selecionados não está mais disponível.' });
      }

      const product = productResult.rows[0];
      const priceInCents = Math.round(Number(product.preco_base) * 100);
      amountInCents += priceInCents * item.quantidade;
      productNames.push(`${item.quantidade}x ${product.nome}`);
      productsWithPrice.push({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        nome: product.nome,
        preco_centavos: priceInCents
      });
    }

    if (amountInCents <= 0) {
      return res.status(400).json({ error: 'O valor da cobrança precisa ser maior que zero.' });
    }

    const externalId = `bemavi-${Date.now()}`;

    if (paymentMethod === 'CARD') {
      const checkoutItems = [];
      for (const product of productsWithPrice) {
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
          externalId,
          returnUrl: origin,
          completionUrl: origin,
          card: {
            maxInstallments: amountInCents >= CARD_INSTALLMENTS_MIN_AMOUNT_IN_CENTS ? CARD_MAX_INSTALLMENTS : 1
          },
          metadata: {
            origem: 'catalogo_publico',
            cliente: String(cliente.nome).trim(),
            telefone: normalizePhone(cliente.telefone),
            pedido: productNames.join(', ')
          }
        })
      });

      return res.status(201).json({
        checkout: {
          ...checkoutResponse.data,
          externalId,
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
          description: `Pedido Bemavi - ${cliente.nome}`,
          externalId,
          customer: {
            name: String(cliente.nome).trim(),
            cellphone: normalizePhone(cliente.telefone)
          },
          metadata: {
            origem: 'catalogo_publico',
            pedido: productNames.join(', ')
          }
        }
      })
    });

    return res.status(201).json({
      checkout: {
        ...responseBody.data,
        externalId,
        method: 'PIX'
      }
    });
  } catch (error: any) {
    console.error('Erro ao criar checkout Abacate Pay:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao criar pagamento online.', details: error.message });
  }
}
