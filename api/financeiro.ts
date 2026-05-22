import pool from './_db';

/**
 * Handler Serverless para o endpoint /api/financeiro
 * Suporta:
 * - GET: Retorna o dashboard consolidado de fluxo de caixa (total de receitas, 
 *        total de despesas, lucro líquido) e a lista das transações mais recentes.
 * - POST: Registra um lançamento manual simples de despesa (compras de insumos, embalagens, etc.)
 *         ou receitas manuais avulsas.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Dashboard Consolidado e Lista de Lançamentos
  // ============================================================================
  if (method === 'GET') {
    try {
      // 1. Obter consolidação de valores (Receitas, Despesas)
      const resumoQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0) as total_receitas,
          COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) as total_despesas
        FROM transacoes_financeiras
      `;
      const resumoResult = await pool.query(resumoQuery);
      const { total_receitas, total_despesas } = resumoResult.rows[0];
      const totalReceitas = Number(total_receitas);
      const totalDespesas = Number(total_despesas);
      const lucroLiquido = totalReceitas - totalDespesas;

      // 2. Obter lista de transações recentes (limite de 100 para otimização serverless)
      const transacoesQuery = `
        SELECT id, tipo, valor, TO_CHAR(data, 'YYYY-MM-DD') as data, descricao, categoria, pedido_id, created_at
        FROM transacoes_financeiras
        ORDER BY data DESC, created_at DESC
        LIMIT 100
      `;
      const transacoesResult = await pool.query(transacoesQuery);
      const transacoes = transacoesResult.rows.map(row => ({
        ...row,
        valor: Number(row.valor)
      }));

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      return res.status(200).json({
        resumo: {
          total_receitas: totalReceitas,
          total_despesas: totalDespesas,
          lucro_liquido: lucroLiquido
        },
        transacoes
      });
    } catch (error: any) {
      console.error('Falha ao obter dados financeiros no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível. Não foi possível carregar o dashboard financeiro.',
        message: error.message
      });
    }
  }

  // ============================================================================
  // MÉTODO POST: Cadastro de Lançamento Financeiro Manual (Compras de Insumos/Despesas)
  // ============================================================================
  else if (method === 'POST') {
    const { tipo, valor, data, descricao, categoria } = req.body;

    // Validações estritas de payload
    if (!tipo || !valor || !descricao || !categoria) {
      return res.status(400).json({ error: 'Parâmetros inválidos. Preencha tipo, valor, descrição e categoria.' });
    }

    if (tipo !== 'Receita' && tipo !== 'Despesa') {
      return res.status(400).json({ error: "Tipo inválido. Deve ser 'Receita' ou 'Despesa'." });
    }

    const valorNumerico = Number(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({ error: 'O valor da transação deve ser um número maior que zero.' });
    }

    // Tratar data: se vazia, assume CURRENT_DATE
    const dataTransacao = data ? data : new Date().toISOString().split('T')[0];

    try {
      const insertQuery = `
        INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, tipo, valor, TO_CHAR(data, 'YYYY-MM-DD') as data, descricao, categoria, created_at
      `;
      const result = await pool.query(insertQuery, [tipo, valorNumerico, dataTransacao, descricao, categoria]);
      
      const novaTransacao = {
        ...result.rows[0],
        valor: Number(result.rows[0].valor)
      };

      return res.status(201).json(novaTransacao);
    } catch (error: any) {
      console.error('Falha ao inserir transação financeira manual no Neon Postgres:', error);
      return res.status(500).json({
        error: 'Erro ao registrar lançamento financeiro.',
        details: error.message
      });
    }
  }

  // Método HTTP não suportado
  else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
