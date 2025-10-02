const axios = require('axios');

async function testAPI() {
  try {
    console.log('🔍 Testing the API with project purpose question...');
    
    const response = await axios.post('http://localhost:3000/ask', {
      prompt: '¿Qué hace el proyecto ai-assistant-project?'
    }, {
      timeout: 30000
    });
    
    console.log('\n✅ API Response received!');
    console.log('📊 Status:', response.status);
    console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Wait a bit for server to start, then test
setTimeout(testAPI, 3000);