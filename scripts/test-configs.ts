import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_j2gQ6lKNWEBZ@ep-raspy-art-acbeu77v-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    const res = await client.query('SELECT chave, valor, sensivel FROM configuracoes_sistema ORDER BY chave ASC');
    console.log('--- Configurações Salvas no Neon Postgres ---');
    console.table(res.rows.map(r => ({
      Chave: r.chave,
      ValorMascarado: r.valor ? (r.valor.length > 8 ? `${r.valor.slice(0, 4)}••••${r.valor.slice(-4)}` : '••••••••') : 'Nulo',
      Sensivel: r.sensivel
    })));
  } catch (error) {
    console.error('Erro ao ler tabela:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
