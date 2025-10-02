#!/usr/bin/env node

/**
 * Script de prueba para verificar las mejoras en el sistema de búsqueda
 * de la base de conocimiento
 */

const KnowledgeBase = require('./src/knowledge_base');

async function testSearch() {
    console.log('🧪 Iniciando pruebas del sistema de búsqueda mejorado...\n');
    
    const kb = new KnowledgeBase();
    
    // Queries de prueba específicas para el problema reportado
    const testQueries = [
        "conexión a la base de datos",
        "connection to database", 
        "configuración postgresql",
        "database connection",
        "como conectar a base de datos",
        "DataSource configuration",
        "pool de conexiones",
        "jdbc connection"
    ];
    
    try {
        await kb.initialize();
        console.log('✅ Base de conocimiento inicializada correctamente\n');
        
        for (const query of testQueries) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🔍 Probando búsqueda: "${query}"`);
            console.log(`${'='.repeat(60)}`);
            
            try {
                // Probar búsqueda general
                console.log('\n📋 BÚSQUEDA GENERAL:');
                const generalResults = await kb.search(query, 3);
                console.log(`Resultados encontrados: ${generalResults.length}`);
                
                generalResults.forEach((result, index) => {
                    console.log(`\n[${index + 1}] Archivo: ${result.source.file_name}`);
                    console.log(`    Proyecto: ${result.source.project_name}`);
                    console.log(`    Score: ${result.relevance_score.toFixed(3)}`);
                    console.log(`    Tipo: ${result.search_type}`);
                    console.log(`    Contenido: ${result.content.substring(0, 100)}...`);
                });
                
                // Probar búsqueda en grupo específico (simulando grupo 1585)
                console.log('\n📋 BÚSQUEDA EN GRUPO 1585:');
                const groupResults = await kb.searchInGroup(query, 1585, 3);
                console.log(`Resultados encontrados: ${groupResults.length}`);
                
                groupResults.forEach((result, index) => {
                    console.log(`\n[${index + 1}] Archivo: ${result.source.file_name}`);
                    console.log(`    Proyecto: ${result.source.project_name}`);
                    console.log(`    Score: ${result.relevance_score.toFixed(3)}`);
                    console.log(`    Tipo: ${result.search_type}`);
                    console.log(`    Contenido: ${result.content.substring(0, 100)}...`);
                });
                
            } catch (error) {
                console.error(`❌ Error en búsqueda "${query}": ${error.message}`);
            }
        }
        
        console.log('\n🎉 Pruebas completadas');
        
    } catch (error) {
        console.error('❌ Error durante las pruebas:', error.message);
    } finally {
        if (kb.pool) {
            await kb.pool.end();
        }
    }
}

// Ejecutar las pruebas
if (require.main === module) {
    testSearch().catch(console.error);
}

module.exports = testSearch;