const axios = require('axios');

// Preguntas técnicas complejas para probar el asistente
const technicalQuestions = [
  {
    category: "Arquitectura",
    question: "¿Cómo funciona la arquitectura del sistema?",
    expectedKeywords: ["express", "server", "knowledge_base", "gitlab_client", "gemini"]
  },
  {
    category: "Funciones específicas", 
    question: "¿Cómo funciona la función search en knowledge_base.js?",
    expectedKeywords: ["search", "vectorial", "textual", "postgresql", "similarity"]
  },
  {
    category: "Configuración",
    question: "¿Qué variables de entorno necesita el proyecto?",
    expectedKeywords: ["GITLAB_API_URL", "GEMINI_API_KEY", "DB_HOST", "PORT"]
  },
  {
    category: "APIs y endpoints",
    question: "¿Qué endpoints tiene la API?",
    expectedKeywords: ["/ask", "/health", "POST", "express"]
  },
  {
    category: "Cliente GitLab",
    question: "¿Cómo se conecta con GitLab?",
    expectedKeywords: ["gitlab", "token", "api", "client", "axios"]
  },
  {
    category: "Gemini Integration",
    question: "¿Cómo se integra con Google Gemini?",
    expectedKeywords: ["gemini", "api", "temperature", "prompt"]
  },
  {
    category: "Base de datos",
    question: "¿Cómo se almacenan los embeddings?",
    expectedKeywords: ["postgresql", "pgvector", "document_chunks", "embedding"]
  },
  {
    category: "Procesamiento",
    question: "¿Cómo se procesan los chunks de texto?",
    expectedKeywords: ["chunks", "embedding", "similarity", "vector"]
  },
  {
    category: "Error handling",
    question: "¿Cómo maneja errores la aplicación?",
    expectedKeywords: ["try", "catch", "error", "log", "retry"]
  },
  {
    category: "Docker setup",
    question: "¿Cómo se configura con Docker?",
    expectedKeywords: ["docker", "compose", "postgresql", "pgvector", "port"]
  }
];

async function testTechnicalQuestions() {
  console.log('🔧 TESTING TECHNICAL QUESTIONS CAPABILITY\n');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (let i = 0; i < technicalQuestions.length; i++) {
    const test = technicalQuestions[i];
    console.log(`\n${i + 1}. Testing: ${test.category}`);
    console.log(`❓ Question: ${test.question}`);
    
    try {
      const startTime = Date.now();
      const response = await axios.post('http://localhost:3000/ask', {
        prompt: test.question
      }, {
        timeout: 30000
      });
      
      const duration = Date.now() - startTime;
      const answer = response.data.response?.answer || 'No answer';
      const sources = response.data.response?.metadata?.sources_used || [];
      
      // Check if expected keywords are present
      const foundKeywords = test.expectedKeywords.filter(keyword => 
        answer.toLowerCase().includes(keyword.toLowerCase())
      );
      
      const score = Math.round((foundKeywords.length / test.expectedKeywords.length) * 100);
      
      console.log(`✅ Response time: ${duration}ms`);
      console.log(`📊 Keyword score: ${score}% (${foundKeywords.length}/${test.expectedKeywords.length})`);
      console.log(`📝 Found keywords: ${foundKeywords.join(', ')}`);
      console.log(`📚 Sources: ${sources.length} files`);
      console.log(`📄 Answer length: ${answer.length} chars`);
      
      if (score >= 60) {
        console.log(`🎉 GOOD: Technical knowledge demonstrated`);
      } else {
        console.log(`⚠️  WEAK: Missing key technical details`);
        console.log(`❌ Missing: ${test.expectedKeywords.filter(k => !foundKeywords.includes(k)).join(', ')}`);
      }
      
      results.push({
        category: test.category,
        score,
        duration,
        foundKeywords: foundKeywords.length,
        totalKeywords: test.expectedKeywords.length,
        answerLength: answer.length,
        sources: sources.length,
        status: score >= 60 ? 'GOOD' : 'WEAK'
      });
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({
        category: test.category,
        score: 0,
        duration: 0,
        status: 'FAILED',
        error: error.message
      });
    }
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TECHNICAL CAPABILITY SUMMARY');
  console.log('='.repeat(60));
  
  const good = results.filter(r => r.status === 'GOOD').length;
  const weak = results.filter(r => r.status === 'WEAK').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  
  console.log(`✅ GOOD responses: ${good}/${results.length} (${Math.round(good/results.length*100)}%)`);
  console.log(`⚠️  WEAK responses: ${weak}/${results.length} (${Math.round(weak/results.length*100)}%)`);
  console.log(`❌ FAILED responses: ${failed}/${results.length} (${Math.round(failed/results.length*100)}%)`);
  
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`\n📈 Average keyword score: ${Math.round(avgScore)}%`);
  console.log(`⏱️  Average response time: ${Math.round(avgDuration)}ms`);
  
  if (avgScore >= 70) {
    console.log(`\n🎉 EXCELLENT: Assistant demonstrates strong technical knowledge!`);
  } else if (avgScore >= 50) {
    console.log(`\n👍 GOOD: Assistant has decent technical knowledge, but can improve`);
  } else {
    console.log(`\n⚠️  NEEDS IMPROVEMENT: Assistant lacks technical depth`);
  }
  
  console.log('\n📋 Individual Results:');
  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.category}: ${result.status} (${result.score}%)`);
  });
}

// Wait a bit for server to start, then test
setTimeout(testTechnicalQuestions, 2000);