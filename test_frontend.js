async function testFrontendBehavior() {
  console.log('🧪 Simulando comportamiento del frontend...\n');
  
  try {
    // Simular consulta en grupo 1585
    console.log('='.repeat(60));
    console.log('🔍 SIMULANDO CONSULTA EN GRUPO 1585');
    console.log('='.repeat(60));
    
    const response1585 = await fetch('http://localhost:3000/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'conexión a la base de datos',
        groupId: '1585',
        aiProvider: 'gemini'
      })
    });
    
    const data1585 = await response1585.json();
    
    if (data1585.success) {
      console.log(`✅ Respuesta exitosa para grupo 1585`);
      console.log(`📄 Respuesta (${data1585.response.answer.length} caracteres):`);
      console.log(`"${data1585.response.answer.substring(0, 300)}..."`);
      
      if (data1585.response.context) {
        console.log(`\n📚 Contexto usado (${data1585.response.context.length} chunks):`);
        data1585.response.context.slice(0, 5).forEach((chunk, index) => { // Solo mostrar los primeros 5
          console.log(`  [${index + 1}] ${chunk.source?.file_name || 'Sin nombre'} (Grupo: ${chunk.source?.group_id || 'N/A'}) - Proyecto: ${chunk.source?.project_name || 'N/A'}`);
        });
        if (data1585.response.context.length > 5) {
          console.log(`  ... y ${data1585.response.context.length - 5} más`);
        }
      }
    } else {
      console.log(`❌ Error en grupo 1585: ${data1585.error}`);
    }
    
    // Simular consulta en grupo 890
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SIMULANDO CONSULTA EN GRUPO 890');
    console.log('='.repeat(60));
    
    const response890 = await fetch('http://localhost:3000/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'conexión a la base de datos',
        groupId: '890',
        aiProvider: 'gemini'
      })
    });
    
    const data890 = await response890.json();
    
    if (data890.success) {
      console.log(`✅ Respuesta exitosa para grupo 890`);
      console.log(`📄 Respuesta (${data890.response.answer.length} caracteres):`);
      console.log(`"${data890.response.answer.substring(0, 300)}..."`);
      
      if (data890.response.context) {
        console.log(`\n📚 Contexto usado (${data890.response.context.length} chunks):`);
        data890.response.context.slice(0, 5).forEach((chunk, index) => { // Solo mostrar los primeros 5
          console.log(`  [${index + 1}] ${chunk.source?.file_name || 'Sin nombre'} (Grupo: ${chunk.source?.group_id || 'N/A'}) - Proyecto: ${chunk.source?.project_name || 'N/A'}`);
        });
        if (data890.response.context.length > 5) {
          console.log(`  ... y ${data890.response.context.length - 5} más`);
        }
      }
    } else {
      console.log(`❌ Error en grupo 890: ${data890.error}`);
    }
    
    // Análisis comparativo
    if (data1585.success && data890.success) {
      console.log('\n' + '='.repeat(60));
      console.log('📊 ANÁLISIS COMPARATIVO');
      console.log('='.repeat(60));
      
      // Verificar grupos en contexto
      const groups1585 = data1585.response.context ? 
        [...new Set(data1585.response.context.map(c => c.source?.group_id).filter(g => g))] : [];
      const groups890 = data890.response.context ? 
        [...new Set(data890.response.context.map(c => c.source?.group_id).filter(g => g))] : [];
      
      console.log(`🔍 Grupos en contexto 1585: [${groups1585.join(', ')}]`);
      console.log(`🔍 Grupos en contexto 890: [${groups890.join(', ')}]`);
      
      // Verificar contaminación cruzada
      const wrongGroups1585 = groups1585.filter(g => g !== '1585');
      const wrongGroups890 = groups890.filter(g => g !== '890');
      
      if (wrongGroups1585.length > 0) {
        console.log(`❌ PROBLEMA: Contexto 1585 contiene grupos incorrectos: [${wrongGroups1585.join(', ')}]`);
      }
      
      if (wrongGroups890.length > 0) {
        console.log(`❌ PROBLEMA: Contexto 890 contiene grupos incorrectos: [${wrongGroups890.join(', ')}]`);
      }
      
      if (wrongGroups1585.length === 0 && wrongGroups890.length === 0) {
        console.log('✅ Filtros funcionan correctamente: cada grupo usa solo sus propios documentos');
      }
      
      // Comparar respuestas
      const sameResponse = data1585.response.answer === data890.response.answer;
      console.log(`📋 ¿Respuestas idénticas?: ${sameResponse ? '❌ SÍ (problema potencial)' : '✅ NO (correcto)'}`);
      
      if (sameResponse) {
        console.log('⚠️  Las respuestas son idénticas entre grupos diferentes. Esto podría indicar un problema.');
      }
      
      // Verificar proyectos en contexto
      const projects1585 = data1585.response.context ? 
        [...new Set(data1585.response.context.map(c => c.source?.project_name).filter(p => p))] : [];
      const projects890 = data890.response.context ? 
        [...new Set(data890.response.context.map(c => c.source?.project_name).filter(p => p))] : [];
      
      console.log(`\n📁 Proyectos en contexto 1585: [${projects1585.slice(0, 5).join(', ')}${projects1585.length > 5 ? ', ...' : ''}]`);
      console.log(`📁 Proyectos en contexto 890: [${projects890.slice(0, 5).join(', ')}${projects890.length > 5 ? ', ...' : ''}]`);
      
      const commonProjects = projects1585.filter(p => projects890.includes(p));
      if (commonProjects.length > 0) {
        console.log(`⚠️  Proyectos comunes entre grupos: [${commonProjects.join(', ')}]`);
      } else {
        console.log('✅ No hay proyectos comunes entre grupos (correcto)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
  }
  
  console.log('\n🎉 Pruebas completadas');
}

// Ejecutar las pruebas
testFrontendBehavior().catch(console.error);