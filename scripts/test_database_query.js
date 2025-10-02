const KnowledgeBase = require('../src/knowledge_base');

async function testDatabaseQuery() {
  require('dotenv').config();
  
  try {
    const kb = new KnowledgeBase();
    await kb.initialize();
    
    const query = "¿Qué base de datos utiliza el proyecto?";
    console.log('=== DATABASE QUERY TEST ===');
    console.log(`Query: ${query}`);
    
    const results = await kb.search(query, 8);
    
    console.log(`\n📊 Results returned: ${results.length}`);
    
    if (results.length > 0) {
      console.log('\n📄 Search results:');
      results.forEach((result, i) => {
        console.log(`\n${i+1}. File: ${result.source?.file_name || 'unknown'}`);
        console.log(`   Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
        console.log(`   Content: ${result.content?.substring(0, 150) || 'no content'}...`);
        console.log(`   Type: ${result.search_type || 'unknown'}`);
      });
    }
    
    // Also search for PostgreSQL specifically
    console.log('\n=== POSTGRESQL SPECIFIC SEARCH ===');
    const pgResults = await kb.search("PostgreSQL pgvector database", 5);
    
    console.log(`\n📊 PostgreSQL results: ${pgResults.length}`);
    pgResults.forEach((result, i) => {
      console.log(`\n${i+1}. File: ${result.source?.file_name || 'unknown'}`);
      console.log(`   Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
      console.log(`   Content: ${result.content?.substring(0, 150) || 'no content'}...`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDatabaseQuery();