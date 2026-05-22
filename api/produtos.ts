import pool from './_db';

/**
 * Handler Serverless para o endpoint /api/produtos
 * Permite listar, cadastrar e editar os pães do catálogo Bemavi.
 * 
 * Tratamento de Resiliência a Falhas do Banco:
 * - Em caso de queda do Neon Postgres, retorna status HTTP 503 (Serviço Indisponível)
 *   com uma mensagem clara de erro amigável, em vez de derrubar a API ou travar o processo.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Buscar produtos (ativos apenas ou todos)
  // ============================================================================
  if (method === 'GET') {
    const fetchAll = req.query.all === 'true';

    try {
      let queryText = '';
      if (fetchAll) {
        // Traz todos os produtos (ativos e inativos) para o painel de gerenciamento
        queryText = `
          SELECT id, nome, versao, sabor, modelo, preco_base, ativo, created_at, updated_at 
          FROM produtos 
          ORDER BY ativo DESC, versao ASC, nome ASC, preco_base ASC
        `;
      } else {
        // Traz apenas os pães ativos para exibição no catálogo de compras
        queryText = `
          SELECT id, nome, versao, sabor, modelo, preco_base 
          FROM produtos 
          WHERE ativo = true 
          ORDER BY versao ASC, nome ASC, preco_base ASC
        `;
      }

      const result = await pool.query(queryText);

      res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=60'); // Cache leve
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(result.rows);
    } catch (error: any) {
      console.error('Falha ao buscar catálogo de produtos no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível. Não foi possível conectar ao banco de dados Bemavi.',
        message: error.message
      });
    }
  }

  // ============================================================================
  // MÉTODO POST: Cadastrar novo pão no catálogo
  // ============================================================================
  else if (method === 'POST') {
    const { nome, versao, sabor, modelo, preco_base, ativo } = req.body;

    // Validações básicas
    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do pão é obrigatório.' });
    }
    if (!versao || typeof versao !== 'string') {
      return res.status(400).json({ error: 'Versão/Tipo do pão é obrigatória.' });
    }
    if (!sabor || typeof sabor !== 'string' || sabor.trim().length === 0) {
      return res.status(400).json({ error: 'Sabor/Ingredientes são obrigatórios.' });
    }
    if (!modelo || typeof modelo !== 'string') {
      return res.status(400).json({ error: 'Modelo/Tamanho do pão é obrigatório.' });
    }
    
    const precoNum = Number(preco_base);
    if (isNaN(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preço base do pão deve ser um valor válido não-negativo.' });
    }

    const isAtivo = ativo !== false; // Default true se não for explicitamente falso

    try {
      const queryText = `
        INSERT INTO produtos (nome, versao, sabor, modelo, preco_base, ativo, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, nome, versao, sabor, modelo, preco_base, ativo
      `;
      const result = await pool.query(queryText, [
        nome.trim(),
        versao.trim(),
        sabor.trim(),
        modelo.trim(),
        precoNum,
        isAtivo
      ]);

      return res.status(201).json({
        success: true,
        message: 'Produto cadastrado com sucesso!',
        produto: result.rows[0]
      });
    } catch (error: any) {
      console.error('Falha ao cadastrar produto no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Não foi possível cadastrar o pão. O banco de dados pode estar indisponível.',
        details: error.message
      });
    }
  }

  // ============================================================================
  // MÉTODO PUT: Editar produto existente
  // ============================================================================
  else if (method === 'PUT') {
    const { id, nome, versao, sabor, modelo, preco_base, ativo } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID do produto é obrigatório para atualização.' });
    }
    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do pão é obrigatório.' });
    }
    if (!versao || typeof versao !== 'string') {
      return res.status(400).json({ error: 'Versão/Tipo do pão é obrigatória.' });
    }
    if (!sabor || typeof sabor !== 'string' || sabor.trim().length === 0) {
      return res.status(400).json({ error: 'Sabor/Ingredientes são obrigatórios.' });
    }
    if (!modelo || typeof modelo !== 'string') {
      return res.status(400).json({ error: 'Modelo/Tamanho do pão é obrigatório.' });
    }
    
    const precoNum = Number(preco_base);
    if (isNaN(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preço base do pão deve ser um valor válido não-negativo.' });
    }

    const isAtivo = ativo === true; // Garante booleano estrito

    try {
      const queryText = `
        UPDATE produtos 
        SET nome = $1, versao = $2, sabor = $3, modelo = $4, preco_base = $5, ativo = $6, updated_at = NOW() 
        WHERE id = $7
        RETURNING id, nome, versao, sabor, modelo, preco_base, ativo
      `;
      const result = await pool.query(queryText, [
        nome.trim(),
        versao.trim(),
        sabor.trim(),
        modelo.trim(),
        precoNum,
        isAtivo,
        id
      ]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Produto não encontrado para atualização.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Produto atualizado com sucesso!',
        produto: result.rows[0]
      });
    } catch (error: any) {
      console.error('Falha ao atualizar produto no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Não foi possível atualizar o pão. O banco de dados pode estar indisponível.',
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

