import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração de taxas de maquininha e meios de pagamento no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260523000000_add_payment_fees_and_methods.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo SQL de migração...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração de taxas de maquininha e meios de pagamento aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração de taxas de maquininha:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
