import pool from './_db';

/**
 * Handler Serverless para o endpoint /api/produtos
 * Retorna a listagem do catálogo de pães Bemavi ativos para exibição no frontend e PWA.
 * 
 * Tratamento de Resiliência a Falhas do Banco:
 * - Em caso de queda do Neon Postgres, retorna status HTTP 503 (Serviço Indisponível) 
 *   com uma mensagem clara de erro amigável, em vez de derrubar a API ou travar o processo.
 */
export default async function handler(req: any, res: any) {
  // Garantir apenas requisições do tipo GET no catálogo
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Método ${req.method} não suportado.` });
  }

  try {
    const queryText = `
      SELECT id, nome, versao, sabor, modelo, preco_base 
      FROM produtos 
      WHERE ativo = true 
      ORDER BY versao ASC, nome ASC, preco_base ASC
    `;
    const result = await pool.query(queryText);

    // Definir cabeçalhos HTTP para otimização de caching e PWA
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); // Cache dinâmico leve
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    return res.status(200).json(result.rows);
  } catch (error: any) {
    console.error('Falha crítica ao buscar catálogo de produtos no Neon Postgres:', error);
    
    // Fallback de queda de banco de dados
    return res.status(503).json({
      error: 'Serviço temporariamente indisponível. Não foi possível conectar ao banco de dados Bemavi.',
      message: error.message
    });
  }
}
