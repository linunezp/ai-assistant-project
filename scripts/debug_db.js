require('dotenv').config();
const { Pool } = require('pg');

async function checkProjects() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    console.log('=== NOMBRES DE PROYECTO ALMACENADOS ===');
    const projectsResult = await client.query(`
      SELECT DISTINCT project_name, COUNT(*) as doc_count 
      FROM documents 
      GROUP BY project_name 
      ORDER BY doc_count DESC
    `);
    
    projectsResult.rows.forEach(row => {
      console.log(`Proyecto: "${row.project_name}" -> ${row.doc_count} documentos`);
    });

    console.log('\n=== DOCUMENTOS DEL PROYECTO "common" ===');
    const commonDocsResult = await client.query(`
      SELECT file_path, file_name 
      FROM documents 
      WHERE project_name ILIKE '%common%' 
      LIMIT 10
    `);
    
    commonDocsResult.rows.forEach(row => {
      console.log(`- ${row.file_path}`);
    });

    console.log('\n=== CHUNKS DEL PROYECTO "common" ===');
    const commonChunksResult = await client.query(`
      SELECT COUNT(*) as chunk_count
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_name ILIKE '%common%'
    `);
    
    console.log(`Total chunks de "common": ${commonChunksResult.rows[0]?.chunk_count || 0}`);

    console.log('\n=== BÚSQUEDA DE EJEMPLO ===');
    const searchResult = await client.query(`
      SELECT d.project_name, d.file_name, dc.chunk_text
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_name ILIKE '%common%'
      AND dc.chunk_text ILIKE '%common%'
      LIMIT 3
    `);
    
    searchResult.rows.forEach((row, i) => {
      console.log(`${i+1}. Proyecto: "${row.project_name}", Archivo: ${row.file_name}`);
      console.log(`   Texto: ${row.chunk_text.substring(0, 100)}...`);
    });

    client.release();
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkProjects();