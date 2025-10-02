require('dotenv').config();
const { Pool } = require('pg');

async function analyzeKnowledgeBase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_assistant',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    
    console.log('=== RESUMEN GENERAL DE LA BASE DE CONOCIMIENTO ===');
    const summaryResult = await client.query(`
      SELECT 
        COUNT(DISTINCT project_name) as total_projects,
        COUNT(*) as total_documents,
        SUM(LENGTH(content)) as total_content_size,
        AVG(LENGTH(content)) as avg_document_size
      FROM documents
    `);
    
    const summary = summaryResult.rows[0];
    console.log(`Proyectos únicos: ${summary.total_projects}`);
    console.log(`Total documentos: ${summary.total_documents}`);
    console.log(`Tamaño total contenido: ${(summary.total_content_size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Tamaño promedio por documento: ${Math.round(summary.avg_document_size)} caracteres`);

    console.log('\n=== CHUNKS GENERADOS ===');
    const chunksResult = await client.query(`
      SELECT COUNT(*) as total_chunks,
        AVG(LENGTH(chunk_text)) as avg_chunk_size
      FROM document_chunks
    `);
    
    const chunks = chunksResult.rows[0];
    console.log(`Total chunks: ${chunks.total_chunks}`);
    console.log(`Tamaño promedio de chunk: ${Math.round(chunks.avg_chunk_size)} caracteres`);
    
    console.log('\n=== TIPOS DE ARCHIVOS ALMACENADOS ===');
    const fileTypesResult = await client.query(`
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
          ELSE 'Otros'
        END as file_type,
        COUNT(*) as count,
        ROUND(AVG(LENGTH(content))) as avg_size
      FROM documents 
      GROUP BY file_type 
      ORDER BY count DESC
    `);

    fileTypesResult.rows.forEach(row => {
      console.log(`${row.file_type}: ${row.count} archivos (${row.avg_size} chars promedio)`);
    });

    console.log('\n=== DETALLE POR PROYECTO ===');
    const projectsResult = await client.query(`
      SELECT 
        project_name,
        COUNT(*) as docs,
        COUNT(DISTINCT SUBSTRING(file_path FROM 1 FOR POSITION('/' IN file_path || '/')-1)) as directories,
        SUM(LENGTH(content)) as total_size
      FROM documents 
      GROUP BY project_name 
      ORDER BY docs DESC
    `);

    projectsResult.rows.forEach(row => {
      const sizeMB = (row.total_size / 1024 / 1024).toFixed(2);
      console.log(`${row.project_name}: ${row.docs} docs, ${row.directories} dirs, ${sizeMB} MB`);
    });

    console.log('\n=== EJEMPLOS DE ARCHIVOS ESPECIALES ===');
    const specialFilesResult = await client.query(`
      SELECT project_name, file_name, LENGTH(content) as size
      FROM documents 
      WHERE file_name ILIKE '%readme%' 
         OR file_name ILIKE '%package.json%'
         OR file_name ILIKE '%pom.xml%'
         OR file_name ILIKE '%dockerfile%'
         OR file_name ILIKE '%.md%'
      ORDER BY project_name, file_name
      LIMIT 20
    `);

    specialFilesResult.rows.forEach(row => {
      console.log(`${row.project_name}: ${row.file_name} (${row.size} chars)`);
    });

    console.log('\n=== ARCHIVOS MÁS GRANDES ===');
    const largestFilesResult = await client.query(`
      SELECT project_name, file_name, LENGTH(content) as size
      FROM documents 
      ORDER BY LENGTH(content) DESC
      LIMIT 10
    `);

    largestFilesResult.rows.forEach(row => {
      const sizeKB = (row.size / 1024).toFixed(1);
      console.log(`${row.project_name}: ${row.file_name} (${sizeKB} KB)`);
    });

    console.log('\n=== ÚLTIMA INDEXACIÓN ===');
    const lastIndexResult = await client.query(`
      SELECT 
        MAX(created_at) as last_created,
        MAX(updated_at) as last_updated,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as docs_last_24h
      FROM documents
    `);

    const lastIndex = lastIndexResult.rows[0];
    console.log(`Último documento creado: ${lastIndex.last_created}`);
    console.log(`Última actualización: ${lastIndex.last_updated}`);
    console.log(`Documentos indexados en las últimas 24h: ${lastIndex.docs_last_24h}`);

    client.release();
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

analyzeKnowledgeBase();