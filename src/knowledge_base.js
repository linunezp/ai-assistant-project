const { Pool } = require('pg');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Configuración del logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

class KnowledgeBase {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'ai_assistant',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 20,
      idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT ? parseInt(process.env.DB_IDLE_TIMEOUT, 10) : 30000,
      connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) : 2000,
    });

    this.embeddingDimension = process.env.EMBEDDING_DIM ? parseInt(process.env.EMBEDDING_DIM, 10) : 1536; // Leer dimensión desde ENV si está disponible
    this.initialized = false;
    // Parámetros de chunking configurables
    this.maxChunkSize = process.env.MAX_CHUNK_SIZE ? parseInt(process.env.MAX_CHUNK_SIZE, 10) : 1000;
    this.chunkOverlap = process.env.CHUNK_OVERLAP ? parseInt(process.env.CHUNK_OVERLAP, 10) : 200;
    this.maxChunksPerFile = process.env.MAX_CHUNKS_PER_FILE ? parseInt(process.env.MAX_CHUNKS_PER_FILE, 10) : 100; // Evitar explosion
  }

  /**
   * Inicializa la base de datos y crea las tablas necesarias
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const client = await this.pool.connect();
      
  // Crear extensiones necesarias
  // pgcrypto proporciona gen_random_uuid() que usamos en los DEFAULTs
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  // Crear extensión pgvector si no existe
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      
      // Crear tabla para grupos de GitLab si no existe
      await client.query(`
        CREATE TABLE IF NOT EXISTS gitlab_groups (
          id SERIAL PRIMARY KEY,
          group_id TEXT NOT NULL UNIQUE,
          group_name TEXT,
          group_path TEXT,
          group_full_path TEXT,
          description TEXT,
          web_url TEXT,
          visibility TEXT,
          indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          projects_count INTEGER DEFAULT 0,
          files_count INTEGER DEFAULT 0,
          chunks_count INTEGER DEFAULT 0
        );
      `);

      // Crear tabla para documentos si no existe
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          file_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          project_name TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Agregar columna group_id si no existe (para compatibilidad con bases de datos existentes)
      await client.query(`
        ALTER TABLE documents 
        ADD COLUMN IF NOT EXISTS group_id TEXT;
      `);

      // Crear tabla para chunks (fragmentos) de documentos con embeddings
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
          chunk_text TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          embedding vector(${this.embeddingDimension}),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Crear índices para mejorar el rendimiento
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_project_name ON documents(project_name);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
      `);

      // Crear índice para búsqueda de similaridad vectorial
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      `);

      client.release();
      this.initialized = true;
      logger.info('Base de conocimiento inicializada correctamente');
      
    } catch (error) {
      logger.error('Error inicializando la base de conocimiento:', error.message);
      throw new Error(`Error de inicialización: ${error.message}`);
    }
  }

    /**
   * Divide el texto en chunks más pequeños para mejorar la búsqueda
   * @param {string} text - Texto a dividir
   * @param {number} maxChunkSize - Tamaño máximo de cada chunk
   * @param {number} overlap - Superposición entre chunks
   * @param {string} fileName - Nombre del archivo para optimizar chunking
   * @returns {Array} Array de chunks de texto
   */
  createChunks(text, maxChunkSize = 1000, overlap = 200, fileName = '') {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    const codeExtensions = ['.js', '.ts', '.java', '.py', '.php', '.cs', '.cpp', '.c', '.go', '.rs', '.rb', '.kt', '.swift', '.jsx', '.tsx', '.vue'];
    const isCodeFile = codeExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
    
    if (isCodeFile) {
      // Chunking especializado para archivos de código
      return this.createCodeChunks(text, maxChunkSize, overlap);
    }
    
    // Chunking normal para documentación y otros archivos
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let currentSize = 0;
    
    for (const sentence of sentences) {
      const sentenceSize = sentence.trim().length;
      
      if (currentSize + sentenceSize > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Mantener superposición con el chunk anterior
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 6)); // Aproximadamente overlap/6 palabras
        currentChunk = overlapWords.join(' ') + ' ' + sentence.trim();
        currentSize = currentChunk.length;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
        currentSize = currentChunk.length;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    // Filtrar chunks muy pequeños y limitar el número de chunks por archivo
    const filtered = chunks.filter(chunk => chunk.length > 50);
    if (filtered.length > this.maxChunksPerFile) {
      logger.warn(`Archivo produce ${filtered.length} chunks; truncando a ${this.maxChunksPerFile} por archivo`);
      return filtered.slice(0, this.maxChunksPerFile);
    }
    return filtered;
  }

  /**
   * Chunking especializado para archivos de código que preserva funciones y clases
   * @param {string} text - Código fuente a dividir
   * @param {number} maxChunkSize - Tamaño máximo de cada chunk
   * @param {number} overlap - Superposición entre chunks
   * @returns {Array} Array de chunks de código
   */
  createCodeChunks(text, maxChunkSize, overlap) {
    const chunks = [];
    const lines = text.split('\n');
    
    // Detectar bloques de código importantes (funciones, clases, etc.)
    const codeBlocks = this.detectCodeBlocks(lines);
    
    let currentChunk = '';
    let currentSize = 0;
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      const lineSize = line.length + 1; // +1 para el \n
      
      // Verificar si esta línea inicia un bloque de código importante
      const codeBlock = codeBlocks.find(block => block.start === i);
      
      if (codeBlock) {
        // Si el bloque completo cabe en el chunk actual, agregarlo
        if (currentSize + codeBlock.size <= maxChunkSize) {
          for (let j = codeBlock.start; j <= codeBlock.end; j++) {
            currentChunk += lines[j] + '\n';
            currentSize += lines[j].length + 1;
          }
          i = codeBlock.end + 1;
        } else {
          // Si el chunk actual no está vacío, finalizarlo
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          
          // Crear nuevo chunk con el bloque de código
          currentChunk = '';
          currentSize = 0;
          for (let j = codeBlock.start; j <= codeBlock.end; j++) {
            currentChunk += lines[j] + '\n';
            currentSize += lines[j].length + 1;
          }
          i = codeBlock.end + 1;
        }
      } else {
        // Línea normal, agregar al chunk actual
        if (currentSize + lineSize > maxChunkSize && currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          
          // Mantener superposición
          const chunkLines = currentChunk.split('\n');
          const overlapLines = chunkLines.slice(-Math.floor(overlap / 50)); // Aproximadamente overlap/50 líneas
          currentChunk = overlapLines.join('\n') + '\n' + line + '\n';
          currentSize = currentChunk.length;
        } else {
          currentChunk += line + '\n';
          currentSize += lineSize;
        }
        i++;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 20);
  }

  /**
   * Detecta bloques de código importantes como funciones, clases, etc.
   * @param {Array} lines - Líneas del archivo de código
   * @returns {Array} Array de objetos con start, end, size de cada bloque
   */
  detectCodeBlocks(lines) {
    const blocks = [];
    let braceStack = [];
    let currentBlock = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detectar inicio de función, clase, etc.
      if (/^(function|async function|class|const.*=.*function|const.*=.*async|module\.exports.*=.*function)/.test(line) ||
          /^(app\.|router\.|client\.)/.test(line) ||
          /^[a-zA-Z_][a-zA-Z0-9_]*\.prototype\./.test(line)) {
        
        if (!currentBlock) {
          currentBlock = { start: i, end: i, size: 0 };
        }
      }
      
      // Contar llaves para determinar el final del bloque
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      for (let j = 0; j < openBraces; j++) {
        braceStack.push(i);
      }
      
      for (let j = 0; j < closeBraces; j++) {
        braceStack.pop();
        
        // Si el stack está vacío y tenemos un bloque actual, finalizarlo
        if (braceStack.length === 0 && currentBlock) {
          currentBlock.end = i;
          currentBlock.size = lines.slice(currentBlock.start, currentBlock.end + 1)
            .reduce((sum, line) => sum + line.length + 1, 0);
          
          // Solo agregar bloques que valgan la pena (más de 3 líneas)
          if (currentBlock.end - currentBlock.start > 2) {
            blocks.push(currentBlock);
          }
          currentBlock = null;
        }
      }
    }
    
    return blocks;
  }

  /**
   * Genera un embedding simple basado en características del texto
   * En producción, esto debería reemplazarse con un modelo de embedding real
   * @param {string} text - Texto para generar embedding
   * @returns {Array} Vector de embedding
   */
  generateSimpleEmbedding(text) {
    // Esta es una implementación muy básica para demostración
    // En producción, deberías usar un modelo de embedding real como Sentence-BERT
    
    const vector = new Array(this.embeddingDimension).fill(0);
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    
    // Características básicas del texto
    const features = {
      length: Math.min(text.length / 1000, 1),
      wordCount: Math.min(words.length / 100, 1),
      avgWordLength: words.length > 0 ? Math.min(words.reduce((sum, w) => sum + w.length, 0) / words.length / 10, 1) : 0,
      uniqueWordRatio: words.length > 0 ? new Set(words).size / words.length : 0
    };
    
    // Mapear características a dimensiones del vector
    vector[0] = features.length;
    vector[1] = features.wordCount;
    vector[2] = features.avgWordLength;
    vector[3] = features.uniqueWordRatio;
    
    // Llenar el resto del vector con valores basados en hash de palabras
    for (let i = 4; i < this.embeddingDimension; i++) {
      let hash = 0;
      for (const word of words.slice(0, 10)) { // Usar solo las primeras 10 palabras
        for (let j = 0; j < word.length; j++) {
          hash = ((hash << 5) - hash + word.charCodeAt(j)) & 0xffffffff;
        }
      }
      vector[i] = (Math.sin(hash * (i + 1)) + 1) / 2; // Normalizar a [0,1]
    }
    
    return vector;
  }

  /**
   * Indexa los archivos de GitLab en la base de conocimiento
   * @param {Array} files - Array de archivos con contenido de GitLab
   */
  async indexData(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Se requiere un array no vacío de archivos');
    }

    await this.initialize();
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let totalChunks = 0;
      let processedFiles = 0;

      for (const file of files) {
        if (!file.content || !file.file_path) {
          logger.warn(`Archivo omitido por falta de contenido o ruta: ${file.file_name || 'unknown'}`);
          continue;
        }

        // Verificar si el archivo ya existe y si ha cambiado
        const existingDoc = await client.query(
          'SELECT id, metadata FROM documents WHERE file_path = $1',
          [file.file_path]
        );

        let documentId;
        
        if (existingDoc.rows.length > 0) {
          // Archivo existe, verificar si ha cambiado
          const existing = existingDoc.rows[0];
          const existingHash = existing.metadata?.content_hash;
          const currentHash = file.content_sha256 || this.generateContentHash(file.content);
          
          if (existingHash === currentHash) {
            logger.info(`Archivo sin cambios, omitiendo: ${file.file_path}`);
            continue;
          }
          
          // Archivo ha cambiado, eliminar chunks antiguos
          documentId = existing.id;
          await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
          
          // Actualizar documento
          await client.query(
            `UPDATE documents SET 
             content = $1, 
             metadata = $2, 
             updated_at = NOW() 
             WHERE id = $3`,
            [
              file.content,
              JSON.stringify({
                size: file.size,
                content_hash: currentHash,
                commit_id: file.commit_id,
                last_updated: new Date().toISOString()
              }),
              documentId
            ]
          );
          
        } else {
          // Nuevo archivo
          const insertResult = await client.query(
            `INSERT INTO documents (file_path, file_name, content, metadata, project_name) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [
              file.file_path,
              file.file_name,
              file.content,
              JSON.stringify({
                size: file.size,
                content_hash: file.content_sha256 || this.generateContentHash(file.content),
                commit_id: file.commit_id,
                created: new Date().toISOString()
              }),
              file.project_info?.name || 'unknown'
            ]
          );
          
          documentId = insertResult.rows[0].id;
        }

        // Dividir contenido en chunks
        const chunks = this.createChunks(file.content, this.maxChunkSize, this.chunkOverlap, file.file_name);
        
        // Insertar chunks con embeddings
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = this.generateSimpleEmbedding(chunk);
          
          await client.query(
            `INSERT INTO document_chunks (document_id, chunk_text, chunk_index, embedding, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              documentId,
              chunk,
              i,
              `[${embedding.join(',')}]`, // PostgreSQL vector format
              JSON.stringify({
                file_path: file.file_path,
                file_name: file.file_name,
                chunk_length: chunk.length
              })
            ]
          );
          
          totalChunks++;
        }
        
        processedFiles++;
        
        if (processedFiles % 10 === 0) {
          logger.info(`Procesados ${processedFiles}/${files.length} archivos...`);
        }
      }

      await client.query('COMMIT');
      logger.info(`Indexación completada: ${processedFiles} archivos, ${totalChunks} chunks`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error durante la indexación:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Busca chunks relevantes basados en una consulta
   * @param {string} query - Consulta de búsqueda
   * @param {number} limit - Número máximo de resultados
   * @param {number} threshold - Umbral de similaridad mínima
   * @returns {Array} Array de chunks relevantes con scores
   */
  async search(query, limit = 5, threshold = 0.1) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query debe ser una cadena no vacía');
    }

    await this.initialize();
    
    const client = await this.pool.connect();
    
    try {
      logger.info(`🔍 Iniciando búsqueda general: "${query}"`);

      // Detectar tipos de consulta para optimización
      const isAboutPurpose = /qué\s+(hace|es|significa)|propósito|objetivo|funciona|descripción|para\s+qué/i.test(query);
      const isAboutTech = /qué\s+(base\s+de\s+datos|database|tecnolog|framework|librería|herramienta)|usa\s+(base\s+de\s+datos|database)|utiliza\s+(base\s+de\s+datos|database)/i.test(query);
      const isAboutCode = /(cómo\s+(funciona|se\s+implementa|trabaja)|función|clase|método|variable|import|require|export|configuración|endpoint|api|ruta|middleware|conexión|cliente|servidor|algoritmo|lógica|flujo|proceso|estructura|arquitectura|patrón|implementación|qué\s+clases|clases\s+principales|mostrar\s+clases|listar\s+clases|contenido\s+indexado)/i.test(query);
      const isAboutFiles = /(\.js|\.json|\.md|\.env|\.yml|\.yaml|\.sql|\.sh|dockerfile|package\.json|readme|config)/i.test(query);
      const isAboutDebugging = /(error|fallo|problema|bug|debug|log|excepción|timeout|conexión\s+falló|no\s+funciona)/i.test(query);

      // Expandir la consulta con términos relacionados
      const expandedTerms = this.expandQuery(query);
      const expandedQuery = expandedTerms.join(',');
      logger.info(`🔤 Consulta expandida: "${expandedQuery}"`);
      
      // Detectar si se menciona un proyecto específico en la consulta
      const projectMatch = /proyecto\s+([a-zA-Z0-9_\-]+)/i.exec(query) || /project\s+([a-zA-Z0-9_\-]+)/i.exec(query);
      const specificProject = projectMatch ? projectMatch[1] : null;
      
      if (specificProject) {
        logger.info(`🎯 Proyecto específico detectado: ${specificProject}`);
      }
      
      // Generar embedding para la consulta original (no expandida para mejor precisión vectorial)
      const queryEmbedding = this.generateSimpleEmbedding(query);
      
      // Búsqueda por similaridad vectorial
      logger.info(`🧮 Ejecutando búsqueda vectorial...`);
      let vectorQuery = `SELECT 
           dc.chunk_text,
           dc.metadata,
           d.file_path,
           d.file_name,
           d.project_name,
           1 - (dc.embedding <=> $1::vector) as similarity_score
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE 1 - (dc.embedding <=> $1::vector) > $2`;
      
      let vectorParams = [`[${queryEmbedding.join(',')}]`, threshold];
      
      // Si se detectó un proyecto específico, filtrar por él
      if (specificProject) {
        vectorQuery += ` AND d.project_name ILIKE $3`;
        vectorParams.push(`%${specificProject}%`);
        vectorQuery += ` ORDER BY dc.embedding <=> $1::vector LIMIT $4`;
        vectorParams.push(limit);
      } else {
        vectorQuery += ` ORDER BY dc.embedding <=> $1::vector LIMIT $3`;
        vectorParams.push(limit);
      }
      
      const vectorSearchResult = await client.query(vectorQuery, vectorParams);
      logger.info(`📊 Búsqueda vectorial completada: ${vectorSearchResult.rows.length} resultados`);

      // Búsqueda textual como respaldo con consulta expandida
      logger.info(`📝 Ejecutando búsqueda textual de respaldo...`);
      let textQuery = `SELECT 
           dc.chunk_text,
           dc.metadata,
           d.file_path,
           d.file_name,
           d.project_name,
           ts_rank(to_tsvector('spanish', dc.chunk_text), plainto_tsquery('spanish', $1)) as text_score
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE to_tsvector('spanish', dc.chunk_text) @@ plainto_tsquery('spanish', $1)`;
      
      let textParams = [expandedQuery];
      
      // Si se detectó un proyecto específico, filtrar por él también
      if (specificProject) {
        textQuery += ` AND d.project_name ILIKE $2`;
        textParams.push(`%${specificProject}%`);
        textQuery += ` ORDER BY text_score DESC LIMIT $3`;
        textParams.push(limit);
      } else {
        textQuery += ` ORDER BY text_score DESC LIMIT $2`;
        textParams.push(limit);
      }
      
      const textSearchResult = await client.query(textQuery, textParams);
      logger.info(`📄 Búsqueda textual completada: ${textSearchResult.rows.length} resultados`);



      // Si se detectó un proyecto específico, también buscar en archivos de documentación
      let projectSpecificResult = { rows: [] };
      if (specificProject) {
        // Buscar específicamente en archivos de documentación para preguntas sobre "qué hace" o "propósito"
        const isAboutPurpose = /qué\s+(hace|es|significa)|propósito|objetivo|funciona|descripción|para\s+qué/i.test(query);
        

        
        if (isAboutPurpose) {
          logger.info(`Búsqueda en documentación para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.5 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
               AND (d.file_name ILIKE '%readme%' 
                    OR d.file_name ILIKE '%package.json%'
                    OR d.file_name ILIKE '%.md%'
                    OR d.file_path ILIKE '%doc%'
                    OR dc.chunk_text ILIKE '%descripción%'
                    OR dc.chunk_text ILIKE '%propósito%'
                    OR dc.chunk_text ILIKE '%asistente%'
                    OR dc.chunk_text ILIKE '%proyecto%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%# Asistente%' OR dc.chunk_text ILIKE '%asistente de IA%' THEN 0
                 WHEN d.file_name ILIKE '%readme%' THEN 1
                 WHEN d.file_name ILIKE '%package.json%' THEN 2
                 WHEN d.file_name ILIKE '%.md%' THEN 3
                 ELSE 4
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $2`,
            [`%${specificProject}%`, limit]
          );
        } else if (isAboutTech) {
          logger.info(`Búsqueda de tecnologías para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.5 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
               AND (dc.chunk_text ILIKE '%postgresql%' 
                    OR dc.chunk_text ILIKE '%pgvector%'
                    OR dc.chunk_text ILIKE '%database%'
                    OR dc.chunk_text ILIKE '%base de datos%'
                    OR dc.chunk_text ILIKE '%mysql%'
                    OR dc.chunk_text ILIKE '%mongodb%'
                    OR dc.chunk_text ILIKE '%redis%'
                    OR dc.chunk_text ILIKE '%node%'
                    OR dc.chunk_text ILIKE '%express%'
                    OR dc.chunk_text ILIKE '%react%'
                    OR dc.chunk_text ILIKE '%vue%'
                    OR dc.chunk_text ILIKE '%angular%'
                    OR dc.chunk_text ILIKE '%gemini%'
                    OR dc.chunk_text ILIKE '%docker%'
                    OR dc.chunk_text ILIKE '%kubernetes%'
                    OR d.file_name ILIKE '%package.json%'
                    OR d.file_name ILIKE '%readme%'
                    OR d.file_name ILIKE '%docker%'
                    OR d.file_name ILIKE '%.env%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%postgresql%' OR dc.chunk_text ILIKE '%pgvector%' THEN 1
                 WHEN d.file_name ILIKE '%readme%' THEN 2
                 WHEN d.file_name ILIKE '%package.json%' THEN 3
                 WHEN d.file_name ILIKE '%docker%' THEN 4
                 ELSE 5
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $2`,
            [`%${specificProject}%`, limit]
          );
        } else if (isAboutCode) {
          logger.info(`Búsqueda de código para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.5 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
               AND (d.file_name ILIKE '%.js' 
                    OR d.file_name ILIKE '%.json'
                    OR d.file_name ILIKE '%.env'
                    OR d.file_name ILIKE '%.yml'
                    OR d.file_name ILIKE '%.yaml'
                    OR d.file_name ILIKE '%.sql'
                    OR dc.chunk_text ILIKE '%function%'
                    OR dc.chunk_text ILIKE '%class%'
                    OR dc.chunk_text ILIKE '%const%'
                    OR dc.chunk_text ILIKE '%async%'
                    OR dc.chunk_text ILIKE '%await%'
                    OR dc.chunk_text ILIKE '%require%'
                    OR dc.chunk_text ILIKE '%import%'
                    OR dc.chunk_text ILIKE '%export%'
                    OR dc.chunk_text ILIKE '%module.exports%'
                    OR dc.chunk_text ILIKE '%app.%'
                    OR dc.chunk_text ILIKE '%router.%'
                    OR dc.chunk_text ILIKE '%client.%'
                    OR dc.chunk_text ILIKE '%query%'
                    OR dc.chunk_text ILIKE '%endpoint%'
                    OR dc.chunk_text ILIKE '%api%'
                    OR dc.chunk_text ILIKE '%middleware%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%function%' OR dc.chunk_text ILIKE '%class%' THEN 1
                 WHEN d.file_name ILIKE '%.js' THEN 2
                 WHEN d.file_name ILIKE '%.json' THEN 3
                 WHEN d.file_name ILIKE '%.env' THEN 4
                 ELSE 5
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $2`,
            [`%${specificProject}%`, limit]
          );
        } else if (isAboutFiles) {
          logger.info(`Búsqueda de archivos para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.4 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
               AND (d.file_name ILIKE CONCAT('%', SUBSTRING($2 FROM '\\\\.(\\w+)'), '%')
                    OR d.file_name ILIKE CONCAT('%', REPLACE(REPLACE($2, '¿', ''), '?', ''), '%')
                    OR dc.chunk_text ILIKE CONCAT('%', REPLACE(REPLACE($2, '¿', ''), '?', ''), '%'))
             ORDER BY 
               CASE 
                 WHEN d.file_name ILIKE CONCAT('%', SUBSTRING($2 FROM '\\\\.(\\w+)'), '%') THEN 1
                 WHEN d.file_name ILIKE CONCAT('%', REPLACE(REPLACE($2, '¿', ''), '?', ''), '%') THEN 2
                 ELSE 3
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $3`,
            [`%${specificProject}%`, query, limit]
          );
        } else if (isAboutDebugging) {
          logger.info(`Búsqueda de debugging para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.3 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
               AND (dc.chunk_text ILIKE '%error%'
                    OR dc.chunk_text ILIKE '%exception%'
                    OR dc.chunk_text ILIKE '%try%'
                    OR dc.chunk_text ILIKE '%catch%'
                    OR dc.chunk_text ILIKE '%throw%'
                    OR dc.chunk_text ILIKE '%log%'
                    OR dc.chunk_text ILIKE '%console%'
                    OR dc.chunk_text ILIKE '%debug%'
                    OR dc.chunk_text ILIKE '%timeout%'
                    OR dc.chunk_text ILIKE '%retry%'
                    OR dc.chunk_text ILIKE '%failed%'
                    OR dc.chunk_text ILIKE '%status%'
                    OR d.file_name ILIKE '%log%'
                    OR d.file_name ILIKE '%error%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%error%' OR dc.chunk_text ILIKE '%exception%' THEN 1
                 WHEN dc.chunk_text ILIKE '%try%' OR dc.chunk_text ILIKE '%catch%' THEN 2
                 WHEN dc.chunk_text ILIKE '%log%' OR dc.chunk_text ILIKE '%console%' THEN 3
                 ELSE 4
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $2`,
            [`%${specificProject}%`, limit]
          );
        } else if (vectorSearchResult.rows.length === 0 && textSearchResult.rows.length === 0) {
          logger.info(`Búsqueda específica para proyecto "${specificProject}"`);
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               0.5 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE d.project_name ILIKE $1
             ORDER BY RANDOM()
             LIMIT $2`,
            [`%${specificProject}%`, limit]
          );
        }
      }

      // Si no hay proyecto específico pero es una pregunta técnica, hacer búsqueda general
      if (!specificProject && (isAboutTech || isAboutCode || isAboutFiles || isAboutDebugging) && vectorSearchResult.rows.length === 0 && textSearchResult.rows.length === 0) {
        if (isAboutTech) {
          logger.info('Búsqueda general de tecnologías');
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.2 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE (dc.chunk_text ILIKE '%postgresql%' 
                    OR dc.chunk_text ILIKE '%pgvector%'
                    OR dc.chunk_text ILIKE '%database%'
                    OR dc.chunk_text ILIKE '%base de datos%'
                    OR dc.chunk_text ILIKE '%mysql%'
                    OR dc.chunk_text ILIKE '%mongodb%'
                    OR dc.chunk_text ILIKE '%node%'
                    OR dc.chunk_text ILIKE '%express%'
                    OR dc.chunk_text ILIKE '%gemini%'
                    OR dc.chunk_text ILIKE '%docker%'
                    OR d.file_name ILIKE '%package.json%'
                    OR d.file_name ILIKE '%readme%'
                    OR d.file_name ILIKE '%docker%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%postgresql%' OR dc.chunk_text ILIKE '%pgvector%' THEN 1
                 WHEN d.file_name ILIKE '%readme%' THEN 2
                 WHEN d.file_name ILIKE '%package.json%' THEN 3
                 WHEN d.file_name ILIKE '%docker%' THEN 4
                 ELSE 5
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $1`,
            [limit]
          );
        } else if (isAboutCode) {
          logger.info('Búsqueda general de código');
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.3 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE (d.file_name ILIKE '%.js' 
                    OR d.file_name ILIKE '%.json'
                    OR dc.chunk_text ILIKE '%function%'
                    OR dc.chunk_text ILIKE '%class%'
                    OR dc.chunk_text ILIKE '%const%'
                    OR dc.chunk_text ILIKE '%async%'
                    OR dc.chunk_text ILIKE '%await%'
                    OR dc.chunk_text ILIKE '%require%'
                    OR dc.chunk_text ILIKE '%import%'
                    OR dc.chunk_text ILIKE '%export%'
                    OR dc.chunk_text ILIKE '%module.exports%'
                    OR dc.chunk_text ILIKE '%app.%'
                    OR dc.chunk_text ILIKE '%router.%'
                    OR dc.chunk_text ILIKE '%client.%'
                    OR dc.chunk_text ILIKE '%api%'
                    OR dc.chunk_text ILIKE '%endpoint%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%function%' OR dc.chunk_text ILIKE '%class%' THEN 1
                 WHEN d.file_name ILIKE '%.js' THEN 2
                 WHEN dc.chunk_text ILIKE '%async%' OR dc.chunk_text ILIKE '%await%' THEN 3
                 ELSE 4
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $1`,
            [limit]
          );
        } else if (isAboutDebugging) {
          logger.info('Búsqueda general de debugging');
          projectSpecificResult = await client.query(
            `SELECT 
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               1.1 as similarity_score
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE (dc.chunk_text ILIKE '%error%'
                    OR dc.chunk_text ILIKE '%exception%'
                    OR dc.chunk_text ILIKE '%try%'
                    OR dc.chunk_text ILIKE '%catch%'
                    OR dc.chunk_text ILIKE '%log%'
                    OR dc.chunk_text ILIKE '%console%'
                    OR dc.chunk_text ILIKE '%debug%'
                    OR dc.chunk_text ILIKE '%timeout%'
                    OR dc.chunk_text ILIKE '%retry%'
                    OR dc.chunk_text ILIKE '%failed%')
             ORDER BY 
               CASE 
                 WHEN dc.chunk_text ILIKE '%error%' OR dc.chunk_text ILIKE '%exception%' THEN 1
                 WHEN dc.chunk_text ILIKE '%try%' OR dc.chunk_text ILIKE '%catch%' THEN 2
                 WHEN dc.chunk_text ILIKE '%log%' OR dc.chunk_text ILIKE '%console%' THEN 3
                 ELSE 4
               END,
               LENGTH(dc.chunk_text) DESC
             LIMIT $1`,
            [limit]
          );
        }
      }

      // Combinar resultados y eliminar duplicados
      const allResults = new Map();
      
      // Agregar resultados vectoriales
      vectorSearchResult.rows.forEach(row => {
        const key = `${row.file_path}:${row.chunk_text.substring(0, 50)}`;
        if (!allResults.has(key)) {
          allResults.set(key, {
            ...row,
            search_type: 'vector',
            combined_score: row.similarity_score
          });
        }
      });
      
      // Agregar resultados textuales (solo si no existen ya)
      textSearchResult.rows.forEach(row => {
        const key = `${row.file_path}:${row.chunk_text.substring(0, 50)}`;
        if (!allResults.has(key)) {
          allResults.set(key, {
            ...row,
            search_type: 'text',
            combined_score: row.text_score,
            similarity_score: row.text_score // Para compatibilidad
          });
        }
      });

      // Agregar resultados específicos del proyecto (estos tienen prioridad máxima)
      projectSpecificResult.rows.forEach(row => {
        const key = `${row.file_path}:${row.chunk_text.substring(0, 50)}`;
        // Los resultados de proyecto específico siempre se agregan o reemplazan con alta prioridad
        allResults.set(key, {
          ...row,
          search_type: 'project_specific',
          combined_score: row.similarity_score + 1.0 // Boost muy alto para project-specific
        });
      });

      // Aplicar boosts inteligentes basados en tipo de pregunta
      const BOOST_README = isAboutPurpose ? 1.0 : 0.3;
      const BOOST_DOCS = 0.5;
      const BOOST_CODE_FILES = (isAboutCode || isAboutFiles) ? 0.8 : 0.15;
      const BOOST_CONFIG_FILES = isAboutTech ? 0.6 : 0.2;
      const BOOST_DEBUGGING = isAboutDebugging ? 0.7 : 0.1;
      const PENALTY_LOCK_FILES = -0.5;
      
      const finalResults = Array.from(allResults.values())
        .map(r => {
          let boost = 0;
          const fileName = (r.file_name || '').toLowerCase();
          const filePath = (r.file_path || '').toLowerCase();
          const content = (r.chunk_text || '').toLowerCase();
          
          // Boost fuerte para archivos de documentación (cuando es relevante)
          if (fileName.includes('readme')) boost += BOOST_README;
          else if (fileName.includes('changelog') || fileName.includes('contributing') || fileName.includes('license')) boost += BOOST_DOCS;
          
          // Boost para archivos de código (cuando se pregunta sobre código)
          else if (fileName.endsWith('.js') || fileName.endsWith('.ts')) boost += BOOST_CODE_FILES;
          else if (fileName.includes('agent.js') || fileName.includes('app.js') || fileName.includes('index.js')) boost += BOOST_CODE_FILES + 0.1;
          
          // Boost para archivos de configuración (cuando se pregunta sobre tecnologías)
          else if (fileName.includes('package.json') && !fileName.includes('lock')) boost += BOOST_CONFIG_FILES;
          else if (fileName.includes('.env') || fileName.includes('docker') || fileName.includes('.yml') || fileName.includes('.yaml')) boost += BOOST_CONFIG_FILES;
          
          // Boost adicional para contenido con código técnico
          if (content.includes('function') || content.includes('class') || content.includes('const') || content.includes('async')) {
            boost += isAboutCode ? 0.4 : 0.1;
          }
          
          // Boost adicional para contenido con configuraciones
          if (content.includes('config') || content.includes('setup') || content.includes('install') || content.includes('require')) {
            boost += isAboutTech ? 0.3 : 0.1;
          }
          
          // Boost adicional para contenido de debugging
          if (content.includes('error') || content.includes('log') || content.includes('debug') || content.includes('catch')) {
            boost += BOOST_DEBUGGING;
          }
          
          // Penalizar archivos menos útiles
          if (fileName.includes('package-lock.json') || fileName.includes('.lock')) boost += PENALTY_LOCK_FILES;
          
          return { ...r, combined_score: r.combined_score + boost };
        })
        .sort((a, b) => b.combined_score - a.combined_score)
        .slice(0, limit);

      // Si no hay resultados pero hay contenido indexado, hacer un fallback final
      if (finalResults.length === 0) {
        logger.info('Sin resultados, ejecutando fallback general');
        const fallbackResult = await client.query(
          `SELECT 
             dc.chunk_text,
             dc.metadata,
             d.file_path,
             d.file_name,
             d.project_name,
             0.2 as similarity_score
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE dc.chunk_text ILIKE '%class%' 
              OR dc.chunk_text ILIKE '%function%'
              OR dc.chunk_text ILIKE '%const%'
              OR d.file_name ILIKE '%.js'
           ORDER BY LENGTH(dc.chunk_text) DESC
           LIMIT $1`,
          [limit]
        );
        
        if (fallbackResult.rows.length > 0) {
          return fallbackResult.rows.map(result => ({
            content: result.chunk_text,
            source: {
              file_path: result.file_path,
              file_name: result.file_name,
              project_name: result.project_name
            },
            relevance_score: parseFloat(result.similarity_score),
            search_type: 'fallback',
            metadata: typeof result.metadata === 'string' ? 
              JSON.parse(result.metadata) : result.metadata
          }));
        }
      }

      // Log detallado de resultados finales
      logger.info(`✅ Búsqueda completada: ${finalResults.length} resultados finales`);
      finalResults.forEach((result, index) => {
        logger.info(`📄 [${index + 1}] ${result.file_name} - Score: ${result.combined_score.toFixed(3)} (${result.search_type})`);
      });

      return finalResults.map(result => ({
        content: result.chunk_text,
        source: {
          file_path: result.file_path,
          file_name: result.file_name,
          project_name: result.project_name
        },
        relevance_score: parseFloat(result.combined_score),
        search_type: result.search_type,
        metadata: typeof result.metadata === 'string' ? 
          JSON.parse(result.metadata) : result.metadata
      }));

    } catch (error) {
      logger.error('Error en búsqueda:', error.message);
      throw new Error(`Error en búsqueda: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Extrae palabras clave relevantes de una consulta
   * @param {string} query - Consulta del usuario
   * @returns {Array} Array de palabras clave
   */
  extractKeywords(query) {
    // Palabras vacías comunes en español e inglés
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'por', 'para',
      'que', 'qué', 'y', 'o', 'pero', 'si', 'no', 'es', 'son', 'tiene', 'tienen',
      'hay', 'está', 'están', 'como', 'cómo', 'donde', 'dónde', 'cuando', 'cuándo',
      'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'cannot', 'the', 'this',
      'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
      'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him',
      'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
      'they', 'them', 'their', 'theirs', 'themselves'
    ]);
    
    // Extraer palabras de la consulta
    const words = query.toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // Buscar patrones específicos de programación
    const programmingTerms = [];
    const queryLower = query.toLowerCase();
    
    // Buscar nombres de clases (CamelCase)
    const classMatches = query.match(/\b[A-Z][a-zA-Z]*[A-Z][a-zA-Z]*\b/g);
    if (classMatches) {
      programmingTerms.push(...classMatches);
    }
    
    // Buscar términos específicos mencionados
    if (queryLower.includes('knowledgebase')) programmingTerms.push('KnowledgeBase');
    if (queryLower.includes('agent')) programmingTerms.push('Agent');
    if (queryLower.includes('gitlab')) programmingTerms.push('GitLab');
    if (queryLower.includes('gemini')) programmingTerms.push('Gemini');
    if (queryLower.includes('claude')) programmingTerms.push('Claude');
    
    return [...new Set([...words, ...programmingTerms])];
  }

  /**
   * Fallback directo cuando la búsqueda principal falla
   * @param {string} query - Consulta de búsqueda
   * @param {number} limit - Número máximo de resultados
   * @returns {Array} Array de chunks relevantes
   */
  async directSearchFallback(query, limit = 5) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      logger.info('Ejecutando fallback directo para:', query);
      
      // Extraer términos clave de la consulta
      const keywords = this.extractKeywords(query);
      logger.info('Keywords extraídos:', keywords);
      
      // Construir condiciones de búsqueda dinámicamente
      const searchConditions = [];
      const queryParams = [];
      let paramIndex = 1;
      
      // Buscar por términos específicos mencionados en la consulta
      keywords.forEach(keyword => {
        searchConditions.push(`dc.chunk_text ILIKE $${paramIndex}`);
        queryParams.push(`%${keyword}%`);
        paramIndex++;
      });
      
      // Agregar condiciones generales para código JavaScript
      const generalConditions = [
        'dc.chunk_text ILIKE \'%class %\'',
        'dc.chunk_text ILIKE \'%function %\'',
        'dc.chunk_text ILIKE \'%const %\'',
        'dc.chunk_text ILIKE \'%async %\'',
        'd.file_name ILIKE \'%.js\'',
        'd.file_name ILIKE \'%.ts\''
      ];
      
      const allConditions = searchConditions.length > 0 ? 
        searchConditions.concat(generalConditions) : generalConditions;
      
      queryParams.push(limit);
      
      const sqlQuery = `
        SELECT 
           dc.chunk_text,
           dc.metadata,
           d.file_path,
           d.file_name,
           d.project_name,
           d.group_id,
           CASE 
             ${keywords.map((_, idx) => 
               `WHEN dc.chunk_text ILIKE $${idx + 1} THEN 0.9`
             ).join(' ')}
             WHEN dc.chunk_text ILIKE '%class %' THEN 0.7
             WHEN dc.chunk_text ILIKE '%function %' THEN 0.6
             WHEN dc.chunk_text ILIKE '%const %' THEN 0.5
             ELSE 0.3
           END as content_score,
           CASE 
             WHEN d.file_name ILIKE '%.java' THEN 1.0
             WHEN d.file_name ILIKE '%.js' THEN 1.0
             WHEN d.file_name ILIKE '%.ts' THEN 1.0
             WHEN d.file_name ILIKE '%.py' THEN 1.0
             WHEN d.file_name ILIKE '%.php' THEN 1.0
             WHEN d.file_name ILIKE '%.cs' THEN 1.0
             WHEN d.file_name ILIKE '%.cpp' THEN 1.0
             WHEN d.file_name ILIKE '%service%' THEN 0.9
             WHEN d.file_name ILIKE '%controller%' THEN 0.9
             WHEN d.file_name ILIKE '%component%' THEN 0.9
             WHEN d.file_name ILIKE '%util%' THEN 0.8
             WHEN d.file_name ILIKE '%config%' THEN 0.7
             WHEN d.file_name ILIKE '%.json' THEN 0.6
             WHEN d.file_name ILIKE '%readme%' THEN 0.5
             WHEN d.file_name ILIKE '%__init__%' THEN 0.1
             ELSE 0.4
           END as file_priority
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE ${allConditions.join(' OR ')}
         ORDER BY (content_score * file_priority) DESC, LENGTH(dc.chunk_text) DESC
         LIMIT $${paramIndex}`;
      
      logger.info('SQL Query:', sqlQuery);
      logger.info('Query Params:', queryParams);
      
      const result = await client.query(sqlQuery, queryParams);
      
      return result.rows.map(row => ({
        content: row.chunk_text,
        source: {
          file_path: row.file_path,
          file_name: row.file_name,
          project_name: row.project_name,
          group_id: row.group_id
        },
        relevance_score: parseFloat(row.content_score || 0.5),
        file_priority: parseFloat(row.file_priority || 0.4),
        combined_score: parseFloat(row.content_score || 0.5) * parseFloat(row.file_priority || 0.4),
        search_type: 'direct_fallback_prioritized',
        metadata: typeof row.metadata === 'string' ? 
          JSON.parse(row.metadata) : row.metadata
      }));
      
    } catch (error) {
      logger.error('Error en fallback directo:', error.message);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene estadísticas de la base de conocimiento
   * @returns {Object} Información estadística de la base de datos
   */
  async getInfo() {
    await this.initialize();
    
    const client = await this.pool.connect();
    
    try {
      const documentsCount = await client.query('SELECT COUNT(*) as count FROM documents');
      const chunksCount = await client.query('SELECT COUNT(*) as count FROM document_chunks');
      const projectsCount = await client.query('SELECT COUNT(DISTINCT project_name) as count FROM documents');
      
      const recentDocs = await client.query(
        'SELECT file_name, created_at FROM documents ORDER BY created_at DESC LIMIT 5'
      );

      return {
        total_documents: parseInt(documentsCount.rows[0].count),
        total_chunks: parseInt(chunksCount.rows[0].count),
        total_projects: parseInt(projectsCount.rows[0].count),
        recent_documents: recentDocs.rows,
        last_updated: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Error obteniendo información:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener lista de documentos pertenecientes a un proyecto
   * @param {string} projectName
   */
  async getDocumentsByProject(projectName) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT id, file_path, file_name, created_at, metadata FROM documents WHERE project_name = $1 ORDER BY created_at DESC`,
        [projectName]
      );
      return res.rows;
    } catch (error) {
      logger.error('Error obteniendo documentos por proyecto:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener contenido completo de un documento por su id
   * @param {string} documentId
   */
  async getDocumentContent(documentId) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT id, file_path, file_name, content, metadata, project_name FROM documents WHERE id = $1 LIMIT 1`,
        [documentId]
      );
      return res.rows[0] || null;
    } catch (error) {
      logger.error('Error obteniendo contenido de documento:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Genera un hash simple del contenido para detectar cambios
   * @param {string} content - Contenido a hashear
   * @returns {string} Hash del contenido
   */
  generateContentHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a 32bit integer
    }
    return hash.toString();
  }

  /**
   * Obtiene un grupo por su ID de la base de datos
   * @param {string} groupId - ID del grupo
   * @returns {Object|null} Información del grupo o null si no existe
   */
  async getGroupById(groupId) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM gitlab_groups WHERE group_id = $1',
        [groupId]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Registra un grupo de GitLab en la base de datos
   * @param {Object} groupInfo - Información del grupo
   * @returns {Object} Información del grupo registrado
   */
  async registerGroup(groupInfo) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `INSERT INTO gitlab_groups (group_id, group_name, group_path, group_full_path, description, web_url, visibility, projects_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (group_id) 
         DO UPDATE SET 
           group_name = EXCLUDED.group_name,
           group_path = EXCLUDED.group_path,
           group_full_path = EXCLUDED.group_full_path,
           description = EXCLUDED.description,
           web_url = EXCLUDED.web_url,
           visibility = EXCLUDED.visibility,
           projects_count = EXCLUDED.projects_count,
           indexed_at = NOW()
         RETURNING *`,
        [
          groupInfo.id?.toString(),
          groupInfo.name,
          groupInfo.path,
          groupInfo.fullPath,
          groupInfo.description,
          groupInfo.webUrl,
          groupInfo.visibility,
          groupInfo.projectsCount || 0
        ]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza las estadísticas de un grupo después del indexado
   * @param {string} groupId - ID del grupo
   * @param {Object} stats - Estadísticas del grupo
   * @param {number} stats.projectsCount - Número de proyectos
   * @param {number} stats.filesCount - Número de archivos
   * @param {number} stats.chunksCount - Número de chunks
   */
  async updateGroupStats(groupId, stats) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      logger.info(`🔄 Actualizando estadísticas para grupo ${groupId}: projectsCount=${stats.projectsCount}, filesCount=${stats.filesCount}, chunksCount=${stats.chunksCount}`);
      
      const result = await client.query(
        `UPDATE gitlab_groups 
         SET projects_count = $2, files_count = $3, chunks_count = $4, indexed_at = NOW()
         WHERE group_id = $1
         RETURNING *`,
        [
          groupId,
          stats.projectsCount || 0,
          stats.filesCount || 0, 
          stats.chunksCount || 0
        ]
      );
      
      if (result.rows.length > 0) {
        logger.info(`✅ Estadísticas actualizadas exitosamente para grupo ${groupId}: ${JSON.stringify(result.rows[0])}`);
      } else {
        logger.warn(`⚠️ No se encontró grupo con ID ${groupId} para actualizar estadísticas`);
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error(`❌ Error actualizando estadísticas del grupo ${groupId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene información de grupos indexados
   * @returns {Array} Lista de grupos
   */
  async getIndexedGroups() {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          g.*,
          COUNT(DISTINCT d.id) as actual_files_count,
          COUNT(DISTINCT dc.id) as actual_chunks_count,
          COUNT(DISTINCT d.project_name) as actual_projects_count
        FROM gitlab_groups g
        LEFT JOIN documents d ON g.group_id = d.group_id
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        GROUP BY g.id
        ORDER BY g.indexed_at DESC
      `);
      
      return result.rows.map(row => ({
        groupId: row.group_id,
        name: row.group_name,
        path: row.group_path,
        fullPath: row.group_full_path,
        description: row.description,
        webUrl: row.web_url,
        visibility: row.visibility,
        indexedAt: row.indexed_at,
        // Usar campos fijos si están disponibles, sino usar conteos dinámicos
        projectsCount: parseInt(row.projects_count) || parseInt(row.actual_projects_count) || 0,
        filesCount: parseInt(row.files_count) || parseInt(row.actual_files_count) || 0,
        chunksCount: parseInt(row.chunks_count) || parseInt(row.actual_chunks_count) || 0
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Indexa archivos de un grupo específico
   * @param {string} groupId - ID del grupo
   * @param {Array} files - Array de archivos con contenido
   */
  async indexGroupData(groupId, files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Se requiere un array no vacío de archivos');
    }

    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let totalChunks = 0;
      let processedFiles = 0;

      for (const file of files) {
        // Incluir group_id en los metadatos
        const metadata = {
          ...file.metadata,
          group_id: groupId,
          project_path: file.projectPath
        };

        // Insertar documento con group_id
        const docResult = await client.query(
          `INSERT INTO documents (file_path, file_name, content, metadata, project_name, group_id) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (file_path) DO UPDATE SET 
             content = EXCLUDED.content,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
           RETURNING id`,
          [file.file_path, file.file_name, file.content, JSON.stringify(metadata), file.project_name, groupId]
        );

        if (docResult.rows.length === 0) continue;

        const documentId = docResult.rows[0].id;

        // Limpiar chunks existentes del documento
        await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

        // Dividir en chunks
        const chunks = this.createChunks(file.content, this.maxChunkSize, this.chunkOverlap, file.file_name);
        
        // Insertar chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = this.generateSimpleEmbedding(chunk);
          
          const chunkMetadata = {
            ...metadata,
            chunk_index: i,
            total_chunks: chunks.length
          };

          await client.query(
            `INSERT INTO document_chunks (document_id, chunk_text, chunk_index, embedding, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [documentId, chunk, i, JSON.stringify(embedding), JSON.stringify(chunkMetadata)]
          );
        }

        totalChunks += chunks.length;
        processedFiles++;
      }

      await client.query('COMMIT');
      logger.info(`Indexación completada: ${processedFiles} archivos, ${totalChunks} chunks para grupo ${groupId}`);
      
      return { processedFiles, totalChunks };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error en indexación de grupo:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Expande la consulta con términos relacionados
   * @param {string} query - Consulta original
   * @returns {Array} Array de términos de búsqueda
   */
  expandQuery(query) {
    const queryLower = query.toLowerCase();
    const expandedTerms = [query]; // Incluir consulta original
    
    // Expansión para base de datos
    if (queryLower.includes('base de datos') || queryLower.includes('database') || queryLower.includes('conexión') || queryLower.includes('connection')) {
      expandedTerms.push('DataSource', 'ConnectionPool', 'datasource', 'connection', 'database', 'db', 'sql', 'jdbc', 'hibernate', 'jpa', 'postgresql', 'mysql', 'oracle', 'h2');
    }
    
    // Expansión para configuración
    if (queryLower.includes('config') || queryLower.includes('configuracion') || queryLower.includes('properties')) {
      expandedTerms.push('application.properties', 'application.yml', 'config', 'configuration', 'properties', 'settings', 'env');
    }
    
    // Expansión para servicios
    if (queryLower.includes('service') || queryLower.includes('servicio')) {
      expandedTerms.push('Service', 'Component', 'Bean', '@Service', '@Component', 'RestController', 'Controller');
    }
    
    // Expansión para autenticación
    if (queryLower.includes('auth') || queryLower.includes('login') || queryLower.includes('usuario') || queryLower.includes('user')) {
      expandedTerms.push('authentication', 'authorization', 'login', 'user', 'security', 'jwt', 'token', 'session');
    }
    
    // Expansión para API
    if (queryLower.includes('api') || queryLower.includes('rest') || queryLower.includes('endpoint')) {
      expandedTerms.push('RestController', 'RequestMapping', 'GetMapping', 'PostMapping', 'endpoint', 'api', 'rest');
    }
    
    return [...new Set(expandedTerms)]; // Eliminar duplicados
  }

  /**
   * Busca en un grupo específico con mejoras inteligentes
   * @param {string} query - Consulta de búsqueda
   * @param {string} groupId - ID del grupo (opcional)
   * @param {number} limit - Límite de resultados
   * @param {number} threshold - Umbral de relevancia
   * @returns {Array} Resultados de búsqueda
   */
  async searchInGroup(query, groupId = null, limit = 5, threshold = 0.1) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      logger.info(`🔍 Iniciando búsqueda inteligente para grupo ${groupId}:`);
      logger.info(`   📝 Consulta original: "${query}"`);
      
      // Expandir la consulta con términos relacionados
      const expandedTerms = this.expandQuery(query);
      logger.info(`   📋 Términos expandidos: ${expandedTerms.slice(1).join(', ')}`);
      
      const queryVector = this.generateSimpleEmbedding(query);
      
      // Primero, verificar cuántos documentos hay en el grupo
      const countResult = await client.query(
        `SELECT COUNT(DISTINCT d.id) as total_docs, COUNT(dc.id) as total_chunks
         FROM documents d 
         LEFT JOIN document_chunks dc ON d.id = dc.document_id
         WHERE ($1::text IS NULL OR d.group_id = $1)`,
        [groupId]
      );
      
      const totalDocs = parseInt(countResult.rows[0].total_docs);
      const totalChunks = parseInt(countResult.rows[0].total_chunks);
      logger.info(`   📊 Base de conocimiento: ${totalDocs} documentos, ${totalChunks} chunks en grupo ${groupId || 'todos'}`);
      
      if (totalDocs === 0) {
        logger.warn(`   ⚠️  No hay documentos indexados para el grupo ${groupId}`);
        return [];
      }
      
      // Búsqueda vectorial principal
      let whereClause = '';
      let queryParams = [JSON.stringify(queryVector), threshold, limit];
      
      if (groupId) {
        whereClause = 'AND d.group_id = $4';
        queryParams.push(groupId);
      }
      
      logger.info(`   🎯 Parámetros búsqueda: umbral=${threshold}, límite=${limit}`);
      
      const result = await client.query(
        `SELECT 
           dc.chunk_text,
           dc.metadata,
           d.file_path,
           d.file_name,
           d.project_name,
           d.group_id,
           1 - (dc.embedding <=> $1::vector) as similarity_score,
           CASE 
             -- Código fuente principal (máxima prioridad)
             WHEN d.file_name ILIKE '%.java' THEN 2.0
             WHEN d.file_name ILIKE '%.js' AND d.file_name NOT ILIKE '%test%' AND d.file_name NOT ILIKE '%spec%' THEN 2.0
             WHEN d.file_name ILIKE '%.ts' AND d.file_name NOT ILIKE '%test%' AND d.file_name NOT ILIKE '%spec%' THEN 2.0
             WHEN d.file_name ILIKE '%.cs' THEN 2.0
             WHEN d.file_name ILIKE '%.cpp' THEN 2.0
             WHEN d.file_name ILIKE '%.c' THEN 2.0
             WHEN d.file_name ILIKE '%.go' THEN 2.0
             WHEN d.file_name ILIKE '%.rs' THEN 2.0
             WHEN d.file_name ILIKE '%.php' THEN 2.0
             WHEN d.file_name ILIKE '%.rb' THEN 2.0
             WHEN d.file_name ILIKE '%.kt' THEN 2.0
             WHEN d.file_name ILIKE '%.swift' THEN 2.0
             -- Archivos de servicio y controladores (alta prioridad)
             WHEN d.file_name ILIKE '%service%' THEN 1.8
             WHEN d.file_name ILIKE '%controller%' THEN 1.8
             WHEN d.file_name ILIKE '%component%' THEN 1.8
             WHEN d.file_name ILIKE '%repository%' THEN 1.8
             WHEN d.file_name ILIKE '%dao%' THEN 1.8
             -- Python de aplicación (no migración)
             WHEN d.file_name ILIKE '%.py' AND d.file_name NOT ILIKE '%migration%' AND d.file_name NOT ILIKE '0001_%' AND d.file_name NOT ILIKE '__init__%' THEN 1.5
             -- Utilidades y helpers
             WHEN d.file_name ILIKE '%util%' THEN 1.2
             WHEN d.file_name ILIKE '%helper%' THEN 1.2
             -- Configuración
             WHEN d.file_name ILIKE '%config%' THEN 0.8
             WHEN d.file_name ILIKE '%.json' THEN 0.7
             WHEN d.file_name ILIKE '%.xml' THEN 0.7
             WHEN d.file_name ILIKE '%.yml' THEN 0.7
             WHEN d.file_name ILIKE '%.yaml' THEN 0.7
             -- Documentación
             WHEN d.file_name ILIKE '%readme%' THEN 0.6
             -- Tests (baja prioridad pero no excluir)
             WHEN d.file_name ILIKE '%test%' THEN 0.4
             WHEN d.file_name ILIKE '%spec%' THEN 0.4
             -- Archivos de migración y setup (muy baja prioridad)
             WHEN d.file_name ILIKE '%migration%' THEN 0.1
             WHEN d.file_name ILIKE '0001_%' THEN 0.1
             WHEN d.file_name ILIKE '%__init__%' THEN 0.1
             ELSE 0.5
           END as file_priority
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE 1 - (dc.embedding <=> $1::vector) > $2 ${whereClause}
         ORDER BY ((1 - (dc.embedding <=> $1::vector)) * CASE 
           -- Código fuente principal (máxima prioridad)
           WHEN d.file_name ILIKE '%.java' THEN 2.0
           WHEN d.file_name ILIKE '%.js' AND d.file_name NOT ILIKE '%test%' AND d.file_name NOT ILIKE '%spec%' THEN 2.0
           WHEN d.file_name ILIKE '%.ts' AND d.file_name NOT ILIKE '%test%' AND d.file_name NOT ILIKE '%spec%' THEN 2.0
           WHEN d.file_name ILIKE '%.cs' THEN 2.0
           WHEN d.file_name ILIKE '%.cpp' THEN 2.0
           WHEN d.file_name ILIKE '%.c' THEN 2.0
           WHEN d.file_name ILIKE '%.go' THEN 2.0
           WHEN d.file_name ILIKE '%.rs' THEN 2.0
           WHEN d.file_name ILIKE '%.php' THEN 2.0
           WHEN d.file_name ILIKE '%.rb' THEN 2.0
           WHEN d.file_name ILIKE '%.kt' THEN 2.0
           WHEN d.file_name ILIKE '%.swift' THEN 2.0
           -- Archivos de servicio y controladores (alta prioridad)
           WHEN d.file_name ILIKE '%service%' THEN 1.8
           WHEN d.file_name ILIKE '%controller%' THEN 1.8
           WHEN d.file_name ILIKE '%component%' THEN 1.8
           WHEN d.file_name ILIKE '%repository%' THEN 1.8
           WHEN d.file_name ILIKE '%dao%' THEN 1.8
           -- Python de aplicación (no migración)
           WHEN d.file_name ILIKE '%.py' AND d.file_name NOT ILIKE '%migration%' AND d.file_name NOT ILIKE '0001_%' AND d.file_name NOT ILIKE '__init__%' THEN 1.5
           -- Utilidades y helpers
           WHEN d.file_name ILIKE '%util%' THEN 1.2
           WHEN d.file_name ILIKE '%helper%' THEN 1.2
           -- Configuración
           WHEN d.file_name ILIKE '%config%' THEN 0.8
           WHEN d.file_name ILIKE '%.json' THEN 0.7
           WHEN d.file_name ILIKE '%.xml' THEN 0.7
           WHEN d.file_name ILIKE '%.yml' THEN 0.7
           WHEN d.file_name ILIKE '%.yaml' THEN 0.7
           -- Documentación
           WHEN d.file_name ILIKE '%readme%' THEN 0.6
           -- Tests (baja prioridad pero no excluir)
           WHEN d.file_name ILIKE '%test%' THEN 0.4
           WHEN d.file_name ILIKE '%spec%' THEN 0.4
           -- Archivos de migración y setup (muy baja prioridad)
           WHEN d.file_name ILIKE '%migration%' THEN 0.1
           WHEN d.file_name ILIKE '0001_%' THEN 0.1
           WHEN d.file_name ILIKE '%__init__%' THEN 0.1
           ELSE 0.5
         END) DESC
         LIMIT $3`,
        queryParams
      );

      logger.info(`   📈 Resultados búsqueda vectorial: ${result.rows.length} encontrados`);
      
      // Si hay pocos resultados, intentar búsqueda por texto con términos expandidos
      let textSearchResults = [];
      if (result.rows.length < limit) {
        logger.info(`   🔄 Búsqueda vectorial insuficiente (${result.rows.length}/${limit}), ejecutando búsqueda por texto...`);
        
        const textSearchQueries = expandedTerms.map((_, i) => `dc.chunk_text ILIKE $${i + 1}`).join(' OR ');
        const textSearchParams = expandedTerms.map(term => `%${term}%`);
        
        let textWhereClause = '';
        let textQueryParams = [...textSearchParams, limit - result.rows.length];
        
        if (groupId) {
          textWhereClause = 'AND d.group_id = $' + (textSearchParams.length + 2);
          textQueryParams.push(groupId);
        }
        
        try {
          const textResult = await client.query(
            `SELECT DISTINCT
               dc.chunk_text,
               dc.metadata,
               d.file_path,
               d.file_name,
               d.project_name,
               d.group_id,
               0.5 as similarity_score,
               CASE 
                 WHEN d.file_name ILIKE '%.java' THEN 2.0
                 WHEN d.file_name ILIKE '%.js' AND d.file_name NOT ILIKE '%test%' THEN 2.0
                 WHEN d.file_name ILIKE '%.ts' AND d.file_name NOT ILIKE '%test%' THEN 2.0
                 WHEN d.file_name ILIKE '%properties' THEN 1.8
                 WHEN d.file_name ILIKE '%config%' THEN 1.8
                 WHEN d.file_name ILIKE '%.yml' THEN 1.5
                 WHEN d.file_name ILIKE '%.yaml' THEN 1.5
                 WHEN d.file_name ILIKE '%.xml' THEN 1.2
                 WHEN d.file_name ILIKE '%.json' THEN 1.0
                 ELSE 0.8
               END as file_priority
             FROM document_chunks dc
             JOIN documents d ON dc.document_id = d.id
             WHERE (${textSearchQueries}) ${textWhereClause}
             ORDER BY file_priority DESC
             LIMIT $${textSearchParams.length + 1}`,
            textQueryParams
          );
          
          textSearchResults = textResult.rows;
          logger.info(`   📝 Resultados búsqueda por texto: ${textSearchResults.length} encontrados`);
        } catch (textError) {
          logger.warn(`   ⚠️ Error en búsqueda por texto: ${textError.message}`);
        }
      }
      
      // Combinar y deduplicar resultados
      const allResults = [...result.rows, ...textSearchResults];
      const uniqueResults = allResults.filter((result, index, self) => 
        index === self.findIndex(r => r.chunk_text === result.chunk_text)
      );
      
      logger.info(`   ✅ Total resultados únicos: ${uniqueResults.length}`);
      
      if (uniqueResults.length === 0) {
        logger.warn(`   ❌ No se encontraron resultados para "${query}" en grupo ${groupId}`);
        // Mostrar algunos documentos disponibles para debug
        try {
          const sampleDocs = await client.query(
            `SELECT file_name, project_name FROM documents WHERE ($1::text IS NULL OR group_id = $1) LIMIT 5`,
            [groupId]
          );
          logger.info(`   💡 Archivos disponibles de ejemplo: ${sampleDocs.rows.map(r => r.file_name).join(', ')}`);
        } catch (sampleError) {
          logger.warn(`   Error obteniendo archivos de ejemplo: ${sampleError.message}`);
        }
      } else {
        logger.info(`   📋 Archivos encontrados: ${[...new Set(uniqueResults.map(r => r.file_name))].join(', ')}`);
      }
      
      return uniqueResults.slice(0, limit).map(row => ({
        content: row.chunk_text,
        source: {
          file_path: row.file_path,
          file_name: row.file_name,
          project_name: row.project_name,
          group_id: row.group_id
        },
        relevance_score: parseFloat(row.similarity_score),
        file_priority: parseFloat(row.file_priority),
        combined_score: parseFloat(row.similarity_score) * parseFloat(row.file_priority),
        search_type: uniqueResults.indexOf(row) < result.rows.length ? 'vector_similarity_prioritized' : 'text_search',
        metadata: typeof row.metadata === 'string' ? 
          JSON.parse(row.metadata) : row.metadata
      }));
      
    } catch (error) {
      logger.error('Error en búsqueda por grupo:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Limpia la base de conocimiento
   */
  async clearAll() {
    await this.initialize();
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM document_chunks');
      await client.query('DELETE FROM documents');
      await client.query('DELETE FROM gitlab_groups');
      await client.query('COMMIT');
      
      logger.info('Base de conocimiento limpiada exitosamente');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error limpiando la base de conocimiento:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene la lista de repositorios indexados
   * @param {string} groupId - ID del grupo (opcional)
   * @returns {Array} Lista de repositorios con metadatos
   */
  async getIndexedRepositories(groupId = null) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          d.project_name,
          d.metadata->>'projectPath' as project_path,
          d.metadata->>'webUrl' as web_url,
          d.group_id,
          COUNT(DISTINCT d.id) as document_count,
          COUNT(DISTINCT dc.id) as chunk_count,
          MIN(d.created_at) as first_indexed,
          MAX(d.created_at) as last_indexed
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.project_name IS NOT NULL
      `;
      
      const params = [];
      
      if (groupId) {
        query += ` AND d.group_id = $1`;
        params.push(groupId);
      }
      
      query += `
        GROUP BY d.project_name, d.metadata->>'projectPath', d.metadata->>'webUrl', d.group_id
        ORDER BY last_indexed DESC
      `;
      
      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        projectName: row.project_name,
        projectPath: row.project_path,
        webUrl: row.web_url,
        groupId: row.group_id,
        documentCount: parseInt(row.document_count) || 0,
        chunkCount: parseInt(row.chunk_count) || 0,
        firstIndexed: row.first_indexed,
        lastIndexed: row.last_indexed
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Registra proyectos detectados en un grupo
   * @param {string} groupId - ID del grupo
   * @param {Array} projects - Array de proyectos
   */
  async registerProjects(groupId, projects) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      for (const project of projects) {
        await client.query(`
          INSERT INTO projects (group_id, project_id, project_name, project_path, web_url, description, default_branch, visibility)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (group_id, project_id) 
          DO UPDATE SET 
            project_name = EXCLUDED.project_name,
            project_path = EXCLUDED.project_path,
            web_url = EXCLUDED.web_url,
            description = EXCLUDED.description,
            default_branch = EXCLUDED.default_branch,
            visibility = EXCLUDED.visibility,
            detected_at = CURRENT_TIMESTAMP
        `, [
          groupId,
          project.id.toString(),
          project.name,
          project.path_with_namespace || project.path,
          project.web_url,
          project.description,
          project.default_branch,
          project.visibility
        ]);
      }
      
      logger.info(`✅ Registrados ${projects.length} proyectos para grupo ${groupId}`);
    } catch (error) {
      logger.error(`❌ Error registrando proyectos para grupo ${groupId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene repositorios detectados (con o sin archivos indexados)
   * @param {string} groupId - ID del grupo
   * @returns {Array} Lista de repositorios
   */
  async getDetectedRepositories(groupId = null) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          p.*,
          COALESCE(d.document_count, 0) as document_count,
          COALESCE(d.chunk_count, 0) as chunk_count,
          d.first_indexed,
          d.last_indexed
        FROM projects p
        LEFT JOIN (
          SELECT 
            d.metadata->>'projectId' as project_id,
            d.group_id,
            COUNT(DISTINCT d.id) as document_count,
            COUNT(DISTINCT dc.id) as chunk_count,
            MIN(d.created_at) as first_indexed,
            MAX(d.created_at) as last_indexed
          FROM documents d
          LEFT JOIN document_chunks dc ON d.id = dc.document_id
          WHERE d.metadata->>'projectId' IS NOT NULL
          GROUP BY d.metadata->>'projectId', d.group_id
        ) d ON p.project_id = d.project_id AND p.group_id = d.group_id
      `;
      
      const params = [];
      
      if (groupId) {
        query += ` WHERE p.group_id = $1`;
        params.push(groupId);
      }
      
      query += ` ORDER BY p.detected_at DESC`;
      
      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        projectId: row.project_id,
        projectName: row.project_name,
        projectPath: row.project_path,
        webUrl: row.web_url,
        description: row.description,
        defaultBranch: row.default_branch,
        visibility: row.visibility,
        groupId: row.group_id,
        detectedAt: row.detected_at,
        documentCount: parseInt(row.document_count) || 0,
        chunkCount: parseInt(row.chunk_count) || 0,
        firstIndexed: row.first_indexed,
        lastIndexed: row.last_indexed,
        isIndexed: parseInt(row.document_count) > 0
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Limpia todos los datos de un grupo específico antes de reindexar
   * @param {string} groupId - ID del grupo
   * @returns {Object} Resultado de la limpieza
   */
  async clearGroupData(groupId) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Contar elementos antes de borrar
      const beforeResult = await client.query(`
        SELECT 
          COUNT(DISTINCT d.id) as document_count,
          COUNT(DISTINCT dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.group_id = $1
      `, [groupId]);
      
      const beforeCounts = beforeResult.rows[0];
      
      // Borrar chunks primero (por foreign key constraint)
      await client.query(`
        DELETE FROM document_chunks 
        WHERE document_id IN (
          SELECT id FROM documents WHERE group_id = $1
        )
      `, [groupId]);
      
      // Borrar documentos
      await client.query('DELETE FROM documents WHERE group_id = $1', [groupId]);
      
      // Mantener el registro del grupo y proyectos para evitar re-clonado
      // Solo limpiamos los documentos indexados
      
      await client.query('COMMIT');
      
      logger.info(`🧹 Datos del grupo ${groupId} limpiados: ${beforeCounts.document_count} documentos, ${beforeCounts.chunk_count} chunks`);
      
      return {
        success: true,
        deletedDocuments: parseInt(beforeCounts.document_count) || 0,
        deletedChunks: parseInt(beforeCounts.chunk_count) || 0
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error limpiando datos del grupo ${groupId}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene el estado actual de un repositorio (hash del último commit indexado)
   * @param {string} groupId - ID del grupo
   * @param {string} projectName - Nombre del proyecto
   * @returns {Object|null} Estado del repositorio o null si no existe
   */
  async getRepositoryState(groupId, projectName) {
    await this.initialize();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          d.metadata->>'lastCommitHash' as last_commit_hash,
          MAX(d.created_at) as last_indexed_at,
          COUNT(DISTINCT d.id) as document_count,
          COUNT(DISTINCT dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.group_id = $1 
          AND d.project_name = $2
        GROUP BY d.metadata->>'lastCommitHash'
      `, [groupId, projectName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        lastCommitHash: row.last_commit_hash,
        lastIndexedAt: row.last_indexed_at,
        documentCount: parseInt(row.document_count) || 0,
        chunkCount: parseInt(row.chunk_count) || 0
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Cierra la conexión a la base de datos
   */
  async close() {
    await this.pool.end();
    logger.info('Conexión a la base de datos cerrada');
  }
}

module.exports = KnowledgeBase;