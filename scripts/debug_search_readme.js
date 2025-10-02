const { Pool } = require('pg');

async function debugSearch() {
  // Load environment variables
  require('dotenv').config();
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });
  
  const client = await pool.connect();
  
  try {
    // Test the specific query that should find README content
    const query = "¿Qué hace el proyecto ai-assistant-project?";
    
    console.log('=== DEBUGGING SEARCH FOR README CONTENT ===');
    console.log(`Query: ${query}`);
    
    // Check what README chunks exist
    const readmeResult = await client.query(`
      SELECT 
        d.file_name,
        dc.chunk_text,
        LENGTH(dc.chunk_text) as chunk_length
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.file_name ILIKE '%readme%'
        AND d.project_name ILIKE '%ai-assistant-project%'
      ORDER BY LENGTH(dc.chunk_text) DESC
      LIMIT 3
    `);
    
    console.log(`\n📄 README chunks found: ${readmeResult.rows.length}`);
    
    readmeResult.rows.forEach((row, i) => {
      console.log(`\n--- README Chunk ${i+1} (${row.chunk_length} chars) ---`);
      console.log(row.chunk_text.substring(0, 200) + '...');
    });
    
    // Test direct text search on README
    const textSearchResult = await client.query(`
      SELECT 
        d.file_name,
        dc.chunk_text,
        ts_rank(to_tsvector('spanish', dc.chunk_text), plainto_tsquery('spanish', $1)) as text_score
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.file_name ILIKE '%readme%'
        AND d.project_name ILIKE '%ai-assistant-project%'
        AND to_tsvector('spanish', dc.chunk_text) @@ plainto_tsquery('spanish', $1)
      ORDER BY text_score DESC
      LIMIT 5
    `, [query]);
    
    console.log(`\n🔍 Text search results: ${textSearchResult.rows.length}`);
    textSearchResult.rows.forEach((row, i) => {
      console.log(`${i+1}. Score: ${row.text_score.toFixed(3)} - ${row.chunk_text.substring(0, 100)}...`);
    });
    
    // Test the project-specific purpose search
    const purposeSearchResult = await client.query(`
      SELECT 
        d.file_name,
        dc.chunk_text,
        0.8 as similarity_score
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_name ILIKE $1
        AND (d.file_name ILIKE '%readme%' 
             OR d.file_name ILIKE '%package.json%'
             OR d.file_name ILIKE '%.md%'
             OR d.file_path ILIKE '%doc%'
             OR dc.chunk_text ILIKE '%descripción%'
             OR dc.chunk_text ILIKE '%propósito%'
             OR dc.chunk_text ILIKE '%asistente%'
             OR dc.chunk_text ILIKE '%proyecto%')
      ORDER BY 
        CASE 
          WHEN d.file_name ILIKE '%readme%' THEN 1
          WHEN d.file_name ILIKE '%package.json%' THEN 2
          WHEN d.file_name ILIKE '%.md%' THEN 3
          ELSE 4
        END,
        LENGTH(dc.chunk_text) DESC
      LIMIT 5
    `, ['%ai-assistant-project%']);
    
    console.log(`\n🎯 Purpose search results: ${purposeSearchResult.rows.length}`);
    purposeSearchResult.rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.file_name} - ${row.chunk_text.substring(0, 100)}...`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

debugSearch().catch(console.error);