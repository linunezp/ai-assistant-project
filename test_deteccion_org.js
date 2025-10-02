const { Agent } = require('./src/agent.js');

async function testDeteccionOrganizacion() {
    const agent = new Agent();
    
    try {
        await agent.initialize();
        console.log('🔍 Probando detección automática de organización...');
        
        // Test con pregunta simple para ver la detección
        const response = await agent.answerQuestionInGroup(
            "¿Qué contratos inteligentes están disponibles?", 
            1439
        );
        
        console.log('📋 Respuesta recibida:');
        console.log('=====================================');
        console.log(response.answer);
        console.log('=====================================');
        
        // También mostrar información de debugging si está disponible
        if (response.metadata) {
            console.log('\n🔧 Metadatos de debugging:');
            console.log('- Chunks encontrados:', response.context?.length || 0);
            console.log('- Tiempo de procesamiento:', response.metadata.processing_time + 'ms');
        }
        
    } catch (error) {
        console.error('❌ Error en test:', error.message);
    }
}

testDeteccionOrganizacion();