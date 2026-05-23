import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração de pagamentos antecipados no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260523000001_add_pago_to_pedidos.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo SQL de migração...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração de pagamentos antecipados aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração de pagamentos antecipados:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
