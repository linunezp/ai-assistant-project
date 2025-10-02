const KnowledgeBase = require('./src/knowledge_base');

async function testGroupFiltering() {
  console.log('🧪 Probando filtros de grupo...\n');
  
  const knowledgeBase = new KnowledgeBase();
  
  try {
    await knowledgeBase.initialize();
    console.log('✅ Base de conocimiento inicializada\n');
    
    // Probar búsqueda en grupo 1585
    console.log('='.repeat(60));
    console.log('🔍 Probando búsqueda en GRUPO 1585');
    console.log('='.repeat(60));
    
    const results1585 = await knowledgeBase.searchInGroup('conexión base de datos', '1585', 5);
    console.log(`📊 Grupo 1585 - Resultados encontrados: ${results1585.length}`);
    
    results1585.forEach((result, index) => {
      console.log(`\n[${index + 1}] Archivo: ${result.source.file_name}`);
      console.log(`    Proyecto: ${result.source.project_name}`);
      console.log(`    Grupo BD: ${result.source.group_id || 'N/A'}`);
      console.log(`    Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
      console.log(`    Contenido: ${result.content.substring(0, 80)}...`);
    });
    
    // Probar búsqueda en grupo 890
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Probando búsqueda en GRUPO 890');
    console.log('='.repeat(60));
    
    const results890 = await knowledgeBase.searchInGroup('conexión base de datos', '890', 5);
    console.log(`📊 Grupo 890 - Resultados encontrados: ${results890.length}`);
    
    results890.forEach((result, index) => {
      console.log(`\n[${index + 1}] Archivo: ${result.source.file_name}`);
      console.log(`    Proyecto: ${result.source.project_name}`);
      console.log(`    Grupo BD: ${result.source.group_id || 'N/A'}`);
      console.log(`    Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
      console.log(`    Contenido: ${result.content.substring(0, 80)}...`);
    });
    
    // Verificar que los grupos son diferentes
    console.log('\n' + '='.repeat(60));
    console.log('🔬 VERIFICACIÓN DE FILTROS');
    console.log('='.repeat(60));
    
    const groups1585 = new Set(results1585.map(r => r.source.group_id));
    const groups890 = new Set(results890.map(r => r.source.group_id));
    
    console.log(`📋 Grupos únicos en resultados 1585: [${Array.from(groups1585).join(', ')}]`);
    console.log(`📋 Grupos únicos en resultados 890: [${Array.from(groups890).join(', ')}]`);
    
    // Verificar si hay contaminación cruzada
    const contamination1585 = results1585.filter(r => r.source.group_id !== '1585');
    const contamination890 = results890.filter(r => r.source.group_id !== '890');
    
    if (contamination1585.length > 0) {
      console.log(`❌ ERROR: Encontrados ${contamination1585.length} resultados de otros grupos en búsqueda 1585:`);
      contamination1585.forEach(r => {
        console.log(`   - ${r.source.file_name} (grupo: ${r.source.group_id})`);
      });
    }
    
    if (contamination890.length > 0) {
      console.log(`❌ ERROR: Encontrados ${contamination890.length} resultados de otros grupos en búsqueda 890:`);
      contamination890.forEach(r => {
        console.log(`   - ${r.source.file_name} (grupo: ${r.source.group_id})`);
      });
    }
    
    if (contamination1585.length === 0 && contamination890.length === 0) {
      console.log('✅ FILTROS FUNCIONAN CORRECTAMENTE: No hay contaminación cruzada entre grupos');
    }
    
    // Verificar estadísticas de documentos por grupo
    console.log('\n' + '='.repeat(60));
    console.log('📊 ESTADÍSTICAS DE BASE DE DATOS');
    console.log('='.repeat(60));
    
    const pool = knowledgeBase.pool;
    const client = await pool.connect();
    
    try {
      const groupStats = await client.query(`
        SELECT 
          d.group_id,
          COUNT(d.id) as document_count,
          COUNT(dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.group_id IN ('1585', '890')
        GROUP BY d.group_id
        ORDER BY d.group_id
      `);
      
      groupStats.rows.forEach(row => {
        console.log(`📁 Grupo ${row.group_id}: ${row.document_count} documentos, ${row.chunk_count} chunks`);
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
    console.error('Stack:', error.stack);
  }
  
  console.log('\n🎉 Pruebas completadas');
}

// Ejecutar las pruebas
testGroupFiltering().catch(console.error);