const { Pool } = require('pg');

async function checkReadmeChunks() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });
  
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        d.file_name,
        d.project_name,
        dc.chunk_text,
        LENGTH(dc.chunk_text) as chunk_length
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.file_name ILIKE '%readme%'
      ORDER BY dc.id
    `);
    
    console.log('=== README CHUNKS IN DATABASE ===');
    console.log(`Total README chunks: ${result.rows.length}`);
    
    result.rows.forEach((row, i) => {
      console.log(`\n--- Chunk ${i+1} ---`);
      console.log(`File: ${row.file_name}`);
      console.log(`Project: ${row.project_name}`);
      console.log(`Length: ${row.chunk_length}`);
      console.log(`Content: ${row.chunk_text.substring(0, 300)}...`);
    });

    // Also check what project names we have
    const projects = await client.query(`
      SELECT DISTINCT project_name, COUNT(*) as chunk_count
      FROM documents d
      JOIN document_chunks dc ON d.id = dc.document_id
      GROUP BY project_name
      ORDER BY project_name
    `);
    
    console.log('\n=== PROJECTS IN DATABASE ===');
    projects.rows.forEach(row => {
      console.log(`${row.project_name}: ${row.chunk_count} chunks`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

// Load environment variables
require('dotenv').config();
checkReadmeChunks().catch(console.error);