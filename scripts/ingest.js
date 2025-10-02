#!/usr/bin/env node

/**
 * Script de ingesta para indexar contenido de GitLab en la base de conocimiento
 * 
 * Uso:
 *   npm run ingest
 *   node scripts/ingest.js
 *   node scripts/ingest.js --project-id=123 --clear-first
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GitLabClient = require('../src/gitlab_client');
const KnowledgeBase = require('../src/knowledge_base');
const winston = require('winston');

// Configuración del logger para el script
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
      if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/ingest.log' })
  ]
});

class IngestScript {
  constructor() {
    this.gitlabClient = new GitLabClient();
    this.knowledgeBase = new KnowledgeBase();
    this.stats = {
      startTime: Date.now(),
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      errors: 0,
      totalChunks: 0
    };
  }

  /**
   * Parsea los argumentos de línea de comandos
   */
  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      clearFirst: false,
      projectId: null,
      groupId: null,
      dryRun: false,
      verbose: false,
      ref: process.env.INGEST_REF || 'master'
    };

    for (const arg of args) {
      if (arg === '--clear-first' || arg === '-c') {
        options.clearFirst = true;
      } else if (arg === '--dry-run' || arg === '-d') {
        options.dryRun = true;
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg.startsWith('--project-id=')) {
        options.projectId = arg.split('=')[1];
      } else if (arg.startsWith('--group-id=')) {
        options.groupId = arg.split('=')[1];
      } else if (arg.startsWith('--ref=')) {
        options.ref = arg.split('=')[1];
      } else if (arg === '--help' || arg === '-h') {
        this.showHelp();
        process.exit(0);
      }
    }

    return options;
  }

  /**
   * Muestra la ayuda del script
   */
  showHelp() {
    console.log(`
Asistente de IA Local - Script de Ingesta
==========================================

Este script indexa el contenido de un repositorio de GitLab en la base de conocimiento.

Uso:
  npm run ingest [opciones]
  node scripts/ingest.js [opciones]

Opciones:
  --clear-first, -c       Limpia la base de conocimiento antes de indexar
  --project-id=<ID>       ID específico del proyecto (sobreescribe .env)
  --ref=<branch>          Forzar una rama/ref para obtener contenido (por defecto: master)
  --dry-run, -d           Ejecuta sin hacer cambios (solo muestra lo que haría)
  --verbose, -v           Muestra información detallada
  --help, -h              Muestra esta ayuda

Variables de entorno requeridas (archivo .env):
  GITLAB_API_URL          URL de la API de GitLab
  GITLAB_PRIVATE_TOKEN    Token privado de GitLab
  GITLAB_PROJECT_ID       ID del proyecto de GitLab
  DB_HOST, DB_PORT, etc.  Configuración de base de datos

Ejemplos:
  npm run ingest                           # Indexa el proyecto configurado en .env
  npm run ingest -- --clear-first          # Limpia y reindexа
  npm run ingest -- --project-id=123       # Indexa proyecto específico
  npm run ingest -- --dry-run --verbose    # Vista previa detallada
`);
  }

  /**
   * Valida la configuración antes de ejecutar
   */
  validateConfiguration() {
    // Requerimos las variables mínimas para conectar a GitLab y Postgres.
    const requiredAlways = ['GITLAB_API_URL', 'GITLAB_PRIVATE_TOKEN', 'DB_HOST', 'DB_NAME', 'DB_USER'];

    const missingAlways = requiredAlways.filter(key => !process.env[key]);
    if (missingAlways.length > 0) {
      logger.error('Variables de entorno faltantes:', missingAlways.join(', '));
      logger.error('Verifica tu archivo .env');
      return false;
    }

    // Debe estar configurado al menos un objetivo: projectId (env o flag) o groupId (env o flag)
    const hasProject = !!(process.env.GITLAB_PROJECT_ID);
    const hasGroup = !!(process.env.GITLAB_GROUP_ID);
    if (!hasProject && !hasGroup) {
      logger.warn('No se encontró GITLAB_PROJECT_ID ni GITLAB_GROUP_ID en .env. Puedes pasar --project-id o --group-id.');
      // This is not fatal here because the CLI may pass --project-id or --group-id later.
    }

    return true;
  }

  /**
   * Ejecuta el proceso de ingesta
   */
  async run() {
    try {
      logger.info('🚀 Iniciando proceso de ingesta...');

      // Parsear argumentos
      const options = this.parseArguments();
      
      if (options.verbose) {
        logger.level = 'debug';
        logger.debug('Opciones:', options);
      }

      // Validar configuración
      if (!this.validateConfiguration()) {
        process.exit(1);
      }

      // Mostrar información inicial
      if (options.dryRun) {
        logger.info('🔍 MODO DRY-RUN: No se realizarán cambios reales');
      }

      // Sobreescribir project ID si se proporciona
      if (options.projectId) {
        process.env.GITLAB_PROJECT_ID = options.projectId;
        logger.info(`📁 Usando project ID: ${options.projectId}`);
      }

      // Sobreescribir group ID si se proporciona como argumento
      if (options.groupId) {
        process.env.GITLAB_GROUP_ID = options.groupId;
        logger.info(`📂 Usando group ID: ${options.groupId}`);
      }

      // Si se proporcionó un groupId, listar proyectos y procesarlos uno por uno
      if (process.env.GITLAB_GROUP_ID) {
        logger.info('📂 Se ha detectado un GROUP_ID, listando proyectos del grupo...');
        const projects = await this.gitlabClient.listGroupProjects(process.env.GITLAB_GROUP_ID);
        logger.info(`🔎 Se encontraron ${projects.length} proyectos en el grupo`);

        if (projects.length === 0) {
          logger.warn('⚠️  No se encontraron proyectos en el grupo');
          return;
        }

        // Si clearFirst se solicita, limpiar una sola vez antes de procesar todos los proyectos
        if (options.clearFirst && !options.dryRun) {
          logger.info('🧹 Limpiando base de conocimiento antes de procesar proyectos del grupo...');
          await this.knowledgeBase.clearAll();
        }

        // Iterar proyectos
        for (const proj of projects) {
          logger.info(`➡️  Procesando proyecto: ${proj.name} (${proj.web_url}) [id=${proj.id}]`);

          // Cambiar el projectId del cliente para este proyecto
          this.gitlabClient.setProjectId(proj.id);

          if (options.dryRun) {
            logger.info(`(dry-run) Se listarán archivos del proyecto ${proj.name} pero no se indexarán`);
            try {
              const filesPreview = await this.gitlabClient.getRepositoryTree('', options.ref);
              logger.info(`  Archivos detectados: ${filesPreview.length}`);
            } catch (err) {
              logger.warn(`  No se pudo listar archivos para el proyecto ${proj.id}: ${err.message}`);
            }
            continue;
          }

          try {
            const files = await this.gitlabClient.scanRepository(options.ref);
            this.stats.totalFiles += files.length;
            logger.info(`  📄 Proyecto ${proj.name}: ${files.length} archivos encontrados`);

            // Indexar archivos de este proyecto
            await this.knowledgeBase.indexData(files);
            // Pequeña pausa entre proyectos para evitar rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (err) {
            logger.error(`  ❌ Error procesando proyecto ${proj.id}: ${err.message}`);
            this.stats.errors += 1;
          }
        }

        // Obtener estadísticas finales
        const kbInfo = await this.knowledgeBase.getInfo();
        this.stats.processedFiles = kbInfo.total_documents;
        this.stats.totalChunks = kbInfo.total_chunks;

        this.stats.endTime = Date.now();
        this.stats.totalTime = this.stats.endTime - this.stats.startTime;
        this.showSummary();

        return;
      }

      // Obtener información del proyecto (modo single-project)
      logger.info('📋 Obteniendo información del proyecto...');
      const projectInfo = await this.gitlabClient.getProjectInfo();
      logger.info(`Proyecto: ${projectInfo.name} (${projectInfo.web_url})`);

      // Limpiar base de conocimiento si se solicita
      if (options.clearFirst && !options.dryRun) {
        logger.info('🧹 Limpiando base de conocimiento...');
        await this.knowledgeBase.clearAll();
      }

  // Escanear repositorio
  logger.info('🔍 Escaneando archivos del repositorio...');
  const files = await this.gitlabClient.scanRepository(options.ref);
      
      this.stats.totalFiles = files.length;
      logger.info(`📄 Se encontraron ${files.length} archivos para procesar`);

      if (files.length === 0) {
        logger.warn('⚠️  No se encontraron archivos para indexar');
        return;
      }

      // Mostrar resumen de archivos
      if (options.verbose) {
        const filesByExtension = {};
        files.forEach(file => {
          const ext = path.extname(file.file_name) || 'sin extensión';
          filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;
        });
        
        logger.debug('Archivos por tipo:', filesByExtension);
      }

      if (options.dryRun) {
        logger.info('📋 Vista previa de archivos a procesar:');
        files.slice(0, 10).forEach((file, index) => {
          logger.info(`  ${index + 1}. ${file.file_path} (${file.size} bytes)`);
        });
        if (files.length > 10) {
          logger.info(`  ... y ${files.length - 10} archivos más`);
        }
        logger.info('🔍 Dry-run completado. Usa sin --dry-run para procesar realmente.');
        return;
      }

      // Procesar archivos
      logger.info('⚙️  Iniciando indexación...');
      const progressInterval = setInterval(() => {
        const progress = ((this.stats.processedFiles + this.stats.skippedFiles) / this.stats.totalFiles * 100).toFixed(1);
        logger.info(`📊 Progreso: ${progress}% (${this.stats.processedFiles + this.stats.skippedFiles}/${this.stats.totalFiles})`);
      }, 10000); // Actualizar cada 10 segundos

      try {
        await this.knowledgeBase.indexData(files);
        clearInterval(progressInterval);
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }

      // Obtener estadísticas finales
      const kbInfo = await this.knowledgeBase.getInfo();
      
      this.stats.endTime = Date.now();
      this.stats.totalTime = this.stats.endTime - this.stats.startTime;
      this.stats.processedFiles = kbInfo.total_documents;
      this.stats.totalChunks = kbInfo.total_chunks;

      // Mostrar resumen final
      this.showSummary();

    } catch (error) {
      logger.error('❌ Error durante la ingesta:', error.message);
      logger.debug('Stack trace:', error.stack);
      process.exit(1);
    }
  }

  /**
   * Muestra el resumen final del proceso
   */
  showSummary() {
    const minutes = Math.floor(this.stats.totalTime / 60000);
    const seconds = Math.floor((this.stats.totalTime % 60000) / 1000);
    
    logger.info('✅ Proceso de ingesta completado exitosamente!');
    logger.info('');
    logger.info('📊 RESUMEN:');
    logger.info(`   ⏱️  Tiempo total: ${minutes}m ${seconds}s`);
    logger.info(`   📄 Archivos encontrados: ${this.stats.totalFiles}`);
    logger.info(`   ✅ Archivos procesados: ${this.stats.processedFiles}`);
    logger.info(`   📦 Chunks generados: ${this.stats.totalChunks}`);
    logger.info(`   ❌ Errores: ${this.stats.errors}`);
    
    if (this.stats.totalChunks > 0) {
      const avgChunksPerFile = (this.stats.totalChunks / this.stats.processedFiles).toFixed(1);
      logger.info(`   📈 Promedio chunks por archivo: ${avgChunksPerFile}`);
    }
    
    logger.info('');
    logger.info('🎉 La base de conocimiento está lista para usar!');
    logger.info('   Puedes iniciar el servidor con: npm start');
  }
}

// Ejecutar script si se llama directamente
if (require.main === module) {
  const ingestScript = new IngestScript();
  
  // Manejar señales de interrupción
  process.on('SIGINT', () => {
    console.log('\n⚠️  Proceso interrumpido por el usuario');
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    console.log('\n⚠️  Proceso terminado');
    process.exit(1);
  });

  // Manejar errores no capturados
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Ejecutar
  ingestScript.run().catch(error => {
    logger.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = IngestScript;