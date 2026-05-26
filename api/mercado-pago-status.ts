import { markPedidoAsPaid } from './mercado-pago-webhook';
import { getSystemConfigValue } from './configuracoes';

async function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN
    || process.env.MP_ACCESS_TOKEN
    || await getSystemConfigValue('MERCADOPAGO_ACCESS_TOKEN');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodo nao permitido.' });
  }

  const paymentId = String(req.query.payment_id || '').trim();
  const pedidoId = String(req.query.pedido_id || '').trim();

  if (!paymentId || !pedidoId) {
    return res.status(400).json({ error: 'Informe payment_id e pedido_id.' });
  }

  const accessToken = await getMercadoPagoAccessToken();
  if (!accessToken) {
    return res.status(500).json({ error: 'Access Token do Mercado Pago nao configurado.' });
  }

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payment = await paymentResponse.json().catch(() => null);

  if (!paymentResponse.ok) {
    return res.status(paymentResponse.status || 502).json({
      error: 'Nao foi possivel consultar o pagamento.',
      details: payment
    });
  }

  if (payment.external_reference && String(payment.external_reference) !== pedidoId) {
    return res.status(409).json({ error: 'Pagamento nao pertence a este pedido.' });
  }

  if (payment.status === 'approved') {
    await markPedidoAsPaid(pedidoId, payment);
  }

  return res.status(200).json({
    pedido_id: pedidoId,
    payment_id: paymentId,
    approved: payment.status === 'approved',
    status: payment.status || '',
    status_detail: payment.status_detail || ''
  });
}
