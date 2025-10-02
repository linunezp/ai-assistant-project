const KnowledgeBase = require('../src/knowledge_base');

async function testDatabaseQueryWithProject() {
  require('dotenv').config();
  
  try {
    const kb = new KnowledgeBase();
    await kb.initialize();
    
    // Test with project specific query
    const query = "¿Qué base de datos utiliza el proyecto ai-assistant-project?";
    console.log('=== DATABASE QUERY WITH PROJECT TEST ===');
    console.log(`Query: ${query}`);
    
    const results = await kb.search(query, 8);
    
    console.log(`\n📊 Results returned: ${results.length}`);
    
    if (results.length > 0) {
      console.log('\n📄 Search results:');
      results.forEach((result, i) => {
        console.log(`\n${i+1}. File: ${result.source?.file_name || 'unknown'}`);
        console.log(`   Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
        console.log(`   Content: ${result.content?.substring(0, 200) || 'no content'}...`);
        console.log(`   Type: ${result.search_type || 'unknown'}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDatabaseQueryWithProject();