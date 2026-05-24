import pool, { withTransaction } from './_db';

const SECRET_KEYS = [
  'ABACATEPAY_API_KEY',
  'ABACATEPAY_WEBHOOK_SECRET',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'GROQ_API_KEY'
];

async function ensureConfigTables() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
      chave VARCHAR(80) PRIMARY KEY,
      valor TEXT NOT NULL,
      sensivel BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios_sistema (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nome VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      perfil VARCHAR(40) NOT NULL DEFAULT 'Operador',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function getSystemConfigValue(chave: string) {
  await ensureConfigTables();
  const result = await pool.query(
    'SELECT valor FROM configuracoes_sistema WHERE chave = $1',
    [chave]
  );
  return result.rows[0]?.valor || null;
}

export default async function handler(req: any, res: any) {
  await ensureConfigTables();

  if (req.method === 'GET') {
    const configsResult = await pool.query(
      'SELECT chave, valor, sensivel, updated_at FROM configuracoes_sistema ORDER BY chave ASC'
    );
    const usuariosResult = await pool.query(
      'SELECT id, nome, email, perfil, ativo, created_at, updated_at FROM usuarios_sistema ORDER BY created_at DESC'
    );

    const configuracoes = configsResult.rows.reduce((acc: Record<string, any>, item) => {
      acc[item.chave] = {
        configured: Boolean(item.valor),
        value: item.sensivel ? maskSecret(item.valor) : item.valor,
        updated_at: item.updated_at
      };
      return acc;
    }, {});

    for (const key of SECRET_KEYS) {
      if (!configuracoes[key]) {
        configuracoes[key] = { configured: false, value: null, updated_at: null };
      }
    }

    return res.status(200).json({
      configuracoes,
      usuarios: usuariosResult.rows
    });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const { configuracoes = {}, usuario } = req.body || {};

    try {
      const result = await withTransaction(async (client) => {
        for (const key of SECRET_KEYS) {
          const value = typeof configuracoes[key] === 'string' ? configuracoes[key].trim() : '';
          if (!value) continue;

          await client.query(`
            INSERT INTO configuracoes_sistema (chave, valor, sensivel, updated_at)
            VALUES ($1, $2, TRUE, NOW())
            ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, sensivel = TRUE, updated_at = NOW()
          `, [key, value]);
        }

        if (usuario?.nome && usuario?.email) {
          await client.query(`
            INSERT INTO usuarios_sistema (nome, email, perfil, ativo, updated_at)
            VALUES ($1, $2, $3, TRUE, NOW())
            ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, perfil = EXCLUDED.perfil, ativo = TRUE, updated_at = NOW()
          `, [
            String(usuario.nome).trim(),
            String(usuario.email).trim().toLowerCase(),
            usuario.perfil || 'Operador'
          ]);
        }

        return true;
      });

      return res.status(200).json({ success: result });
    } catch (error: any) {
      console.error('Erro ao salvar configurações do sistema:', error);
      return res.status(500).json({ error: 'Erro ao salvar configurações.', details: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ error: `Método ${req.method} não suportado.` });
}
