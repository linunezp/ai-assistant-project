require('dotenv').config();
const KnowledgeBase = require('../src/knowledge_base');

async function testProjectPurpose() {
  const kb = new KnowledgeBase();
  await kb.initialize();

  console.log('=== PRUEBA DE CONSULTA SOBRE PROPÓSITO DEL PROYECTO ===\n');

  const query = "¿Qué hace el proyecto ai-assistant-project?";
  console.log(`🔍 CONSULTA: "${query}"`);
  console.log('─'.repeat(60));
  
  try {
    const results = await kb.search(query, 8, 0.3);
    console.log(`📊 Resultados encontrados: ${results.length}`);
    
    if (results.length > 0) {
      const avgRelevance = results.reduce((s, c) => s + c.relevance_score, 0) / results.length;
      console.log(`📈 Relevancia promedio: ${avgRelevance.toFixed(3)}`);
      
      console.log('\n📄 Todos los resultados:');
      results.forEach((result, i) => {
        const score = result.relevance_score || 0;
        console.log(`\n${i+1}. ${result.source.file_name} (Score: ${score.toFixed(3)})`);
        console.log(`   📁 Ruta: ${result.source.file_path}`);
        console.log(`   📝 Contenido: ${result.content.substring(0, 200)}...`);
        console.log(`   🔍 Tipo: ${result.search_type || 'unknown'}`);
      });
    } else {
      console.log('❌ No se encontraron resultados');
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
  
  // También verificar si el README está en la base de datos y qué contiene
  console.log('\n=== VERIFICACIÓN DE README.md ===');
  
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    const readmeResult = await client.query(`
      SELECT d.file_name, LENGTH(d.content) as size, d.content
      FROM documents d
      WHERE d.file_name ILIKE '%readme%'
      LIMIT 1
    `);

    if (readmeResult.rows.length > 0) {
      const readme = readmeResult.rows[0];
      console.log(`✅ README encontrado: ${readme.file_name} (${readme.size} chars)`);
      console.log(`📝 Primeros 500 caracteres:`);
      console.log(readme.content.substring(0, 500) + '...');
      
      // Ver chunks del README
      console.log('\n📦 Chunks del README:');
      const chunksResult = await client.query(`
        SELECT dc.chunk_text, LENGTH(dc.chunk_text) as chunk_size
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.file_name ILIKE '%readme%'
        ORDER BY dc.chunk_index
        LIMIT 3
      `);
      
      chunksResult.rows.forEach((chunk, i) => {
        console.log(`\nChunk ${i+1} (${chunk.chunk_size} chars):`);
        console.log(chunk.chunk_text.substring(0, 200) + '...');
      });
      
    } else {
      console.log('❌ No se encontró README.md');
    }

    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('Error verificando README:', error.message);
  }
}

testProjectPurpose().catch(console.error);