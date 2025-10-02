const Agent = require('./src/agent');

async function testCompleteFlow() {
  console.log('🧪 Probando flujo completo de consultas por grupo...\n');
  
  const agent = Agent.getAgent();
  
  try {
    await agent.initialize();
    console.log('✅ Agente inicializado\n');
    
    // Probar la misma consulta en ambos grupos
    const testQuery = 'conexión a la base de datos';
    
    console.log('='.repeat(70));
    console.log(`🔍 Probando consulta: "${testQuery}"`);
    console.log('='.repeat(70));
    
    // Consulta en grupo 1585
    console.log('\n📋 CONSULTANDO EN GRUPO 1585:');
    console.log('-'.repeat(50));
    
    const response1585 = await agent.answerQuestionInGroup(testQuery, '1585');
    console.log(`📄 Respuesta grupo 1585 (${response1585.answer?.length || 0} caracteres):`);
    console.log(`"${response1585.answer?.substring(0, 200)}..."`);
    
    if (response1585.context && response1585.context.length > 0) {
      console.log(`\n📚 Contexto usado (${response1585.context.length} chunks):`);
      response1585.context.forEach((chunk, index) => {
        console.log(`  [${index + 1}] ${chunk.source?.file_name || 'Sin nombre'} (Grupo: ${chunk.source?.group_id || 'N/A'})`);
      });
    }
    
    // Consulta en grupo 890
    console.log('\n📋 CONSULTANDO EN GRUPO 890:');
    console.log('-'.repeat(50));
    
    const response890 = await agent.answerQuestionInGroup(testQuery, '890');
    console.log(`📄 Respuesta grupo 890 (${response890.answer?.length || 0} caracteres):`);
    console.log(`"${response890.answer?.substring(0, 200)}..."`);
    
    if (response890.context && response890.context.length > 0) {
      console.log(`\n📚 Contexto usado (${response890.context.length} chunks):`);
      response890.context.forEach((chunk, index) => {
        console.log(`  [${index + 1}] ${chunk.source?.file_name || 'Sin nombre'} (Grupo: ${chunk.source?.group_id || 'N/A'})`);
      });
    }
    
    // Comparar respuestas
    console.log('\n' + '='.repeat(70));
    console.log('📊 ANÁLISIS COMPARATIVO');
    console.log('='.repeat(70));
    
    const group1585Sources = new Set(
      (response1585.context || []).map(c => c.source?.group_id).filter(g => g)
    );
    const group890Sources = new Set(
      (response890.context || []).map(c => c.source?.group_id).filter(g => g)
    );
    
    console.log(`🔍 Grupos en contexto 1585: [${Array.from(group1585Sources).join(', ')}]`);
    console.log(`🔍 Grupos en contexto 890: [${Array.from(group890Sources).join(', ')}]`);
    
    // Verificar si las respuestas son diferentes
    const responses_are_different = response1585.answer !== response890.answer;
    console.log(`📋 ¿Respuestas diferentes?: ${responses_are_different ? '✅ SÍ' : '❌ NO'}`);
    
    if (!responses_are_different) {
      console.log('⚠️  Las respuestas son idénticas, esto podría indicar un problema');
    }
    
    // Verificar contaminación cruzada
    const contamination1585 = (response1585.context || []).filter(c => c.source?.group_id !== '1585');
    const contamination890 = (response890.context || []).filter(c => c.source?.group_id !== '890');
    
    if (contamination1585.length > 0) {
      console.log(`❌ PROBLEMA: Contexto grupo 1585 contiene ${contamination1585.length} chunks de otros grupos`);
      contamination1585.forEach(c => {
        console.log(`   - ${c.source?.file_name} (grupo: ${c.source?.group_id})`);
      });
    }
    
    if (contamination890.length > 0) {
      console.log(`❌ PROBLEMA: Contexto grupo 890 contiene ${contamination890.length} chunks de otros grupos`);
      contamination890.forEach(c => {
        console.log(`   - ${c.source?.file_name} (grupo: ${c.source?.group_id})`);
      });
    }
    
    if (contamination1585.length === 0 && contamination890.length === 0) {
      console.log('✅ Contexto sin contaminación: cada grupo usa solo sus propios documentos');
    }
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
    console.error('Stack:', error.stack);
  }
  
  console.log('\n🎉 Pruebas completadas');
}

// Ejecutar las pruebas
testCompleteFlow().catch(console.error);