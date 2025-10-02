const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const winston = require('winston');
require('dotenv').config();

const agent = require('./agent');

// Configuración del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-assistant' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de seguridad y utilidad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Servir frontend estático desde /public
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta de salud del servicio
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'AI Assistant'
  });
});

// Ruta principal para hacer preguntas al asistente
app.post('/ask', async (req, res) => {
  try {
    const { prompt, aiProvider } = req.body;

    // Validación de entrada
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'El campo "prompt" es requerido y debe ser una cadena no vacía',
        code: 'INVALID_PROMPT'
      });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({
        error: 'El prompt no puede exceder los 2000 caracteres',
        code: 'PROMPT_TOO_LONG'
      });
    }

    logger.info(`Procesando pregunta: ${prompt.substring(0, 100)}...`);

    // Extraer groupId del cuerpo de la solicitud si existe
    const { groupId } = req.body;

    // Usar el proveedor especificado o el por defecto
    if (aiProvider && ['gemini', 'claude', 'openai'].includes(aiProvider)) {
      const agentInstance = agent.getAgent();
      const success = agentInstance.setAIProvider(aiProvider);
      
      if (!success) {
        return res.status(400).json({
          error: `El proveedor de IA "${aiProvider}" no está disponible. Verifica la configuración de API.`,
          code: 'AI_PROVIDER_NOT_AVAILABLE',
          availableProviders: agentInstance.getAvailableProviders()
        });
      }
    }

    // Llamar al agente para obtener la respuesta
    let response;
    if (groupId) {
      // Si se especifica un grupo, usar la función específica para grupos
      response = await agent.getAgent().answerQuestionInGroup(prompt.trim(), groupId);
    } else {
      // Usar la función general
      response = await agent.answerQuestion(prompt.trim());
    }

    res.status(200).json({
      success: true,
      prompt: prompt.trim(),
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error procesando pregunta:', error);

    // Manejo de errores específicos
    if (error.message.includes('API_KEY')) {
      return res.status(500).json({
        error: 'Error de configuración del servicio',
        code: 'CONFIG_ERROR'
      });
    }

    if (error.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'Límite de solicitudes excedido. Intenta de nuevo más tarde',
        code: 'RATE_LIMIT'
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor. Intenta de nuevo más tarde',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Endpoints para manejo de proveedores de IA
app.get('/ai/status', async (req, res) => {
  try {
    const agentInstance = agent.getAgent();
    const currentProvider = agentInstance.currentAIProvider || 'gemini';
    
    // Verificar estado de cada proveedor
    const geminiAvailable = agentInstance.geminiClient && process.env.GEMINI_API_KEY;
    const claudeAvailable = agentInstance.claudeClient && process.env.ANTHROPIC_API_KEY;

    res.status(200).json({
      success: true,
      current: currentProvider,
      gemini: !!geminiAvailable,
      claude: !!claudeAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error obteniendo estado de proveedores IA:', error);
    res.status(500).json({
      error: 'Error obteniendo estado de proveedores IA',
      code: 'AI_STATUS_ERROR'
    });
  }
});

app.post('/ai/provider', async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider || !['gemini', 'claude'].includes(provider)) {
      return res.status(400).json({
        error: 'Proveedor inválido. Use "gemini" o "claude"',
        code: 'INVALID_PROVIDER'
      });
    }

    const agentInstance = agent.getAgent();
    
    // Verificar que el proveedor esté disponible
    if (provider === 'gemini' && (!agentInstance.geminiClient || !process.env.GEMINI_API_KEY)) {
      return res.status(400).json({
        error: 'Gemini no está disponible. Verifique la configuración de API',
        code: 'GEMINI_UNAVAILABLE'
      });
    }

    if (provider === 'claude' && (!agentInstance.claudeClient || !process.env.ANTHROPIC_API_KEY)) {
      return res.status(400).json({
        error: 'Claude no está disponible. Verifique la configuración de API',
        code: 'CLAUDE_UNAVAILABLE'
      });
    }

    // Cambiar el proveedor
    agentInstance.setAIProvider(provider);
    
    logger.info(`Proveedor de IA cambiado a: ${provider}`);

    res.status(200).json({
      success: true,
      provider: provider,
      message: `Proveedor cambiado a ${provider === 'claude' ? 'Claude' : 'Gemini'}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error cambiando proveedor de IA:', error);
    res.status(500).json({
      error: 'Error cambiando proveedor de IA',
      code: 'AI_PROVIDER_ERROR'
    });
  }
});

// Store para trabajos en progreso
const indexingJobs = new Map();

// Middleware para validar configuración de GitLab
function validateGitLabConfig(req, res, next) {
  if (!process.env.GITLAB_PRIVATE_TOKEN) {
    return res.status(400).json({
      error: 'Token de GitLab no configurado. Configure GITLAB_PRIVATE_TOKEN en las variables de entorno.',
      code: 'GITLAB_TOKEN_MISSING'
    });
  }
  
  if (!process.env.GITLAB_API_URL) {
    req.gitlabApiUrl = 'https://gitlab.com/api/v4';
  }
  
  next();
}

// Ruta para validar token de GitLab
app.get('/gitlab/validate', validateGitLabConfig, async (req, res) => {
  try {
    const agentInstance = agent.getAgent();
    if (!agentInstance.gitlabClient) {
      throw new Error('Cliente de GitLab no inicializado');
    }

    // Probar el token listando grupos accesibles
    const groups = await agentInstance.gitlabClient.listAccessibleGroups();
    
    res.status(200).json({
      success: true,
      message: 'Token de GitLab válido',
      accessibleGroups: groups.length,
      apiUrl: process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error validando token de GitLab:', error);
    res.status(401).json({
      error: 'Token de GitLab inválido o sin permisos suficientes',
      code: 'GITLAB_TOKEN_INVALID',
      details: error.message
    });
  }
});

// Ruta para listar grupos accesibles
app.get('/gitlab/groups', validateGitLabConfig, async (req, res) => {
  try {
    const agentInstance = agent.getAgent();
    const groups = await agentInstance.gitlabClient.listAccessibleGroups();
    
    res.status(200).json({
      success: true,
      groups: groups,
      count: groups.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error listando grupos de GitLab:', error);
    res.status(500).json({
      error: 'Error obteniendo grupos de GitLab',
      code: 'GITLAB_GROUPS_ERROR',
      details: error.message
    });
  }
});

// Ruta para agregar un grupo de GitLab y indexar todos sus repositorios (flujo simplificado con groupId)
app.post('/groups', validateGitLabConfig, async (req, res) => {
  try {
    const { groupId, groupName, async: asyncMode = false } = req.body;

    if (!groupId) {
      return res.status(400).json({
        error: 'groupId es requerido. Especifica el ID numérico del grupo de GitLab.',
        code: 'MISSING_GROUP_ID',
        example: { groupId: "1851", groupName: "IFC Transfer Files", async: true }
      });
    }

    logger.info(`Iniciando indexado del grupo: ${groupId} (${groupName || 'Sin nombre'})`);

    const agentInstance = agent.getAgent();
    
    if (asyncMode) {
      // Crear ID único para el trabajo
      const jobId = `group_${groupId}_${Date.now()}`;
      
      // Iniciar trabajo asíncrono
      indexingJobs.set(jobId, {
        id: jobId,
        groupId,
        groupName,
        status: 'initializing',
        progress: 0,
        message: `Obteniendo información del grupo ${groupId}...`,
        startTime: Date.now(),
        projectsFound: 0,
        projectsCloned: 0,
        projectsIndexed: 0,
        filesProcessed: 0,
        totalChunks: 0
      });

      // Procesar en background
      processGroupWithCloneAsync(jobId, groupId, { groupName });

      return res.status(202).json({
        success: true,
        message: `Indexado asíncrono iniciado para grupo ${groupId}`,
        jobId: jobId,
        groupId: groupId,
        status: 'processing',
        timestamp: new Date().toISOString()
      });
    } else {
      // Indexado síncrono
      const indexResult = await agentInstance.indexGitLabGroupWithClone(groupId, {
        groupName
      });

      // Calcular archivos procesados de los resultados
      const filesProcessed = indexResult.processingResults 
        ? indexResult.processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0)
        : 0;

      res.status(200).json({
        success: true,
        message: `Grupo ${indexResult.groupName} indexado correctamente`,
        groupId: indexResult.groupId,
        groupName: indexResult.groupName,
        projectsFound: indexResult.projectsFound,
        projectsCloned: indexResult.projectsCloned,
        projectsIndexed: indexResult.projectsIndexed,
        filesProcessed: filesProcessed,
        totalChunks: indexResult.totalChunks,
        processingTime: indexResult.processingTime,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error('Error agregando grupo GitLab:', error);
    res.status(500).json({
      error: error.message || 'Error agregando grupo GitLab',
      code: 'GROUP_INDEX_ERROR'
    });
  }
});

// Función para procesar grupo asíncrono
async function processGroupAsync(jobId, groupId, options) {
  try {
    const job = indexingJobs.get(jobId);
    if (!job) return;

    const agentInstance = agent.getAgent();
    
    // Actualizar progreso
    job.status = 'processing';
    job.message = 'Obteniendo información del grupo...';
    job.progress = 10;

    const indexResult = await agentInstance.indexGitLabGroup(groupId, options);

    // Completar trabajo
    job.status = 'completed';
    job.message = 'Indexado completado exitosamente';
    job.progress = 100;
    job.projectsFound = indexResult.projectsFound;
    job.projectsIndexed = indexResult.projectsIndexed;
    job.totalChunks = indexResult.totalChunks;
    job.processingTime = Date.now() - job.startTime;

    // Limpiar trabajo después de 1 hora
    setTimeout(() => {
      indexingJobs.delete(jobId);
    }, 3600000);

  } catch (error) {
    const job = indexingJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.message = `Error: ${error.message}`;
      job.progress = 0;
      job.error = error.message;
    }
    logger.error(`Error en trabajo asíncrono ${jobId}:`, error);
  }
}

// Función para procesar grupo con clone asíncrono (flujo simplificado)
async function processGroupWithCloneAsync(jobId, groupId, options) {
  try {
    const job = indexingJobs.get(jobId);
    if (!job) return;

    const agentInstance = agent.getAgent();
    
    // Callback para actualizar progreso en tiempo real
    const progressCallback = (progress) => {
      if (job) {
        job.status = progress.status;
        job.message = progress.message;
        job.progress = progress.progress;
        
        // Actualizar información del grupo
        if (progress.groupId !== undefined) {
          job.groupId = progress.groupId;
        }
        if (progress.groupName !== undefined) {
          job.groupName = progress.groupName;
        }
        if (progress.projectsFound !== undefined) {
          job.projectsFound = progress.projectsFound;
        }
        if (progress.projectsCloned !== undefined) {
          job.projectsCloned = progress.projectsCloned;
        }
        if (progress.projectsIndexed !== undefined) {
          job.projectsIndexed = progress.projectsIndexed;
        }
        if (progress.filesProcessed !== undefined) {
          job.filesProcessed = progress.filesProcessed;
        }
        if (progress.totalChunks !== undefined) {
          job.totalChunks = progress.totalChunks;
        }
        if (progress.currentProject) {
          job.currentProject = progress.currentProject;
        }
      }
    };

    const indexResult = await agentInstance.indexGitLabGroupWithClone(groupId, options, progressCallback);

    // Completar trabajo
    job.status = 'completed';
    job.message = `Indexación completada: ${indexResult.projectsIndexed}/${indexResult.projectsFound} repositorios indexados`;
    job.progress = 100;
    job.groupId = indexResult.groupId;
    job.groupName = indexResult.groupName;
    job.projectsFound = indexResult.projectsFound;
    job.projectsCloned = indexResult.projectsCloned;
    job.projectsIndexed = indexResult.projectsIndexed;
    job.filesProcessed = indexResult.filesProcessed;
    job.totalChunks = indexResult.totalChunks;
    job.processingTime = Date.now() - job.startTime;

    // Limpiar trabajo después de 1 hora
    setTimeout(() => {
      indexingJobs.delete(jobId);
    }, 3600000);

  } catch (error) {
    const job = indexingJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.message = `Error: ${error.message}`;
      job.progress = 0;
      job.error = error.message;
    }
    logger.error(`Error en trabajo asíncrono con clone ${jobId}:`, error);
  }
}

// Ruta para obtener el estado de un trabajo de indexado
app.get('/groups/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = indexingJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Trabajo no encontrado',
      code: 'JOB_NOT_FOUND'
    });
  }

  res.status(200).json({
    success: true,
    job: job,
    timestamp: new Date().toISOString()
  });
});

// Ruta para obtener información sobre grupos indexados
app.get('/groups', async (req, res) => {
  try {
    logger.info('Solicitando información de grupos');
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    logger.info('Obteniendo grupos indexados...');
    const groupsInfo = await agentInstance.getIndexedGroups();
    logger.info(`Grupos obtenidos: ${groupsInfo.length}`);

    res.status(200).json({
      success: true,
      groups: groupsInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error obteniendo información de grupos:', error);
    res.status(500).json({
      error: 'Error obteniendo información de grupos',
      code: 'GROUPS_INFO_ERROR'
    });
  }
});

// Ruta para obtener repositorios indexados
app.get('/repositories', async (req, res) => {
  try {
    logger.info('Solicitando información de repositorios');
    const { groupId } = req.query;
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    logger.info(`Obteniendo repositorios indexados para grupo: ${groupId || 'todos'}`);
    const repositories = await agentInstance.getIndexedRepositories(groupId);
    logger.info(`Repositorios obtenidos: ${repositories.length}`);

    res.status(200).json({
      success: true,
      repositories: repositories,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error obteniendo repositorios:', error);
    res.status(500).json({
      error: 'Error obteniendo repositorios',
      code: 'REPOSITORIES_ERROR'
    });
  }
});

// Ruta para reindexar un repositorio específico
app.post('/repositories/:projectName/reindex', validateGitLabConfig, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { groupId } = req.body;

    logger.info(`Iniciando reindexación del repositorio: ${projectName}`);

    const agentInstance = agent.getAgent();
    const reindexResult = await agentInstance.reindexRepository(projectName, groupId);

    res.status(200).json({
      success: true,
      message: `Repositorio ${projectName} reindexado correctamente`,
      projectName: projectName,
      filesIndexed: reindexResult.filesIndexed,
      chunksGenerated: reindexResult.chunksGenerated,
      processingTime: reindexResult.processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error reindexando repositorio:', error);
    res.status(500).json({
      error: error.message || 'Error reindexando repositorio',
      code: 'REPOSITORY_REINDEX_ERROR'
    });
  }
});

// Ruta para obtener información sobre la base de conocimiento
app.get('/ai/info', async (req, res) => {
  try {
    // Usar la instancia del agente (singleton) que contiene la knowledgeBase
    const agentInstance = agent.getAgent();
    const info = await agentInstance.knowledgeBase.getInfo();

    res.status(200).json({
      success: true,
      data: info,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error obteniendo información de la base de conocimiento:', error);
    res.status(500).json({
      error: 'Error obteniendo información de la base de conocimiento',
      code: 'KB_INFO_ERROR'
    });
  }
});

// Nuevo endpoint para la interfaz - obtener todos los grupos disponibles
app.get('/api/groups', async (req, res) => {
  try {
    logger.info('Solicitando lista de grupos disponibles para la interfaz');
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    const groupsInfo = await agentInstance.getIndexedGroups();
    logger.info(`Grupos disponibles para interfaz: ${groupsInfo.length}`);

    res.status(200).json({
      success: true,
      groups: groupsInfo.map(group => ({
        id: group.groupId,
        name: group.name,
        repositoryCount: group.projectsCount,
        chunkCount: group.chunksCount,
        lastIndexed: group.indexedAt
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error obteniendo grupos para interfaz:', error);
    res.status(500).json({
      error: 'Error obteniendo grupos',
      code: 'API_GROUPS_ERROR'
    });
  }
});

// Endpoint para obtener proveedores de IA disponibles
app.get('/api/providers', async (req, res) => {
  try {
    logger.info('Solicitando proveedores de IA disponibles');
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    const availableProviders = agentInstance.getAvailableProviders();
    const currentProvider = agentInstance.currentAIProvider;
    
    logger.info(`Proveedores disponibles: ${availableProviders.join(', ')}, activo: ${currentProvider}`);

    res.status(200).json({
      success: true,
      current: currentProvider,
      available: availableProviders,
      providers: {
        gemini: availableProviders.includes('gemini'),
        claude: availableProviders.includes('claude'),
        openai: availableProviders.includes('openai')
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error obteniendo proveedores:', error);
    res.status(500).json({
      error: 'Error obteniendo proveedores',
      code: 'API_PROVIDERS_ERROR'
    });
  }
});

// Endpoint para obtener plataformas de repositorio disponibles
app.get('/api/platforms', async (req, res) => {
  try {
    logger.info('Solicitando plataformas de repositorio disponibles');
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    const availablePlatforms = agentInstance.getAvailablePlatforms();
    const currentPlatform = agentInstance.currentRepositoryPlatform;
    
    logger.info(`Plataformas disponibles: ${availablePlatforms.join(', ')}, activa: ${currentPlatform}`);

    res.status(200).json({
      success: true,
      current: currentPlatform,
      available: availablePlatforms,
      platforms: {
        gitlab: availablePlatforms.includes('gitlab'),
        github: availablePlatforms.includes('github')
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error obteniendo plataformas:', error);
    res.status(500).json({
      error: 'Error obteniendo plataformas',
      code: 'API_PLATFORMS_ERROR'
    });
  }
});

// Endpoint para cambiar plataforma de repositorio
app.post('/api/platforms/switch', async (req, res) => {
  try {
    const { platform } = req.body;
    logger.info(`Solicitando cambio de plataforma a: ${platform}`);
    
    const agentInstance = agent.getAgent();
    
    if (!agentInstance) {
      logger.error('Agent instance is null');
      return res.status(500).json({
        error: 'Agente no inicializado',
        code: 'AGENT_NOT_INITIALIZED'
      });
    }

    if (!platform || !['gitlab', 'github'].includes(platform)) {
      return res.status(400).json({
        error: 'Plataforma inválida. Debe ser "gitlab" o "github"',
        code: 'INVALID_PLATFORM'
      });
    }

    const success = agentInstance.setRepositoryPlatform(platform);
    
    if (success) {
      logger.info(`Plataforma cambiada exitosamente a: ${platform}`);
      res.status(200).json({
        success: true,
        platform: platform,
        message: `Plataforma cambiada a ${platform}`,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error(`No se pudo cambiar a la plataforma: ${platform}`);
      res.status(400).json({
        error: `Plataforma ${platform} no disponible o no configurada`,
        code: 'PLATFORM_NOT_AVAILABLE'
      });
    }

  } catch (error) {
    logger.error('Error cambiando plataforma:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Lista documentos por proyecto (para carga bajo demanda)
app.get('/knowledge-base/project/:name', async (req, res) => {
  try {
    const agentInstance = agent.getAgent();
    const docs = await agentInstance.knowledgeBase.getDocumentsByProject(req.params.name);
    res.status(200).json({ success: true, project: req.params.name, documents: docs });
  } catch (error) {
    logger.error('Error listando documentos por proyecto:', error);
    res.status(500).json({ error: 'Error listando documentos por proyecto' });
  }
});

// Obtener contenido completo de un documento por id
app.get('/knowledge-base/document/:id', async (req, res) => {
  try {
    const agentInstance = agent.getAgent();
    const doc = await agentInstance.knowledgeBase.getDocumentContent(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    res.status(200).json({ success: true, document: doc });
  } catch (error) {
    logger.error('Error obteniendo documento:', error);
    res.status(500).json({ error: 'Error obteniendo documento' });
  }
});

// Endpoint para desencadenar reindexado manual de un proyecto (en background)
const reindexJobs = require('./reindex_jobs');
app.post('/knowledge-base/reindex/:project', async (req, res) => {
  try {
    const projectName = req.params.project;
    if (!projectName) return res.status(400).json({ error: 'Nombre de proyecto requerido' });

    const job = reindexJobs.createJob('project_reindex', { projectName, ref: req.body.ref || null });

    // If client requested to wait for completion, wait (but default is async)
    if (req.query.wait === '1') {
      try {
        const completed = await reindexJobs.waitForCompletion(job.id, 1000 * 60 * 5);
        return res.status(200).json({ success: true, job: completed });
      } catch (err) {
        return res.status(500).json({ success: false, reason: err.message });
      }
    }

    return res.status(202).json({ success: true, jobId: job.id, message: 'Reindex encolado' });
  } catch (error) {
    logger.error('Error en reindex manual:', error);
    res.status(500).json({ error: 'Error reindexando proyecto' });
  }
});

// Endpoint para reindexar todo el grupo (puede aceptar body { projects: [name], ref: 'master' })
app.post('/knowledge-base/reindex-all', async (req, res) => {
  try {
    const projects = Array.isArray(req.body.projects) ? req.body.projects : null;
    const ref = typeof req.body.ref === 'string' ? req.body.ref : null;
    const groupId = typeof req.body.groupId === 'string' && req.body.groupId.length > 0 ? req.body.groupId : null;

    const job = reindexJobs.createJob('group_reindex', { projects, ref, groupId });

    if (req.query.wait === '1') {
      try {
        const completed = await reindexJobs.waitForCompletion(job.id, 1000 * 60 * 30); // wait up to 30 min
        return res.status(200).json({ success: true, job: completed });
      } catch (err) {
        return res.status(500).json({ success: false, reason: err.message });
      }
    }

    return res.status(202).json({ success: true, jobId: job.id, message: 'Reindex encolado' });
  } catch (error) {
    logger.error('Error en reindex-all endpoint:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// Endpoint para consultar estado de job
app.get('/jobs/:id', async (req, res) => {
  try {
    const job = reindexJobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job_not_found' });
    return res.status(200).json({ success: true, job });
  } catch (err) {
    logger.error('Error consultando job:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Para rutas GET desconocidas (SPA), devolver index.html para que el frontend maneje el ruteo
app.get('*', (req, res, next) => {
  // Si la ruta parece ser una API, pasar al siguiente manejador
  if (req.path.startsWith('/ask') || req.path.startsWith('/knowledge-base') || req.path.startsWith('/health')) {
    return next();
  }

  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Middleware global de manejo de errores
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'UNHANDLED_ERROR'
  });
});

// Función para iniciar el servidor
const startServer = () => {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, (err) => {
      if (err) {
        reject(err);
      } else {
        logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
        logger.info(`📊 Health check disponible en: http://localhost:${PORT}/health`);
        logger.info(`🤖 API disponible en: http://localhost:${PORT}/ask`);
        resolve(server);
      }
    });

    // Manejo graceful de cierre del servidor
    process.on('SIGTERM', () => {
      logger.info('Recibida señal SIGTERM, cerrando servidor...');
      server.close(() => {
        logger.info('Servidor cerrado exitosamente');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('Recibida señal SIGINT, cerrando servidor...');
      server.close(() => {
        logger.info('Servidor cerrado exitosamente');
        process.exit(0);
      });
    });
  });
};

// Iniciar el servidor solo si este archivo se ejecuta directamente
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Error iniciando el servidor:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };