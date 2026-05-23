import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração de consignações no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260522000003_create_consignations.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo de migração de consignações...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração de consignações aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração de consignações:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
