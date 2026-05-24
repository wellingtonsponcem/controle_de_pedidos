import pool from './_db';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

function isMissingImageColumn(error: any): boolean {
  return error?.code === '42703' || String(error?.message || '').includes('imagem_url');
}

function normalizeProductRows(rows: any[]): any[] {
  return rows.map(row => ({
    ...row,
    imagem_url: row.imagem_url || null
  }));
}

async function ensureProductImageColumn(): Promise<void> {
  try {
    await pool.query('ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_url TEXT');
  } catch (error) {
    console.warn('Nao foi possivel garantir a coluna imagem_url automaticamente:', error);
  }
}

/**
 * Handler Serverless para o endpoint /api/produtos.
 * Mantem compatibilidade com bancos que ainda nao receberam a coluna imagem_url.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (method === 'GET') {
    const fetchAll = req.query.all === 'true';
    await ensureProductImageColumn();

    const queryWithImage = fetchAll
      ? `
        SELECT id, nome, versao, sabor, modelo, preco_base, imagem_url, ativo, created_at, updated_at
        FROM produtos
        ORDER BY ativo DESC, versao ASC, nome ASC, preco_base ASC
      `
      : `
        SELECT id, nome, versao, sabor, modelo, preco_base, imagem_url
        FROM produtos
        WHERE ativo = true
        ORDER BY versao ASC, nome ASC, preco_base ASC
      `;

    const queryWithoutImage = fetchAll
      ? `
        SELECT id, nome, versao, sabor, modelo, preco_base, ativo, created_at, updated_at
        FROM produtos
        ORDER BY ativo DESC, versao ASC, nome ASC, preco_base ASC
      `
      : `
        SELECT id, nome, versao, sabor, modelo, preco_base
        FROM produtos
        WHERE ativo = true
        ORDER BY versao ASC, nome ASC, preco_base ASC
      `;

    try {
      let result;
      try {
        result = await pool.query(queryWithImage);
      } catch (error: any) {
        if (!isMissingImageColumn(error)) throw error;
        result = await pool.query(queryWithoutImage);
      }

      res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=60');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(normalizeProductRows(result.rows));
    } catch (error: any) {
      console.error('Falha ao buscar catalogo de produtos no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Servico temporariamente indisponivel. Nao foi possivel conectar ao banco de dados Bemavi.',
        message: error.message
      });
    }
  }

  if (method === 'POST') {
    await ensureProductImageColumn();
    const { nome, versao, sabor, modelo, preco_base, imagem_url, ativo } = req.body;

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do pao e obrigatorio.' });
    }
    if (!versao || typeof versao !== 'string') {
      return res.status(400).json({ error: 'Versao/Tipo do pao e obrigatoria.' });
    }
    if (!sabor || typeof sabor !== 'string' || sabor.trim().length === 0) {
      return res.status(400).json({ error: 'Sabor/Ingredientes sao obrigatorios.' });
    }
    if (!modelo || typeof modelo !== 'string') {
      return res.status(400).json({ error: 'Modelo/Tamanho do pao e obrigatorio.' });
    }

    const precoNum = Number(preco_base);
    if (isNaN(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preco base do pao deve ser um valor valido nao-negativo.' });
    }

    const isAtivo = ativo !== false;
    const imageUrl = imagem_url ? String(imagem_url).trim() : null;

    try {
      let result;
      try {
        result = await pool.query(`
          INSERT INTO produtos (nome, versao, sabor, modelo, preco_base, imagem_url, ativo, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING id, nome, versao, sabor, modelo, preco_base, imagem_url, ativo
        `, [nome.trim(), versao.trim(), sabor.trim(), modelo.trim(), precoNum, imageUrl, isAtivo]);
      } catch (error: any) {
        if (!isMissingImageColumn(error)) throw error;
        result = await pool.query(`
          INSERT INTO produtos (nome, versao, sabor, modelo, preco_base, ativo, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          RETURNING id, nome, versao, sabor, modelo, preco_base, ativo
        `, [nome.trim(), versao.trim(), sabor.trim(), modelo.trim(), precoNum, isAtivo]);
      }

      return res.status(201).json({
        success: true,
        message: 'Produto cadastrado com sucesso!',
        produto: normalizeProductRows(result.rows)[0]
      });
    } catch (error: any) {
      console.error('Falha ao cadastrar produto no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Nao foi possivel cadastrar o pao. O banco de dados pode estar indisponivel.',
        details: error.message
      });
    }
  }

  if (method === 'PUT') {
    await ensureProductImageColumn();
    const { id, nome, versao, sabor, modelo, preco_base, imagem_url, ativo } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID do produto e obrigatorio para atualizacao.' });
    }
    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do pao e obrigatorio.' });
    }
    if (!versao || typeof versao !== 'string') {
      return res.status(400).json({ error: 'Versao/Tipo do pao e obrigatoria.' });
    }
    if (!sabor || typeof sabor !== 'string' || sabor.trim().length === 0) {
      return res.status(400).json({ error: 'Sabor/Ingredientes sao obrigatorios.' });
    }
    if (!modelo || typeof modelo !== 'string') {
      return res.status(400).json({ error: 'Modelo/Tamanho do pao e obrigatorio.' });
    }

    const precoNum = Number(preco_base);
    if (isNaN(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preco base do pao deve ser um valor valido nao-negativo.' });
    }

    const isAtivo = ativo === true;
    const imageUrl = imagem_url ? String(imagem_url).trim() : null;

    try {
      let result;
      try {
        result = await pool.query(`
          UPDATE produtos
          SET nome = $1, versao = $2, sabor = $3, modelo = $4, preco_base = $5, imagem_url = $6, ativo = $7, updated_at = NOW()
          WHERE id = $8
          RETURNING id, nome, versao, sabor, modelo, preco_base, imagem_url, ativo
        `, [nome.trim(), versao.trim(), sabor.trim(), modelo.trim(), precoNum, imageUrl, isAtivo, id]);
      } catch (error: any) {
        if (!isMissingImageColumn(error)) throw error;
        result = await pool.query(`
          UPDATE produtos
          SET nome = $1, versao = $2, sabor = $3, modelo = $4, preco_base = $5, ativo = $6, updated_at = NOW()
          WHERE id = $7
          RETURNING id, nome, versao, sabor, modelo, preco_base, ativo
        `, [nome.trim(), versao.trim(), sabor.trim(), modelo.trim(), precoNum, isAtivo, id]);
      }

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Produto nao encontrado para atualizacao.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Produto atualizado com sucesso!',
        produto: normalizeProductRows(result.rows)[0]
      });
    } catch (error: any) {
      console.error('Falha ao atualizar produto no Neon Postgres:', error);
      return res.status(503).json({
        error: 'Nao foi possivel atualizar o pao. O banco de dados pode estar indisponivel.',
        details: error.message
      });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ error: `Metodo ${method} nao suportado.` });
}
