import pool from './_db';
import { getSystemConfigValue } from './configuracoes';

/**
 * Endpoint Serverless /api/mercado-pago-public-key
 * Retorna dinamicamente a Public Key ativa do Mercado Pago configurada
 * no banco de dados Neon ou variáveis de ambiente.
 * Evita desalinhamentos de chaves entre frontend e backend.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY 
      || await getSystemConfigValue('MERCADOPAGO_PUBLIC_KEY')
      || 'APP_USR-5c9cbe03-f1c5-4e5c-9843-ea8c6b90a1d8'; // Fallback padrão
      
    return res.status(200).json({ publicKey });
  } catch (error: any) {
    console.error('Erro ao obter Public Key do Mercado Pago:', error);
    return res.status(200).json({ publicKey: 'APP_USR-5c9cbe03-f1c5-4e5c-9843-ea8c6b90a1d8' });
  }
}
