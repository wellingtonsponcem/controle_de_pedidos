import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_j2gQ6lKNWEBZ@ep-raspy-art-acbeu77v-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// O Pool gerencia o reaproveitamento de conexões entre chamadas serverless na Vercel Hobby
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Necessário para a nuvem segura do Neon Postgres
  },
  max: 10, // Limite conservador para evitar estourar o pooler PgBouncer
  idleTimeoutMillis: 15000, // Libera conexões inativas rapidamente
  connectionTimeoutMillis: 3000, // Timeout rápido para respostas ágeis
});

// Registrar log de erros no pool global para monitoramento
pool.on('error', (err) => {
  console.error('Erro inesperado no Pool do Neon Postgres:', err);
});

/**
 * Executa uma operação dentro de uma transação SQL atômica e resiliente.
 * Garante que se houver queda de conexão ou erro de lógica no meio, 
 * o ROLLBACK será acionado e a conexão será devolvida limpa ao pool.
 * 
 * Trade-offs desta abordagem:
 * - Prós: Garante atomicidade absoluta (sem dados órfãos).
 * - Contras: Mantém a conexão travada durante toda a execução da callback (mantenha a lógica rápida!).
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Falha crítica ao tentar executar ROLLBACK:', rollbackError);
    }
    throw error; // Repassa o erro original para tratamento no handler do endpoint
  } finally {
    client.release(); // Liberação explícita da conexão de volta ao pool (evita vazamento de conexões/memória)
  }
}

export default pool;
