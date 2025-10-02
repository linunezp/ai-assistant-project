require('dotenv').config();
const KnowledgeBase = require('../src/knowledge_base');

async function testKnownProject() {
  const kb = new KnowledgeBase();
  await kb.initialize();

  console.log('=== PRUEBAS CON INFORMACIÓN CONOCIDA ===\n');

  const testQueries = [
    "¿Qué hace el proyecto ai-assistant-project?",
    "¿Qué tecnologías utiliza este asistente de IA?", 
    "¿Cómo funciona la base de conocimiento?",
    "¿Qué es el GitLab client?",
    "¿Para qué sirve el script de ingest?",
    "¿Qué hace el agent.js?"
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 CONSULTA: "${query}"`);
    console.log('─'.repeat(50));
    
    try {
      const results = await kb.search(query, 5, 0.3);
      console.log(`📊 Resultados encontrados: ${results.length}`);
      
      if (results.length > 0) {
        const avgRelevance = results.reduce((s, c) => s + c.relevance_score, 0) / results.length;
        console.log(`📈 Relevancia promedio: ${avgRelevance.toFixed(3)}`);
        
        console.log('\n📄 Top 3 resultados:');
        results.slice(0, 3).forEach((result, i) => {
          console.log(`${i+1}. ${result.source.file_name} (Score: ${result.relevance_score.toFixed(3)})`);
          console.log(`   📝 ${result.content.substring(0, 120)}...`);
        });
      } else {
        console.log('❌ No se encontraron resultados');
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n=== ANÁLISIS DE CONTENIDO ESPECÍFICO ===');
  
  // Buscar archivos específicos que sabemos que deben existir
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
    
    console.log('\n📁 Archivos clave indexados:');
    const keyFilesResult = await client.query(`
      SELECT file_name, LENGTH(content) as size
      FROM documents 
      WHERE file_name IN ('README.md', 'package.json', 'agent.js', 'knowledge_base.js', 'gitlab_client.js')
      ORDER BY file_name
    `);

    keyFilesResult.rows.forEach(row => {
      const sizeKB = (row.size / 1024).toFixed(1);
      console.log(`✅ ${row.file_name} (${sizeKB} KB)`);
    });

    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('Error verificando archivos clave:', error.message);
  }
}

testKnownProject().catch(console.error);