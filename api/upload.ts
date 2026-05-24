import crypto from 'crypto';

/**
 * Utilitário Criptográfico do Cloudinary
 * Ordena os parâmetros alfabeticamente pelas chaves, monta a query string de assinatura,
 * concatena com o segredo da API do Cloudinary e calcula o hash SHA-1 correspondente.
 */
export function gerarAssinaturaCloudinary(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const parameterString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const signatureStringToSign = `${parameterString}${apiSecret}`;
  
  return crypto
    .createHash('sha1')
    .update(signatureStringToSign)
    .digest('hex');
}

/**
 * Configuração de limite de tamanho de payload para o Vercel Serverless.
 * Permite imagens de até 4.5 MB via corpo da requisição JSON.
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
};

/**
 * Handler Serverless para o endpoint /api/upload
 * Processa de forma assíncrona o upload seguro de imagens para o Cloudinary
 * usando credenciais privadas no backend com assinatura SHA-1.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Método ${req.method} não suportado.` });
  }

  const { file } = req.body;

  if (!file || typeof file !== 'string' || !file.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Arquivo de imagem inválido ou ausente. Certifique-se de enviar uma imagem codificada em Base64 (Data URI).' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Resiliência a Falhas de Configuração:
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Configuração de credenciais do Cloudinary incompleta no arquivo .env');
    return res.status(503).json({
      error: 'Serviço de upload temporariamente indisponível.',
      details: 'Credenciais do serviço de nuvem de imagens não configuradas.'
    });
  }

  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'bemavi';

    // Gera a assinatura de upload segura através da nossa utilidade criptográfica
    const signature = gerarAssinaturaCloudinary({ folder, timestamp }, apiSecret);


    // Fazemos a chamada direta HTTPS REST API do Cloudinary, sem bibliotecas pesadas de terceiros
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: file,
        api_key: apiKey,
        timestamp: timestamp,
        signature: signature,
        folder: folder,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Falha de resposta da API do Cloudinary:', errorData);
      return res.status(502).json({
        error: 'Erro ao processar imagem no provedor de nuvem.',
        details: errorData.error?.message || 'Erro desconhecido do Cloudinary.'
      });
    }

    const data = await response.json();

    // Retorna a URL permanente da imagem segura (HTTPS) e o ID público da imagem
    return res.status(200).json({
      success: true,
      url: data.secure_url,
      public_id: data.public_id
    });

  } catch (error: any) {
    console.error('Erro excepcional durante o upload seguro no backend:', error);
    return res.status(500).json({
      error: 'Erro interno ao realizar o upload da imagem.',
      message: error.message
    });
  }
}
