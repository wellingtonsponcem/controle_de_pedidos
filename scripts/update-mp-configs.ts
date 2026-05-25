import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_j2gQ6lKNWEBZ@ep-raspy-art-acbeu77v-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  console.log('Iniciando conexão com Neon Postgres para salvar configurações do Mercado Pago...');
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    // Garantir que a tabela existe antes
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave VARCHAR(80) PRIMARY KEY,
        valor TEXT NOT NULL,
        sensivel BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const configs = [
      {
        chave: 'MERCADOPAGO_ACCESS_TOKEN',
        valor: 'APP_USR-1864448452508495-052412-87a42fd1d814a2fe24218a973d86cfa-32619619'
      },
      {
        chave: 'MERCADOPAGO_PUBLIC_KEY',
        valor: 'APP_USR-5c9cbe03-f1c5-4e5c-9843-ea8c6b90a1d8'
      },
      {
        chave: 'MERCADOPAGO_WEBHOOK_SECRET',
        valor: 'bemavi_mercadopago_webhook_secret_production_2026'
      }
    ];

    console.log('Inserindo credenciais de produção no banco de dados...');
    for (const config of configs) {
      await client.query(`
        INSERT INTO configuracoes_sistema (chave, valor, sensivel, updated_at)
        VALUES ($1, $2, TRUE, NOW())
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, sensivel = TRUE, updated_at = NOW()
      `, [config.chave, config.valor]);
      console.log(`✅ Chave ${config.chave} configurada com sucesso.`);
    }

    console.log('Todos os parâmetros foram gravados com sucesso no banco de dados Neon Postgres.');
  } catch (error) {
    console.error('❌ Erro crítico ao gravar configurações no banco de dados:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
