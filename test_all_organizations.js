const { Agent } = require('./src/agent.js');

async function testAllOrganizations() {
    console.log('🔍 Probando detección dinámica para todas las organizaciones...\n');
    
    const agent = new Agent();
    
    try {
        await agent.initialize();
        
        // Probar detección para diferentes grupos incluyendo RIO
        const testGroups = [890, 926, 1439, 1585];
        
        console.log('📋 Detección automática de organizaciones:');
        
        for (const groupId of testGroups) {
            try {
                console.log(`\n🔍 Analizando grupo ${groupId}...`);
                
                // Usar el método del agent
                const detectedOrg = await agent.getOrganizationForGroup(groupId);
                console.log(`  ✅ Organización detectada: ${detectedOrg}`);
                
                // Usar el método de la base de conocimiento para más detalles
                const groupInfo = await agent.knowledgeBase.getGroupWithOrganization(groupId);
                if (groupInfo && groupInfo.detection_stats) {
                    const stats = groupInfo.detection_stats;
                    console.log(`  📊 Estadísticas: RENOVA=${stats.renova_matches}, PLABACOM=${stats.plabacom_matches}, RIO=${stats.rio_matches || 0}, Muestras=${stats.content_samples}`);
                }
                
            } catch (error) {
                console.log(`  ❌ Error en grupo ${groupId}: ${error.message}`);
            }
        }
        
        console.log('\n🎯 Verificaciones específicas:');
        console.log(`  Grupo 1439 (debería ser RENOVA): ${await agent.getOrganizationForGroup(1439)}`);
        console.log(`  Grupo 1585 (debería ser RIO): ${await agent.getOrganizationForGroup(1585)}`);
        
        console.log('\n✅ Test de detección de organizaciones completado!');
        
    } catch (error) {
        console.error('❌ Error en test:', error.message);
    }
}

testAllOrganizations();