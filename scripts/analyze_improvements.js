require('dotenv').config();
const { Pool } = require('pg');

async function analyzeImprovements() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    console.log('=== ANÁLISIS DE MEJORAS APLICADAS ===\n');

    // 1. Estadísticas actuales vs anteriores
    const summaryResult = await client.query(`
      SELECT 
        COUNT(*) as total_documents,
        SUM(LENGTH(content)) as total_content_size,
        COUNT(DISTINCT project_name) as total_projects
      FROM documents
    `);
    
    const summary = summaryResult.rows[0];
    console.log('📊 ESTADÍSTICAS ACTUALES:');
    console.log(`- Total documentos: ${summary.total_documents}`);
    console.log(`- Tamaño total: ${(summary.total_content_size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Proyectos: ${summary.total_projects}`);

    // 2. Archivos agregados recientemente (últimos 10 minutos)
    console.log('\n📁 ARCHIVOS AGREGADOS RECIENTEMENTE:');
    const recentResult = await client.query(`
      SELECT project_name, file_name, LENGTH(content) as size, created_at
      FROM documents 
      WHERE created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (recentResult.rows.length > 0) {
      recentResult.rows.forEach(row => {
        const sizeKB = (row.size / 1024).toFixed(1);
        console.log(`- ${row.project_name}: ${row.file_name} (${sizeKB} KB)`);
      });
    } else {
      console.log('- No se encontraron archivos agregados recientemente');
    }

    // 3. Tipos de archivo actuales (extensiones)
    console.log('\n📋 TIPOS DE ARCHIVO ACTUALES:');
    const typesResult = await client.query(`
      SELECT 
        CASE 
          WHEN file_path LIKE '%.java' THEN 'Java'
          WHEN file_path LIKE '%.js' THEN 'JavaScript'
          WHEN file_path LIKE '%.json' THEN 'JSON'
          WHEN file_path LIKE '%.yml' OR file_path LIKE '%.yaml' THEN 'YAML'
          WHEN file_path LIKE '%.sql' THEN 'SQL'
          WHEN file_path LIKE '%.md' THEN 'Markdown'
          WHEN file_path LIKE '%.xml' THEN 'XML'
          WHEN file_path LIKE '%.properties' THEN 'Properties'
          WHEN file_path LIKE '%.gradle' THEN 'Gradle'
          WHEN file_path LIKE '%.ts' THEN 'TypeScript'
          WHEN file_path LIKE '%.py' THEN 'Python'
          WHEN file_path LIKE '%.html' THEN 'HTML'
          WHEN file_path LIKE '%.css' THEN 'CSS'
          WHEN file_path LIKE '%.env' THEN 'Environment'
          WHEN file_path LIKE '%.config' THEN 'Config'
          WHEN file_path LIKE '%.lock' THEN 'Lock files'
          WHEN file_path LIKE '%gitignore' THEN 'Gitignore'
          WHEN file_path LIKE '%dockerfile%' THEN 'Dockerfile'
          WHEN file_name ILIKE '%readme%' THEN 'README'
          WHEN file_name ILIKE '%changelog%' THEN 'Changelog'
          WHEN file_name ILIKE '%license%' THEN 'License'
          ELSE 'Otros'
        END as file_type,
        COUNT(*) as count,
        ROUND(AVG(LENGTH(content))) as avg_size
      FROM documents 
      GROUP BY file_type 
      ORDER BY count DESC
    `);

    typesResult.rows.forEach(row => {
      const avgSizeKB = (row.avg_size / 1024).toFixed(1);
      console.log(`- ${row.file_type}: ${row.count} archivos (${avgSizeKB} KB promedio)`);
    });

    // 4. Archivos grandes que ahora se incluyen (1-5MB)
    console.log('\n🔍 ARCHIVOS GRANDES AHORA INCLUIDOS (1-5MB):');
    const largeFilesResult = await client.query(`
      SELECT file_name, project_name, LENGTH(content) as size
      FROM documents 
      WHERE LENGTH(content) > 1024*1024 
        AND LENGTH(content) <= 5*1024*1024
      ORDER BY LENGTH(content) DESC
      LIMIT 10
    `);

    if (largeFilesResult.rows.length > 0) {
      largeFilesResult.rows.forEach(row => {
        const sizeMB = (row.size / 1024 / 1024).toFixed(2);
        console.log(`- ${row.project_name}: ${row.file_name} (${sizeMB} MB)`);
      });
    } else {
      console.log('- No se encontraron archivos en el rango 1-5MB');
    }

    // 5. Archivos de documentación especiales
    console.log('\n📖 ARCHIVOS DE DOCUMENTACIÓN DETECTADOS:');
    const docResult = await client.query(`
      SELECT project_name, file_name, LENGTH(content) as size
      FROM documents 
      WHERE file_name ILIKE '%readme%' 
         OR file_name ILIKE '%changelog%'
         OR file_name ILIKE '%contributing%'
         OR file_name ILIKE '%license%'
         OR file_name ILIKE '%dockerfile%'
         OR file_name ILIKE '%makefile%'
      ORDER BY project_name, file_name
    `);

    if (docResult.rows.length > 0) {
      docResult.rows.forEach(row => {
        const sizeKB = (row.size / 1024).toFixed(1);
        console.log(`- ${row.project_name}: ${row.file_name} (${sizeKB} KB)`);
      });
    } else {
      console.log('- No se encontraron archivos de documentación especiales');
    }

    // 6. Proyectos con más archivos
    console.log('\n📊 PROYECTOS POR NÚMERO DE ARCHIVOS:');
    const projectsResult = await client.query(`
      SELECT 
        project_name,
        COUNT(*) as docs,
        SUM(LENGTH(content)) as total_size,
        MAX(updated_at) as last_update
      FROM documents 
      GROUP BY project_name 
      ORDER BY docs DESC
    `);

    projectsResult.rows.forEach(row => {
      const sizeMB = (row.total_size / 1024 / 1024).toFixed(2);
      const lastUpdate = new Date(row.last_update).toLocaleString();
      console.log(`- ${row.project_name}: ${row.docs} docs, ${sizeMB} MB (último: ${lastUpdate})`);
    });

    // 7. Nuevas extensiones capturadas
    console.log('\n🆕 EXTENSIONES DE ARCHIVO ÚNICAS:');
    const extensionsResult = await client.query(`
      SELECT 
        LOWER(SUBSTRING(file_path FROM '\\.([^.]+)$')) as extension,
        COUNT(*) as count
      FROM documents 
      WHERE file_path ~ '\\.'
      GROUP BY extension
      ORDER BY count DESC
    `);

    const extensions = extensionsResult.rows.slice(0, 15); // Top 15
    extensions.forEach(row => {
      if (row.extension) {
        console.log(`- .${row.extension}: ${row.count} archivos`);
      }
    });

    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('Error en análisis:', error.message);
  }
  
  console.log('\n=== ANÁLISIS COMPLETADO ===');
}

analyzeImprovements();