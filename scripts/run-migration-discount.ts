import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração de desconto nos pedidos no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260523000002_add_desconto_to_pedidos.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo SQL de migração...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração de desconto nos pedidos aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração de desconto:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
