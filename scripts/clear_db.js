require('dotenv').config();
const { Pool } = require('pg');

async function clearDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    console.log('🗑️  Limpiando base de datos...');
    
    // Eliminar todos los chunks y documentos
    await client.query('DELETE FROM document_chunks');
    await client.query('DELETE FROM documents');
    
    console.log('✅ Base de datos limpiada exitosamente');
    
    // Mostrar estadísticas
    const docsResult = await client.query('SELECT COUNT(*) as count FROM documents');
    const chunksResult = await client.query('SELECT COUNT(*) as count FROM document_chunks');
    
    console.log(`📊 Documentos restantes: ${docsResult.rows[0].count}`);
    console.log(`📊 Chunks restantes: ${chunksResult.rows[0].count}`);
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error limpiando base de datos:', error.message);
  }
}

clearDatabase();