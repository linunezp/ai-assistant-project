require('dotenv').config();
const { Agent } = require('../src/agent');

async function testImprovedReindexing() {
  console.log('=== PRUEBA DE REINDEXACIÓN CON MEJORAS ===\n');
  
  const agent = new Agent();
  await agent.initialize();
  
  // Probar reindexación de un proyecto que probablemente tenga más archivos ahora
  const testProjects = ['NIFI', 'plabacom-web', 'backend-for-frontend'];
  
  for (const projectName of testProjects) {
    console.log(`\n--- Reindexando proyecto: ${projectName} ---`);
    
    try {
      const result = await agent.reindexProjectByName(projectName);
      
      if (result.success) {
        console.log(`✅ Éxito: ${result.indexedCount} archivos indexados`);
        console.log(`   Proyecto: ${result.projectName} (ID: ${result.projectId})`);
      } else {
        console.log(`❌ Error: ${result.reason}`);
        if (result.detail) console.log(`   Detalle: ${result.detail.substring(0, 200)}...`);
      }
    } catch (error) {
      console.log(`❌ Excepción: ${error.message}`);
    }
    
    // Esperar un poco entre reindexaciones
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n=== ANÁLISIS POST-REINDEXACIÓN ===');
  // Ejecutar análisis de KB después de las mejoras
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    // Estadísticas generales
    const summaryResult = await client.query(`
      SELECT 
        COUNT(*) as total_documents,
        SUM(LENGTH(content)) as total_content_size,
        COUNT(DISTINCT project_name) as total_projects
      FROM documents
    `);
    
    const summary = summaryResult.rows[0];
    console.log(`Total documentos: ${summary.total_documents}`);
    console.log(`Tamaño total: ${(summary.total_content_size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Proyectos: ${summary.total_projects}`);

    // Nuevos tipos de archivo
    console.log('\n--- Nuevos tipos de archivo detectados ---');
    const newTypesResult = await client.query(`
      SELECT 
        CASE 
          WHEN file_path LIKE '%.properties' THEN 'Properties'
          WHEN file_path LIKE '%.gradle' THEN 'Gradle'
          WHEN file_path LIKE '%.pom' THEN 'POM'
          WHEN file_path LIKE '%.env' THEN 'Environment'
          WHEN file_path LIKE '%.config' THEN 'Config'
          WHEN file_path LIKE '%.lock' THEN 'Lock files'
          WHEN file_path LIKE '%gitignore' THEN 'Gitignore'
          WHEN file_path LIKE '%dockerfile%' THEN 'Dockerfile'
          WHEN file_path LIKE '%makefile%' THEN 'Makefile'
          WHEN file_name ILIKE '%readme%' THEN 'README'
          WHEN file_name ILIKE '%changelog%' THEN 'Changelog'
          WHEN file_name ILIKE '%contributing%' THEN 'Contributing'
          WHEN file_name ILIKE '%license%' THEN 'License'
          ELSE NULL
        END as new_file_type,
        COUNT(*) as count
      FROM documents 
      WHERE updated_at > NOW() - INTERVAL '5 minutes'
      GROUP BY new_file_type
      HAVING new_file_type IS NOT NULL
      ORDER BY count DESC
    `);

    newTypesResult.rows.forEach(row => {
      console.log(`${row.new_file_type}: ${row.count} archivos`);
    });
    
    // Archivos grandes que ahora se incluyen
    console.log('\n--- Archivos grandes ahora incluidos (1-5MB) ---');
    const largeFilesResult = await client.query(`
      SELECT file_name, project_name, LENGTH(content) as size
      FROM documents 
      WHERE LENGTH(content) > 1024*1024 
        AND updated_at > NOW() - INTERVAL '5 minutes'
      ORDER BY LENGTH(content) DESC
      LIMIT 10
    `);

    largeFilesResult.rows.forEach(row => {
      const sizeMB = (row.size / 1024 / 1024).toFixed(2);
      console.log(`${row.project_name}: ${row.file_name} (${sizeMB} MB)`);
    });

    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('Error en análisis post-reindexación:', error.message);
  }
  
  console.log('\n=== REINDEXACIÓN CON MEJORAS COMPLETADA ===');
}

testImprovedReindexing().catch(console.error);