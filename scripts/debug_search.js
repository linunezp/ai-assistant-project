require('dotenv').config();
const KnowledgeBase = require('../src/knowledge_base');

async function testSearch() {
  const kb = new KnowledgeBase();
  await kb.initialize();

  const testPrompts = [
    "¿Qué hace el proyecto common?",
    "Dime sobre el proyecto common",
    "Información del common",
    "common proyecto información"
  ];

  for (const prompt of testPrompts) {
    console.log(`\n=== PRUEBA: "${prompt}" ===`);
    
    // Test regex que usa el agente
    const projectMatch = /proyecto\s+([a-zA-Z0-9_\-]+)/i.exec(prompt) || /project\s+([a-zA-Z0-9_\-]+)/i.exec(prompt);
    const projectName = projectMatch ? projectMatch[1] : null;
    
    console.log(`Proyecto detectado por regex: "${projectName}"`);
    
    // Test búsqueda en KB
    try {
      const results = await kb.search(prompt, 8, 0.3);
      console.log(`Resultados encontrados: ${results.length}`);
      
      results.forEach((result, i) => {
        const score = result.relevance_score || result.combined_score || 0;
        const scoreNum = typeof score === 'number' ? score : parseFloat(score) || 0;
        console.log(`  ${i+1}. Proyecto: "${result.source.project_name}", Score: ${scoreNum.toFixed(3)}`);
        console.log(`     Archivo: ${result.source.file_name}`);
        console.log(`     Contenido: ${result.content.substring(0, 100)}...`);
      });
      
      const avgRelevance = results.length ? (results.reduce((s, c) => s + (c.relevance_score || c.combined_score || 0), 0) / results.length) : 0;
      console.log(`Relevancia promedio: ${avgRelevance.toFixed(3)}`);
      
    } catch (error) {
      console.error(`Error en búsqueda: ${error.message}`);
    }
  }
}

testSearch().catch(console.error);