import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260522000000_schema_inicial.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo de migração inicial...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração aplicada com sucesso! Tabelas criadas e dados de semente (frete/produtos) populados.');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração inicial no banco de dados:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
