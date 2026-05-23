import pool, { withTransaction } from './_db';

/**
 * Handler Serverless para o endpoint /api/taxas-maquininha
 * Permite listar e atualizar as taxas personalizadas cobradas pelas maquininhas de cartão.
 * 
 * Tratamento de Resiliência a Falhas do Banco:
 * - Se o banco estiver fora do ar ou cair no meio do request, retorna 553/503 Service Indisponível.
 * - Utiliza transações para garantir atomicidade ao atualizar múltiplas taxas.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Listar taxas da maquininha cadastradas
  // ============================================================================
  if (method === 'GET') {
    try {
      const result = await pool.query('SELECT meio_pagamento, porcentagem_taxa FROM taxas_maquininha ORDER BY meio_pagamento ASC');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(result.rows);
    } catch (error: any) {
      console.error('Falha ao buscar taxas de maquininha no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível. Não foi possível conectar ao banco de dados Bemavi.',
        details: error.message
      });
    }
  }

  // ============================================================================
  // MÉTODO PUT/POST: Atualizar taxas de maquininha de forma atômica
  // ============================================================================
  else if (method === 'PUT' || method === 'POST') {
    const { taxas } = req.body; // Espera formato: { "Débito": number, "Crédito": number } (PIX/Dinheiro sempre 0%)

    if (!taxas || typeof taxas !== 'object') {
      return res.status(400).json({ error: 'Payload inválido. Objeto taxas é obrigatório.' });
    }

    try {
      await withTransaction(async (client) => {
        for (const [meio, valor] of Object.entries(taxas)) {
          // Validar meio de pagamento
          if (!['Dinheiro', 'PIX', 'Débito', 'Crédito'].includes(meio)) {
            throw new Error(`Meio de pagamento '${meio}' inválido.`);
          }
          
          const valorNum = Number(valor);
          if (isNaN(valorNum) || valorNum < 0 || valorNum > 100) {
            throw new Error(`Valor da taxa '${valor}' para ${meio} é inválido. Deve estar entre 0% e 100%.`);
          }

          // Executar o UPDATE
          await client.query(
            'UPDATE taxas_maquininha SET porcentagem_taxa = $1, updated_at = NOW() WHERE meio_pagamento = $2',
            [valorNum, meio]
          );
        }
      });

      return res.status(200).json({ success: true, message: 'Taxas de maquininha atualizadas com sucesso!' });
    } catch (error: any) {
      console.error('Falha ao atualizar taxas de maquininha no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Não foi possível salvar as taxas de maquininha. O banco de dados pode estar indisponível.',
        details: error.message
      });
    }
  }

  // Método não suportado
  else {
    res.setHeader('Allow', ['GET', 'PUT', 'POST']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
