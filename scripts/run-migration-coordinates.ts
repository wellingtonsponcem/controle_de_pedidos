import * as fs from 'fs';
import * as path from 'path';
import pool from '../api/_db';

async function main() {
  console.log('🚀 Iniciando aplicação de migração de coordenadas no Neon Postgres...');
  const migrationPath = path.join(__dirname, '../neon/migrations/20260522000002_add_coordinates_to_clientes.sql');

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Lendo arquivo de migração de coordenadas...');
    
    console.log('⚡ Executando migração no Neon Postgres...');
    await pool.query(sql);
    
    console.log('✨ Migração de coordenadas aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Falha crítica ao aplicar migração de coordenadas:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
