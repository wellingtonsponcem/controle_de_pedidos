import pool, { withTransaction } from './_db';

/**
 * Handler Serverless para o endpoint /api/taxas
 * Permite listar e atualizar as taxas de entrega para os municípios da Grande Vitória.
 * 
 * Tratamento de Resiliência a Falhas do Banco:
 * - Se o banco estiver fora do ar ou cair no meio do request, retorna 503 Service Indisponível.
 * - Utiliza transações para garantir atomicidade ao atualizar múltiplas taxas.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Listar taxas de entrega do banco
  // ============================================================================
  if (method === 'GET') {
    try {
      const result = await pool.query('SELECT municipio, valor_taxa FROM taxas_entrega ORDER BY municipio ASC');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(result.rows);
    } catch (error: any) {
      console.error('Falha ao buscar taxas de entrega no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível. Não foi possível conectar ao banco de dados Bemavi.',
        details: error.message
      });
    }
  }

  // ============================================================================
  // MÉTODO POST/PUT: Atualizar taxas de entrega de forma atômica
  // ============================================================================
  else if (method === 'POST' || method === 'PUT') {
    const { taxas } = req.body; // Espera formato: { Vitória: number, "Vila Velha": number, Serra: number }

    if (!taxas || typeof taxas !== 'object') {
      return res.status(400).json({ error: 'Payload inválido. Objeto taxas é obrigatório.' });
    }

    try {
      await withTransaction(async (client) => {
        for (const [municipio, valor] of Object.entries(taxas)) {
          // Validar município aceito
          if (!['Vitória', 'Vila Velha', 'Serra'].includes(municipio)) {
            throw new Error(`Município '${municipio}' inválido para a logística Bemavi.`);
          }
          
          const valorNum = Number(valor);
          if (isNaN(valorNum) || valorNum < 0) {
            throw new Error(`Valor de taxa '${valor}' para ${municipio} é inválido.`);
          }

          // Executar o UPDATE
          await client.query(
            'UPDATE taxas_entrega SET valor_taxa = $1, updated_at = NOW() WHERE municipio = $2',
            [valorNum, municipio]
          );
        }
      });

      return res.status(200).json({ success: true, message: 'Taxas de entrega atualizadas com sucesso!' });
    } catch (error: any) {
      console.error('Falha ao atualizar taxas de entrega no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Não foi possível salvar as taxas de entrega. O banco de dados pode estar indisponível.',
        details: error.message
      });
    }
  }

  // Método não suportado
  else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
