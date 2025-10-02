const KnowledgeBase = require('../src/knowledge_base');

async function directSearchTest() {
  require('dotenv').config();
  
  try {
    const kb = new KnowledgeBase();
    await kb.initialize();
    
    const query = "¿Qué hace el proyecto ai-assistant-project?";
    console.log('=== DIRECT SEARCH TEST ===');
    console.log(`Query: ${query}`);
    
    const results = await kb.search(query, 5);
    
    console.log(`\n📊 Results returned: ${results.length}`);
    console.log(`📊 Results type: ${typeof results}`);
    
    if (results.length > 0) {
      console.log('\n📄 First result structure:');
      console.log(JSON.stringify(results[0], null, 2));
      
      console.log('\n📄 All results:');
      results.forEach((result, i) => {
        console.log(`\n${i+1}. File: ${result.source?.file_name || 'unknown'}`);
        console.log(`   Score: ${result.relevance_score} (type: ${typeof result.relevance_score})`);
        console.log(`   Content: ${result.content?.substring(0, 100) || 'no content'}...`);
        console.log(`   Type: ${result.search_type || 'unknown'}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

directSearchTest();