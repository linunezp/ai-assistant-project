const KnowledgeBase = require('./knowledge_base');
const GeminiClient = require('./gemini_client');
const ClaudeClient = require('./claude_client');
const OpenAIClient = require('./openai_client');
const GitLabClient = require('./gitlab_client');
const GitHubClient = require('./github_client');
const RepositoryManager = require('./repository_manager');
const winston = require('winston');

// Configuración del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

class Agent {
  constructor() {
    this.knowledgeBase = new KnowledgeBase();
    
    // Inicializar clientes de IA
    this.aiProvider = process.env.AI_PROVIDER || 'gemini';
    this.currentAIProvider = this.aiProvider; // Para compatibilidad con API
    this.geminiClient = null;
    this.claudeClient = null;
    this.openaiClient = null;
    
    // Inicializar el cliente apropiado
    this.initializeAIClients();
    
    // Inicializar plataforma de repositorio
    this.repositoryPlatform = process.env.REPOSITORY_PLATFORM || 'gitlab';
    this.currentRepositoryPlatform = this.repositoryPlatform;
    this.gitlabClient = null;
    this.githubClient = null;
    
    this.initializeRepositoryClients();
    
    // Inicializar RepositoryManager
    this.repositoryManager = new RepositoryManager();
    this.initialized = false;
  }

  /**
   * Inicializa los clientes de repositorio disponibles
   */
  initializeRepositoryClients() {
    try {
      this.gitlabClient = new GitLabClient();
      logger.info('GitLab client inicializado correctamente');
    } catch (err) {
      logger.warn('GitLab client no disponible:', err.message);
      this.gitlabClient = null;
    }
    
    try {
      this.githubClient = new GitHubClient();
      logger.info('GitHub client inicializado correctamente');
    } catch (err) {
      logger.warn('GitHub client no disponible:', err.message);
      this.githubClient = null;
    }
    
    logger.info(`Plataforma de repositorio activa: ${this.repositoryPlatform}`);
  }

  /**
   * Cambia la plataforma de repositorio dinámicamente
   * @param {string} platform - 'gitlab' o 'github'
   */
  setRepositoryPlatform(platform) {
    if (platform === 'gitlab' && this.gitlabClient) {
      this.repositoryPlatform = 'gitlab';
      this.currentRepositoryPlatform = 'gitlab';
      logger.info('Cambiado a plataforma: GitLab');
      return true;
    } else if (platform === 'github' && this.githubClient) {
      this.repositoryPlatform = 'github';
      this.currentRepositoryPlatform = 'github';
      logger.info('Cambiado a plataforma: GitHub');
      return true;
    } else {
      logger.error(`Plataforma ${platform} no disponible o no inicializada`);
      return false;
    }
  }

  /**
   * Obtiene el cliente de repositorio activo
   */
  getActiveRepositoryClient() {
    if (this.repositoryPlatform === 'gitlab' && this.gitlabClient) {
      return this.gitlabClient;
    } else if (this.repositoryPlatform === 'github' && this.githubClient) {
      return this.githubClient;
    } else {
      return null;
    }
  }

  /**
   * Obtiene la lista de plataformas de repositorio disponibles
   * @returns {Array} Lista de plataformas disponibles
   */
  getAvailablePlatforms() {
    const available = [];
    if (this.gitlabClient) available.push('gitlab');
    if (this.githubClient) available.push('github');
    return available;
  }

  /**
   * Inicializa los clientes de IA disponibles
   */
  initializeAIClients() {
    try {
      this.geminiClient = new GeminiClient();
      logger.info('Gemini client inicializado correctamente');
    } catch (err) {
      logger.warn('Gemini client no disponible:', err.message);
    }
    
    try {
      this.claudeClient = new ClaudeClient();
      logger.info('Claude client inicializado correctamente');
    } catch (err) {
      logger.warn('Claude client no disponible:', err.message);
    }
    
    try {
      this.openaiClient = new OpenAIClient();
      logger.info('OpenAI client inicializado correctamente');
    } catch (err) {
      logger.warn('OpenAI client no disponible:', err.message);
    }
    
    logger.info(`Proveedor de IA activo: ${this.aiProvider}`);
  }

  /**
   * Cambia el proveedor de IA dinámicamente
   * @param {string} provider - 'gemini', 'claude' o 'openai'
   */
  setAIProvider(provider) {
    if (provider === 'gemini' && this.geminiClient) {
      this.aiProvider = 'gemini';
      this.currentAIProvider = 'gemini';
      logger.info('Cambiado a proveedor: Gemini');
      return true;
    } else if (provider === 'claude' && this.claudeClient) {
      this.aiProvider = 'claude';
      this.currentAIProvider = 'claude';
      logger.info('Cambiado a proveedor: Claude');
      return true;
    } else if (provider === 'openai' && this.openaiClient) {
      this.aiProvider = 'openai';
      this.currentAIProvider = 'openai';
      logger.info('Cambiado a proveedor: OpenAI');
      return true;
    } else {
      logger.error(`Proveedor ${provider} no disponible o no inicializado`);
      return false;
    }
  }

  /**
   * Obtiene el cliente de IA activo
   */
  getActiveAIClient() {
    if (this.aiProvider === 'claude' && this.claudeClient) {
      return this.claudeClient;
    } else if (this.aiProvider === 'gemini' && this.geminiClient) {
      return this.geminiClient;
    } else if (this.aiProvider === 'openai' && this.openaiClient) {
      return this.openaiClient;
    } else {
      throw new Error('No hay cliente de IA disponible');
    }
  }

  /**
   * Obtiene la lista de proveedores de IA disponibles
   * @returns {Array} Lista de proveedores disponibles
   */
  getAvailableProviders() {
    const available = [];
    if (this.geminiClient) available.push('gemini');
    if (this.claudeClient) available.push('claude');
    if (this.openaiClient) available.push('openai');
    return available;
  }

  /**
   * Detecta la organización real basándose en el contenido de los chunks
   * @param {Array} contextChunks - Los chunks de contexto
   * @returns {Object} Información sobre la organización detectada
   */
  detectOrganizationFromContext(contextChunks) {
    if (!contextChunks || contextChunks.length === 0) {
      return { detected: false };
    }

    // Analizar patrones en paths y contenido
    const patterns = {
      RENOVA: [
        /renova/i,
        /\.renova\./i,
        /\/renova\//i,
        /renova[-_]/i,
        /contract.*blockchain/i, // Contratos inteligentes suelen ser RENOVA
        /solidity/i,
        /transaction.*model/i
      ],
      PLABACOM: [
        /plabacom/i,
        /\.plabacom\./i,
        /\/plabacom\//i,
        /coordinador\.plabacom/i,
        /cl\.coordinador\.plabacom/i
      ]
    };

    let orgScores = { RENOVA: 0, PLABACOM: 0 };
    let contentAnalysis = { RENOVA: 0, PLABACOM: 0 };

    contextChunks.forEach(chunk => {
      const fullPath = chunk.source?.file_path || '';
      const content = chunk.content || '';
      const projectName = chunk.source?.project_name || '';

      // Analizar paths
      Object.keys(patterns).forEach(org => {
        patterns[org].forEach(pattern => {
          if (pattern.test(fullPath)) orgScores[org] += 2;
          if (pattern.test(content)) contentAnalysis[org] += 1;
          if (pattern.test(projectName)) orgScores[org] += 1;
        });
      });
    });

    // Determinar organización predominante
    const totalRenova = orgScores.RENOVA + contentAnalysis.RENOVA;
    const totalPlabacom = orgScores.PLABACOM + contentAnalysis.PLABACOM;

    let detectedOrg = null;
    let inferredFromContent = null;

    if (totalRenova > totalPlabacom) {
      detectedOrg = 'RENOVA';
    } else if (totalPlabacom > totalRenova) {
      detectedOrg = 'PLABACOM';
    }

    // Detectar si el contenido sugiere una organización diferente
    if (contentAnalysis.PLABACOM > 0 && detectedOrg === 'RENOVA') {
      inferredFromContent = 'PLABACOM';
    } else if (contentAnalysis.RENOVA > 0 && detectedOrg === 'PLABACOM') {
      inferredFromContent = 'RENOVA';
    }

    logger.info(`Detección organizacional - RENOVA: ${totalRenova}, PLABACOM: ${totalPlabacom}, Detectada: ${detectedOrg}`);

    return {
      detected: detectedOrg !== null,
      name: detectedOrg,
      inferredFromContent: inferredFromContent,
      scores: { RENOVA: totalRenova, PLABACOM: totalPlabacom }
    };
  }

  /**
   * Obtiene la organización correspondiente al grupo seleccionado consultando la BD
   * @param {number} groupId - ID del grupo seleccionado por el usuario
   * @returns {Promise<string>} Nombre de la organización detectada
   */
  async getOrganizationForGroup(groupId) {
    try {
      // Usar el método especializado de la base de conocimiento
      const groupInfo = await this.knowledgeBase.getGroupWithOrganization(groupId);
      
      if (!groupInfo) {
        logger.info(`Grupo ${groupId} no encontrado, usando PLABACOM por defecto`);
        return 'PLABACOM';
      }
      
      return groupInfo.detected_organization || 'PLABACOM';
      
    } catch (error) {
      logger.error(`Error detectando organización para grupo ${groupId}:`, error.message);
      return 'PLABACOM'; // Fallback por defecto
    }
  }

  /**
   * Construye el prompt del sistema para Claude
   */
  buildSystemPrompt(contextChunks) {
    const platformName = this.repositoryPlatform === 'gitlab' ? 'GitLab' : 'GitHub';
    let systemPrompt = `Eres un asistente de inteligencia artificial especializado en responder preguntas técnicas sobre proyectos de software.

TU FUENTE DE CONOCIMIENTO:
Tu conocimiento proviene exclusivamente de repositorios de código fuente de ${platformName} que han sido indexados en una base de conocimiento vectorial. Esta base contiene:
- Código fuente de proyectos de software
- Documentación técnica (README, wikis, etc.)
- Archivos de configuración y scripts
- Comentarios y documentación inline del código

INSTRUCCIONES:
1. Responde ÚNICAMENTE basándote en la información de los repositorios ${platformName} indexados
2. Si tienes contexto específico, úsalo para dar respuestas precisas y técnicas
3. Cita siempre las fuentes específicas (archivos y proyectos) cuando sea relevante
4. Si no tienes información suficiente en la base de conocimiento, explica que necesitas más contexto de los repositorios
5. Nunca inventes información que no esté en los fuentes indexados
6. Mantén un tono profesional y técnico

`;

    if (contextChunks && contextChunks.length > 0) {
      systemPrompt += `CONTEXTO DISPONIBLE DE LOS REPOSITORIOS:\n\n`;
      contextChunks.forEach((chunk, index) => {
        systemPrompt += `[FUENTE ${index + 1}] ${chunk.source.file_name} (Proyecto: ${chunk.source.project_name}):\n${chunk.content}\n\n`;
      });
    } else {
      systemPrompt += `IMPORTANTE: No se encontró información relevante en los repositorios indexados para esta consulta específica. Solo puedo responder sobre el contenido que está disponible en los repositorios de GitLab que han sido indexados.\n\n`;
    }

    return systemPrompt;
  }

  /**
   * Reindexar un proyecto dado su nombre (intenta buscar en el grupo configurado)
   * Devuelve { success, indexedCount, projectName, reason }
   */
  async reindexProjectByName(projectName, ref = null) {
    if (!this.gitlabClient) {
      return { success: false, reason: 'gitlab_not_configured' };
    }

    try {
      // Listar proyectos del grupo y buscar coincidencia
      logger.info('Reindex: intentando obtener lista de proyectos del grupo si está configurado...');
      let projects = [];
      try {
        projects = await this.gitlabClient.listGroupProjects();
        logger.info(`Reindex: listGroupProjects devolvió ${Array.isArray(projects) ? projects.length : 'no-array'} proyectos`);
      } catch (err) {
        logger.warn('Reindex: listGroupProjects no disponible o falló:', err.message || JSON.stringify(err));
        projects = null;
      }
  const nameLower = projectName.toLowerCase();
  let project = null;

      // Si listGroupProjects devolvió una lista, intentar buscar en ella
      if (projects) {
        project = projects.find(p => p.name.toLowerCase() === nameLower || p.path_with_namespace.toLowerCase().includes(nameLower));
        if (!project) {
          project = projects.find(p => nameLower.split(/[^a-z0-9]+/).some(tok => tok && p.name.toLowerCase().includes(tok)));
        }
      }

      // Si no encontramos aún, intentar obtener por path completo o buscar proyectos por término
      if (!project) {
        try {
          logger.info(`Reindex: intentando getProjectByPath con '${projectName}'`);
          project = await this.gitlabClient.getProjectByPath(projectName);
        } catch (err) {
          logger.warn('Reindex: getProjectByPath falló o no encontró proyecto:', err.message || JSON.stringify(err));
        }
      }

      if (!project) {
        try {
          logger.info(`Reindex: intentando searchProjects con término '${projectName}'`);
          const found = await this.gitlabClient.searchProjects(projectName);
          if (found && found.length > 0) project = found[0];
        } catch (err) {
          logger.warn('Reindex: searchProjects falló:', err.message || JSON.stringify(err));
        }
      }

      if (!project) {
        return { success: false, reason: 'project_not_found', projectName: projectName };
      }

  logger.info(`Reindex: proyecto seleccionado: ${project.name} (id=${project.id})`);
  this.gitlabClient.setProjectId(project.id);
  logger.info('Reindex: llamando a scanRepository...');
  const files = await this.gitlabClient.scanRepository(ref || project.default_branch || 'master');
  logger.info(`Reindex: scanRepository devolvió ${files ? files.length : 0} archivos`);
      if (!files || files.length === 0) {
        return { success: false, reason: 'no_files_found', projectName: project.name, projectId: project.id };
      }

      // Indexar en la KB
      await this.knowledgeBase.indexData(files);
      return { success: true, indexedCount: files.length, projectName: project.name, projectId: project.id };

    } catch (error) {
      const errMsg = error && (error.stack || error.message) ? (error.stack || error.message) : JSON.stringify(error);
      logger.error('Error reindexando proyecto:', errMsg);
      return { success: false, reason: 'error', detail: errMsg };
    }
  }

  /**
   * Reindexar todos los proyectos del grupo (o una lista opcional de proyectos)
   * @param {Object} options - { ref: string|null, projects: Array<string>|null }
   */
  async reindexAllProjects(options = {}) {
    if (!this.gitlabClient) {
      return { success: false, reason: 'gitlab_not_configured' };
    }

    const ref = options.ref || null;
    const filterProjects = Array.isArray(options.projects) && options.projects.length > 0 ? options.projects.map(p => p.toLowerCase()) : null;

    try {
      // Intentar listar proyectos del grupo
      let projects = [];
      try {
        projects = await this.gitlabClient.listGroupProjects();
      } catch (err) {
        logger.warn('reindexAllProjects: listGroupProjects falló:', err.message || JSON.stringify(err));
        return { success: false, reason: 'list_group_failed', detail: err.message || String(err) };
      }

      // Filtrar por nombres si el usuario pasó una lista
      if (filterProjects) {
        projects = projects.filter(p => filterProjects.includes(p.name.toLowerCase()) || filterProjects.includes(p.path_with_namespace.toLowerCase()));
      }

      const results = [];
      for (const p of projects) {
        logger.info(`reindexAllProjects: procesando proyecto ${p.name} (id=${p.id})`);
        try {
          const res = await this.reindexProjectByName(p.name, ref);
          results.push({ project: p.name, projectId: p.id, result: res });
        } catch (err) {
          results.push({ project: p.name, projectId: p.id, result: { success: false, reason: 'error', detail: err && (err.stack || err.message) ? (err.stack || err.message) : String(err) } });
        }
      }

      return { success: true, processed: results.length, results };
    } catch (error) {
      const errMsg = error && (error.stack || error.message) ? (error.stack || error.message) : JSON.stringify(error);
      logger.error('Error en reindexAllProjects:', errMsg);
      return { success: false, reason: 'error', detail: errMsg };
    }
  }

  /**
   * Inicializa el agente
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.knowledgeBase.initialize();
      this.initialized = true;
      logger.info('Agente inicializado correctamente');
    } catch (error) {
      logger.error('Error inicializando el agente:', error.message);
      throw error;
    }
  }

  /**
   * Función principal para responder preguntas
   * @param {string} prompt - Pregunta del usuario
   * @param {Object} options - Opciones adicionales
   * @returns {Object} Respuesta completa con metadatos
   */
  async answerQuestion(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('El prompt debe ser una cadena no vacía');
    }

    await this.initialize();

    const startTime = Date.now();

    try {
      logger.info(`Procesando pregunta: "${prompt.substring(0, 120)}..."`);

      // Paso 1: Validación opcional
      let validation = { is_valid: true, reason: 'Validación omitida' };
      if (options.validateQuery !== false) {
        try {
          const aiClient = this.getActiveAIClient();
          // Solo Gemini tiene método validateQuestion por ahora
          if (aiClient === this.geminiClient && this.geminiClient.validateQuestion) {
            validation = await this.geminiClient.validateQuestion(prompt);
          } else {
            validation = { is_valid: true, reason: 'Validación no disponible para este proveedor', category: 'general' };
          }
          if (!validation.is_valid) {
            return {
              answer: `Lo siento, no puedo responder a esa pregunta. ${validation.reason}`,
              metadata: { processing_time: Date.now() - startTime, validation, context_found: false, sources_used: [] }
            };
          }
        } catch (err) {
          logger.warn('Validación fallida, continuando:', err.message);
        }
      }

      // Paso 2: Intentar mejorar la consulta
      let enhancedQuery = prompt;
      if (options.enhanceQuery !== false) {
        try {
          const aiClient = this.getActiveAIClient();
          let enhancement = null;
          // Solo Gemini tiene método enhanceQuery por ahora
          if (aiClient === this.geminiClient && this.geminiClient.enhanceQuery) {
            enhancement = await this.geminiClient.enhanceQuery(prompt);
          }
          if (enhancement && enhancement.enhanced_query) {
            enhancedQuery = enhancement.enhanced_query;
            logger.info('Consulta mejorada:', enhancedQuery);
          }
        } catch (err) {
          logger.warn('No se pudo mejorar la consulta:', err.message);
        }
      }

      // Paso 3: Buscar en la KB con parámetros mejorados
      const searchLimit = options.searchLimit || 15; // Aumentado de 8 a 15
      const searchThreshold = options.searchThreshold || 0.2; // Reducido de 0.3 a 0.2

      let contextChunks = [];
      try {
        contextChunks = await this.knowledgeBase.search(enhancedQuery, searchLimit, searchThreshold);

        if (contextChunks.length < 2) {
          const fallback = await this.knowledgeBase.search(prompt, searchLimit, Math.max(0.05, searchThreshold * 0.8));
          contextChunks = [...contextChunks, ...fallback];
          // dedupe
          const seen = new Set();
          contextChunks = contextChunks.filter(c => {
            const k = (c.content || '').substring(0, 120);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
      } catch (err) {
        logger.error('Error buscando en KB:', err.message);
        logger.error('Stack trace completo:', err.stack);
        
        // Implementar fallback directo cuando la búsqueda falla
        if (/clases|class|código|javascript|contenido/i.test(prompt)) {
          logger.info('Implementando fallback directo para búsqueda de clases/código');
          try {
            contextChunks = await this.knowledgeBase.directSearchFallback(prompt, searchLimit);
          } catch (fallbackErr) {
            logger.error('Error en fallback directo:', fallbackErr.message);
          }
        }
      }

      // Si no se encontraron resultados, intentar fallback directo
      if (contextChunks.length === 0 && /clases|class|código|javascript|contenido|métodos|method|función|function|knowledgebase|agent|gitlab/i.test(prompt)) {
        logger.info('No se encontraron resultados, implementando fallback directo');
        try {
          contextChunks = await this.knowledgeBase.directSearchFallback(prompt, searchLimit);
          logger.info(`Fallback directo encontró ${contextChunks.length} chunks`);
        } catch (fallbackErr) {
          logger.error('Error en fallback directo:', fallbackErr.message);
        }
      }

      // Calcular relevancia promedio (usar relevance_score si existe)
      const avgRelevance = contextChunks.length ? (contextChunks.reduce((s, c) => s + (c.relevance_score || 0), 0) / contextChunks.length) : 0;

      // Reindex-on-miss: si no hay contexto o baja relevancia, intentar reindexar el proyecto si se detecta en la pregunta
      const MIN_RELEVANCE_TO_SKIP_REINDEX = 0.15;
      // Metadata que devolveremos sobre reindex
      let reindexMetadata = { reindex_attempted: false, reindex_project: null, reindex_result: null, reindex_job_id: null };

      if ((contextChunks.length === 0 || avgRelevance < MIN_RELEVANCE_TO_SKIP_REINDEX) && this.gitlabClient) {
        // Intentar extraer nombre de proyecto del prompt
        const projectMatch = /proyecto\s+([a-zA-Z0-9_\-]+)/i.exec(prompt) || /project\s+([a-zA-Z0-9_\-]+)/i.exec(prompt);
        let projectName = projectMatch ? projectMatch[1] : null;

        // Obtener lista de proyectos para buscar coincidencias si es necesario
        let projectsList = null;
        try {
          projectsList = await this.gitlabClient.listGroupProjects();
        } catch (err) {
          logger.warn('No se pudo listar proyectos para reindex-on-miss:', err.message);
          projectsList = null;
        }

        let candidateProjectName = projectName;
        if (!candidateProjectName && projectsList) {
          const lowerPrompt = prompt.toLowerCase();
          const found = projectsList.find(p => lowerPrompt.includes(p.name.toLowerCase()) || lowerPrompt.includes(p.path_with_namespace.toLowerCase()));
          if (found) candidateProjectName = found.name;
        }

        if (candidateProjectName) {
          reindexMetadata.reindex_attempted = true;
          reindexMetadata.reindex_project = candidateProjectName;
          try {
            const REINDEX_TIMEOUT_MS = 1000 * 60 * 2; // 2 minutos

            // Ejecutar reindex con timeout
            const reindexPromise = this.reindexProjectByName(candidateProjectName, options.ref || null);
            const reindexResult = await Promise.race([
              reindexPromise,
              new Promise((_, rej) => setTimeout(() => rej(new Error('reindex_timeout')), REINDEX_TIMEOUT_MS))
            ]);

            // Attach result
            reindexMetadata.reindex_result = reindexResult || null;

            // Determinar cooldown key (usar projectId si está disponible)
            const cooldownKey = reindexResult && reindexResult.projectId ? `id_${reindexResult.projectId}` : `name_${candidateProjectName}`;
            if (!this._reindexCooldowns) this._reindexCooldowns = {};
            const last = this._reindexCooldowns[cooldownKey] || 0;
            const COOLDOWN_MS = (process.env.REINDEX_COOLDOWN_MS ? parseInt(process.env.REINDEX_COOLDOWN_MS, 10) : 1000 * 60 * 60); // default 1h
            const now = Date.now();

            if (now - last < COOLDOWN_MS) {
              logger.info(`Reindex cooldown activo para ${candidateProjectName} (key=${cooldownKey})`);
            } else {
              this._reindexCooldowns[cooldownKey] = now;
              if (reindexResult && reindexResult.success) {
                logger.info(`Reindex completado para ${candidateProjectName}, archivos indexados: ${reindexResult.indexedCount}`);
                try {
                  contextChunks = await this.knowledgeBase.search(enhancedQuery, searchLimit, Math.max(0.05, searchThreshold * 0.5));
                } catch (err) {
                  logger.warn('Error re-buscando tras reindex:', err.message);
                }
              } else {
                logger.warn('Reindex no produjo resultados útiles:', reindexResult && reindexResult.reason);
              }
            }
          } catch (err) {
            // Si la reindexación falla por timeout u otro motivo, dejar metadata para el caller
            logger.warn('Reindex-on-demand falló o expiró:', err.message);
            if (!reindexMetadata.reindex_result) reindexMetadata.reindex_result = { success: false, reason: err.message };
          }
        } else {
          logger.info('No se detectó proyecto claro para reindex-on-miss en la pregunta');
        }
      }

      // Determinar estrategia basada en avgRelevance
      let responseStrategy = 'no_context';
      if (contextChunks.length > 0) {
        if (avgRelevance > 0.7) responseStrategy = 'high_confidence';
        else if (avgRelevance > 0.4) responseStrategy = 'medium_confidence';
        else responseStrategy = 'low_confidence';
      }

      logger.info(`Estrategia de respuesta: ${responseStrategy} (avgRelevance=${avgRelevance.toFixed(3)})`);

      // Generar respuesta con el cliente de IA activo
      const aiClient = this.getActiveAIClient();
      
      let aiResponse;
      if (this.aiProvider === 'claude') {
        // Para Claude, usar parámetros específicos y el nuevo método buildPrompt
        const claudeOptions = { 
          temperature: responseStrategy === 'high_confidence' ? 0.3 : responseStrategy === 'medium_confidence' ? 0.5 : 0.75, 
          max_tokens: 4000 
        };
        const systemPrompt = aiClient.buildPrompt(prompt, contextChunks, groupName);
        aiResponse = await aiClient.generateResponse(systemPrompt, prompt, claudeOptions);
        // Adaptar respuesta de Claude al formato esperado
        aiResponse = {
          answer: aiResponse.text,
          metadata: aiResponse.metadata
        };
      } else if (this.aiProvider === 'openai') {
        // Para OpenAI, usar parámetros específicos
        const openaiOptions = { 
          temperature: responseStrategy === 'high_confidence' ? 0.1 : responseStrategy === 'medium_confidence' ? 0.3 : 0.5, 
          max_tokens: 4000 
        };
        const openaiResponse = await aiClient.generateResponse(prompt, contextChunks, openaiOptions);
        // Adaptar respuesta de OpenAI al formato esperado
        aiResponse = {
          answer: openaiResponse.response,
          metadata: openaiResponse
        };
      } else {
        // Para Gemini, usar parámetros específicos
        const geminiOptions = { 
          temperature: responseStrategy === 'high_confidence' ? 0.3 : responseStrategy === 'medium_confidence' ? 0.5 : 0.75, 
          maxOutputTokens: 2048 
        };
        aiResponse = await aiClient.getAnswer(prompt, contextChunks, geminiOptions);
      }
      
      const finalProviderName = this.aiProvider === 'claude' ? 'Claude' : 
                                this.aiProvider === 'openai' ? 'OpenAI' : 'Gemini';
      logger.info(`Respuesta de ${finalProviderName} recibida (${aiResponse.answer?.length || 0} caracteres)`);

      let finalAnswer = aiResponse.answer || '';
      if (contextChunks.length > 0) {
        const sources = [...new Set(contextChunks.map(c => `${c.source.file_name} (${c.source.project_name})`))];
        if (sources.length > 0) {
          finalAnswer += `\n\nFuentes consultadas:\n${sources.map(s => '- ' + s).join('\n')}`;
        }
      } else {
        finalAnswer += `\n\n*Nota: Esta respuesta se basa en conocimiento general ya que no se encontró información específica en la base de conocimiento.*`;
      }

      const processingTime = Date.now() - startTime;
      const response = {
        answer: finalAnswer,
        metadata: {
          processing_time: processingTime,
          validation,
          enhanced_query: enhancedQuery !== prompt ? enhancedQuery : null,
          context_found: contextChunks.length > 0,
          context_chunks_count: contextChunks.length,
          response_strategy: responseStrategy,
          sources_used: contextChunks.map(c => ({ file: c.source.file_name, project: c.source.project_name, relevance: c.relevance_score })),
          average_relevance: contextChunks.length > 0 ? (contextChunks.reduce((s, c) => s + (c.relevance_score || 0), 0) / contextChunks.length).toFixed(3) : 0,
          [`${this.aiProvider}_metadata`]: aiResponse.metadata || null,
          timestamp: new Date().toISOString()
        }
      };

      // Adjuntar metadata de reindex si fue intentado
      if (reindexMetadata) {
        response.metadata.reindex = reindexMetadata;
      }

      logger.info(`Pregunta procesada exitosamente en ${processingTime}ms`);
      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error procesando pregunta:', error.message);
      return {
        answer: 'Lo siento, ocurrió un error interno procesando tu pregunta. Por favor, intenta de nuevo más tarde.',
        metadata: { processing_time: processingTime, error: error.message, context_found: false, sources_used: [], timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Obtiene sugerencias de preguntas basadas en la base de conocimiento
   * @param {number} count - Número de sugerencias a generar
   * @returns {Array} Array de preguntas sugeridas
   */
  async getSuggestedQuestions(count = 5) {
    await this.initialize();

    try {
      // Obtener información sobre la base de conocimiento
      const kbInfo = await this.knowledgeBase.getInfo();
      
      if (kbInfo.total_documents === 0) {
        return [
          "¿Cómo puedo usar este asistente?",
          "¿Qué información contiene la base de conocimiento?",
          "¿Cómo agrego contenido a la base de conocimiento?"
        ];
      }

      // Generar sugerencias basadas en el contenido disponible
      const suggestionsPrompt = `Basándote en la siguiente información sobre una base de conocimiento técnica, genera ${count} preguntas útiles que los usuarios podrían hacer:

Base de conocimiento:
- Total de documentos: ${kbInfo.total_documents}
- Total de fragmentos: ${kbInfo.total_chunks}
- Proyectos: ${kbInfo.total_projects}

Documentos recientes:
${kbInfo.recent_documents.map(doc => `- ${doc.file_name}`).join('\n')}

Genera preguntas específicas y útiles en formato JSON:
{"questions": ["pregunta1", "pregunta2", ...]}`;

      const result = await this.geminiClient.getAnswer(suggestionsPrompt, [], { temperature: 0.8 });
      
      try {
        const parsed = JSON.parse(result.answer.replace(/```json\n?|```/g, ''));
        return parsed.questions || [];
      } catch {
        // Si no se puede parsear, devolver preguntas genéricas
        return [
          "¿Qué funcionalidades principales tiene este proyecto?",
          "¿Cómo está estructurado el código?",
          "¿Cuáles son las dependencias principales?",
          "¿Hay documentación de instalación disponible?",
          "¿Qué patrones de diseño se utilizan?"
        ];
      }

    } catch (error) {
      logger.error('Error generando sugerencias:', error.message);
      return [
        "¿Cómo funciona este sistema?",
        "¿Qué tecnologías se utilizan?",
        "¿Hay ejemplos de uso disponibles?"
      ];
    }
  }

  /**
   * Obtiene estadísticas del agente
   * @returns {Object} Estadísticas del agente
   */
  async getStats() {
    await this.initialize();

    try {
      const kbInfo = await this.knowledgeBase.getInfo();
      const geminiInfo = this.geminiClient.getInfo();

      return {
        knowledge_base: kbInfo,
        gemini_client: geminiInfo,
        agent: {
          initialized: this.initialized,
          available_methods: [
            'answerQuestion',
            'getSuggestedQuestions',
            'getStats'
          ]
        },
        system: {
          node_version: process.version,
          uptime: process.uptime(),
          memory_usage: process.memoryUsage()
        }
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error.message);
      throw error;
    }
  }

  /**
   * Indexa un grupo completo de GitLab
   * @param {string} groupId - ID del grupo de GitLab
   * @param {Object} options - Opciones de indexado
   * @returns {Object} Resultado del indexado
   */
  async indexGitLabGroup(groupId, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.gitlabClient) {
        throw new Error('GitLab client no está configurado');
      }

      logger.info(`Iniciando indexado del grupo GitLab: ${groupId}`);

      // Obtener información del grupo
      const groupInfo = await this.gitlabClient.getGroupInfo(groupId);
      logger.info(`Grupo encontrado: ${groupInfo.name} (${groupInfo.projectsCount} proyectos)`);

      // Registrar el grupo en la base de datos
      await this.knowledgeBase.registerGroup(groupInfo);

      // ACTUALIZAR ESTADÍSTICAS INMEDIATAMENTE con la información del grupo
      const updateResult = await this.knowledgeBase.updateGroupStats(groupId.toString(), {
        projectsCount: groupInfo.projectsCount,
        filesCount: 0, // Se actualizará después
        chunksCount: 0 // Se actualizará después
      });

      if (updateResult) {
        logger.info(`✅ Estadísticas de grupo actualizadas exitosamente: ${groupInfo.projectsCount} proyectos`);
      } else {
        logger.error(`❌ Falló la actualización de estadísticas para grupo ${groupId}`);
      }

      // REGISTRAR PROYECTOS DETECTADOS para mostrarlos aunque no se indexen archivos
      try {
        const projects = await this.gitlabClient.listGroupProjects(groupId);
        await this.knowledgeBase.registerProjects(groupId.toString(), projects);
        logger.info(`📋 Proyectos detectados y registrados: ${projects.length}`);
      } catch (projectError) {
        logger.warn(`⚠️ No se pudieron registrar los proyectos: ${projectError.message}`);
      }

      // Escanear todos los repositorios del grupo
      let scanResult;
      try {
        scanResult = await this.gitlabClient.scanGroupRepositories(groupId, {
          includeSubgroups: options.includeSubgroups !== false,
          fileExtensions: ['.js', '.ts', '.md', '.json', '.py', '.java', '.go', '.php', '.rb', '.cs'],
          maxFilesPerRepo: 1000
        });
      } catch (scanError) {
        logger.error(`Error durante el escaneo de repositorios: ${scanError.message}`);
        logger.info(`Manteniendo estadísticas básicas del grupo: ${groupInfo.projectsCount} proyectos`);
        
        return {
          projectsFound: groupInfo.projectsCount,
          projectsIndexed: 0,
          totalChunks: 0,
          processingTime: Date.now() - startTime,
          error: 'scan_failed',
          errorMessage: scanError.message
        };
      }

      const files = scanResult.files;
      const projectsFound = scanResult.projectsFound;
      const projectsWithFiles = scanResult.projectsWithFiles;

      logger.info(`Archivos encontrados en el grupo: ${files.length}`);
      logger.info(`Proyectos encontrados: ${projectsFound}, con archivos: ${projectsWithFiles}`);

      if (files.length === 0) {
        // Mantener la información del grupo aunque no haya archivos 
        await this.knowledgeBase.updateGroupStats(groupId.toString(), {
          projectsCount: Math.max(projectsFound, groupInfo.projectsCount),
          filesCount: 0,
          chunksCount: 0
        });

        logger.info(`✅ Escaneo completado sin archivos: ${Math.max(projectsFound, groupInfo.projectsCount)} proyectos encontrados`);

        return {
          projectsFound: Math.max(projectsFound, groupInfo.projectsCount),
          projectsIndexed: 0,
          totalChunks: 0,
          processingTime: Date.now() - startTime
        };
      }

      // Indexar los archivos
      const indexResult = await this.knowledgeBase.indexGroupData(groupId.toString(), files);

      // Actualizar las estadísticas completas tras el escaneo exitoso
      await this.knowledgeBase.updateGroupStats(groupId.toString(), {
        projectsCount: Math.max(projectsFound, groupInfo.projectsCount), // Usar el mayor de los dos
        filesCount: files.length,
        chunksCount: indexResult.totalChunks
      });

      logger.info(`✅ Estadísticas finales actualizadas: ${Math.max(projectsFound, groupInfo.projectsCount)} proyectos, ${files.length} archivos, ${indexResult.totalChunks} chunks`);

      const result = {
        projectsFound: projectsFound,
        projectsIndexed: indexResult.processedFiles > 0 ? projectsWithFiles : 0,
        totalChunks: indexResult.totalChunks,
        processingTime: Date.now() - startTime
      };

      logger.info(`Indexado completado para grupo ${groupId}:`, result);
      return result;

    } catch (error) {
      logger.error(`Error indexando grupo ${groupId}:`, error.message);
      throw error;
    }
  }



  /**
   * Indexa un grupo usando el flujo simplificado con git clone
   * @param {string} groupId - ID del grupo de GitLab  
   * @param {Object} options - Opciones de indexado
   * @param {Function} progressCallback - Callback para reportar progreso
   * @returns {Object} Resultado del indexado
   */
  async indexGitLabGroupWithClone(groupId, options = {}, progressCallback = null) {
    const startTime = Date.now();
    
    try {
      if (!this.gitlabClient) {
        throw new Error('GitLab client no está configurado');
      }

      // 1. Validar estructura URL
      if (progressCallback) {
        progressCallback({
          status: 'validating',
          message: 'Validando estructura URL...',
          progress: 5
        });
      }
      
      logger.info(`✅ Iniciando proceso para grupo ID: ${groupId}`);

      // 2. Verificar si el grupo ya existe en la base de datos
      if (progressCallback) {
        progressCallback({
          status: 'detecting',
          message: `Verificando grupo ${groupId} en base de datos...`,
          progress: 10
        });
      }
      
      let targetGroup;
      let isExistingGroup = false;
      
      // Primero verificar en la base de datos
      try {
        const existingGroup = await this.knowledgeBase.getGroupById(groupId.toString());
        if (existingGroup) {
          targetGroup = {
            id: existingGroup.group_id,
            name: existingGroup.group_name,
            full_path: existingGroup.group_full_path,
            web_url: existingGroup.web_url,
            path: existingGroup.group_path
          };
          isExistingGroup = true;
          logger.info(`✅ Grupo encontrado en BD: ${targetGroup.name} (última indexación: ${existingGroup.indexed_at})`);
        }
      } catch (dbError) {
        logger.info(`ℹ️ Grupo no encontrado en BD, consultando GitLab...`);
      }
      
      // Si no existe en BD, buscar en GitLab
      if (!targetGroup) {
        logger.info(`🔍 Buscando grupo por ID en GitLab: ${groupId}`);
        
        try {
          const groupInfo = await this.gitlabClient.getGroupInfo(groupId);
          targetGroup = {
            id: groupInfo.id,
            name: groupInfo.name,
            full_path: groupInfo.full_path || groupInfo.path,
            web_url: groupInfo.web_url,
            path: groupInfo.path
          };
        } catch (error) {
          throw new Error(`No se encontró el grupo con ID: ${groupId}`);
        }
      }

      // 3. Obtener proyectos del grupo
      const projects = await this.gitlabClient.listGroupProjects(targetGroup.id);
      logger.info(`📋 Proyectos encontrados: ${projects.length}`);

      if (projects.length === 0) {
        throw new Error(`No se encontraron proyectos en el grupo ${targetGroup.name}`);
      }

      // Callback después de encontrar grupo y proyectos
      if (progressCallback) {
        progressCallback({
          status: 'detecting',
          message: `Grupo encontrado: ${targetGroup.name}`,
          progress: 15,
          groupId: targetGroup.id,
          groupName: targetGroup.name,
          projectsFound: projects.length,
          projectsCloned: 0,
          projectsIndexed: 0,
          filesProcessed: 0
        });
      }

      // 4. Registrar grupo y proyectos
      await this.knowledgeBase.registerGroup({
        id: targetGroup.id,
        name: targetGroup.name,
        full_path: targetGroup.full_path,
        web_url: targetGroup.web_url,
        projectsCount: projects.length
      });

      await this.knowledgeBase.registerProjects(targetGroup.id.toString(), projects);

      let totalCloned = 0;
      let totalIndexed = 0;
      let totalChunks = 0;
      const processingResults = [];

      // 5. Procesar cada proyecto (Clone + Index)
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        const projectProgress = Math.round(15 + (i / projects.length) * 70);
        
        try {
          // 5.1 Clonando repositorio
          if (progressCallback) {
            const filesProcessedSoFar = processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0);
            progressCallback({
              status: 'cloning',
              message: `Clonando repositorio ${project.name} (${i + 1}/${projects.length})...`,
              progress: projectProgress,
              currentProject: project.name,
              projectsFound: projects.length,
              projectsCloned: totalCloned,
              projectsIndexed: totalIndexed,
              filesProcessed: filesProcessedSoFar
            });
          }

          logger.info(`🔄 Clonando proyecto: ${project.name}`);
          
          // Obtener URL de clone (puede ser http_url_to_repo o web_url)
          const cloneUrl = project.http_url_to_repo || project.web_url;
          if (!cloneUrl) {
            logger.warn(`⚠️ Proyecto ${project.name} no tiene URL de clone, omitiendo...`);
            processingResults.push({
              projectName: project.name,
              error: 'No URL de clone disponible',
              success: false
            });
            continue;
          }
          
          const cloneResult = await this.repositoryManager.cloneRepository(
            cloneUrl,
            `group_${targetGroup.id}`
          );
          
          let updateResult = null;
          let repositoryUpdated = false;
          
          // Si el repositorio ya existía, intentar actualizarlo
          if (cloneResult.path && !cloneResult.cloned) {
            try {
              logger.info(`🔄 Actualizando repositorio existente: ${project.name}`);
              updateResult = await this.repositoryManager.updateRepository(cloneResult.path);
              repositoryUpdated = updateResult.hasChanges;
              
              if (repositoryUpdated) {
                logger.info(`✅ Repositorio ${project.name} actualizado con cambios`);
              } else {
                logger.info(`ℹ️ Repositorio ${project.name} ya estaba actualizado`);
              }
            } catch (updateError) {
              logger.warn(`⚠️ Error actualizando ${project.name}: ${updateError.message}`);
            }
          }

          if (cloneResult.path) {
            totalCloned++;
            const status = cloneResult.cloned ? 'clonado' : (repositoryUpdated ? 'actualizado con cambios' : 'sin cambios');
            logger.info(`✅ Repositorio ${project.name} ${status}`);

            // 5.2 Indexando repositorio
            if (progressCallback) {
              const filesProcessedSoFar = processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0);
              progressCallback({
                status: 'indexing',
                message: `Indexando repositorio ${project.name}...`,
                progress: projectProgress + 2,
                currentProject: project.name,
                projectsCloned: totalCloned,
                projectsIndexed: totalIndexed,
                filesProcessed: filesProcessedSoFar
              });
            }

            logger.info(`📄 Indexando proyecto: ${project.name}`);
            
            // Obtener archivos desde el repositorio clonado
            const files = await this.repositoryManager.listRepositoryFiles(cloneResult.path);
            logger.info(`📁 Archivos encontrados en ${project.name}: ${files.length}`);

            if (files.length > 0) {
              // Filtrar solo archivos de texto relevantes
              const textFiles = files.filter(file => {
                const ext = file.split('.').pop()?.toLowerCase();
                return ['.js', '.ts', '.md', '.json', '.py', '.java', '.go', '.php', '.rb', '.cs'].includes('.' + ext);
              });

              if (textFiles.length > 0) {
                // Leer contenido de archivos desde el sistema local
                const fileContents = [];
                for (const file of textFiles.slice(0, 100)) { // Limitar a 100 archivos por proyecto
                  try {
                    const fs = require('fs');
                    const path = require('path');
                    const fullPath = path.join(cloneResult.path, file);
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    fileContents.push({
                      file_path: `${project.name}/${file}`,
                      file_name: file.split('/').pop(),
                      content: content,
                      project_name: project.name,
                      metadata: {
                        project_id: project.id,
                        web_url: project.web_url,
                        full_path: fullPath
                      }
                    });
                  } catch (readError) {
                    logger.warn(`⚠️ No se pudo leer archivo ${file}: ${readError.message}`);
                  }
                }

                if (fileContents.length > 0) {
                  // Indexar archivos en la base de conocimiento
                  const indexResult = await this.knowledgeBase.indexGroupData(
                    targetGroup.id.toString(), 
                    fileContents
                  );
                  
                  totalIndexed++;
                  totalChunks += indexResult.totalChunks;
                  
                  processingResults.push({
                    projectName: project.name,
                    filesFound: fileContents.length,
                    chunksCreated: indexResult.totalChunks,
                    success: true
                  });

                  logger.info(`✅ Repositorio ${project.name} indexado: ${fileContents.length} archivos, ${indexResult.totalChunks} chunks`);
                }
              }
            }
          }

        } catch (projectError) {
          logger.error(`❌ Error procesando proyecto ${project.name}: ${projectError.message}`);
          processingResults.push({
            projectName: project.name,
            error: projectError.message,
            success: false
          });
        }
      }

      // 6. Actualizar estadísticas finales
      if (progressCallback) {
        const filesProcessedSoFar = processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0);
        progressCallback({
          status: 'finalizing',
          message: 'Finalizando indexación...',
          progress: 90,
          projectsCloned: totalCloned,
          projectsIndexed: totalIndexed,
          filesProcessed: filesProcessedSoFar,
          totalChunks: totalChunks
        });
      }

      await this.knowledgeBase.updateGroupStats(targetGroup.id.toString(), {
        projectsCount: projects.length,
        filesCount: processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0),
        chunksCount: totalChunks
      });

      const filesProcessed = processingResults.reduce((sum, r) => sum + (r.filesFound || 0), 0);

      const result = {
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        groupFullPath: targetGroup.full_path,
        projectsFound: projects.length,
        projectsCloned: totalCloned,
        projectsIndexed: totalIndexed,
        filesProcessed: filesProcessed,
        totalChunks: totalChunks,
        processingTime: Date.now() - startTime,
        processingResults: processingResults
      };

      if (progressCallback) {
        progressCallback({
          status: 'completed',
          message: `Indexación completada: ${totalIndexed}/${projects.length} repositorios indexados`,
          progress: 100,
          projectsCloned: totalCloned,
          projectsIndexed: totalIndexed,
          filesProcessed: filesProcessed,
          totalChunks: totalChunks
        });
      }

      logger.info(`🎉 Indexación completada para grupo ${targetGroup.name}:`, result);
      return result;

    } catch (error) {
      logger.error(`❌ Error en indexación con clone: ${error.message}`);
      if (progressCallback) {
        progressCallback({
          status: 'error',
          message: `Error: ${error.message}`,
          progress: -1
        });
      }
      throw error;
    }
  }

  /**
   * Obtiene información de grupos indexados
   * @returns {Array} Lista de grupos indexados
   */
  async getIndexedGroups() {
    try {
      return await this.knowledgeBase.getIndexedGroups();
    } catch (error) {
      logger.error('Error obteniendo grupos indexados:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene lista de repositorios (indexados o detectados)
   * @param {string} groupId - ID del grupo (opcional)
   * @returns {Array} Lista de repositorios con metadatos
   */
  async getIndexedRepositories(groupId = null) {
    try {
      // Primero intentar obtener repositorios detectados (incluye los que no tienen archivos)
      const detectedRepos = await this.knowledgeBase.getDetectedRepositories(groupId);
      
      if (detectedRepos && detectedRepos.length > 0) {
        logger.info(`📋 Usando repositorios detectados: ${detectedRepos.length}`);
        return detectedRepos.map(repo => ({
          projectName: repo.projectName,
          project_path: repo.projectPath,
          web_url: repo.webUrl,
          groupId: repo.groupId,
          document_count: repo.documentCount,
          chunk_count: repo.chunkCount,
          first_indexed: repo.firstIndexed,
          last_indexed: repo.lastIndexed,
          is_indexed: repo.isIndexed,
          detected_at: repo.detectedAt
        }));
      }
      
      // Fallback a repositorios indexados tradicionales
      return await this.knowledgeBase.getIndexedRepositories(groupId);
    } catch (error) {
      logger.error('Error obteniendo repositorios:', error.message);
      throw error;
    }
  }

  /**
   * Reindexar un repositorio específico
   * @param {string} projectName - Nombre del proyecto/repositorio
   * @param {string} groupId - ID del grupo/organización (opcional)
   * @returns {Object} Resultado de la reindexación
   */
  async reindexRepository(projectName, groupId = null) {
    const startTime = Date.now();
    
    try {
      const repositoryClient = this.getActiveRepositoryClient();
      if (!repositoryClient) {
        throw new Error(`Cliente de repositorio ${this.repositoryPlatform} no está configurado`);
      }

      logger.info(`Iniciando reindexación del repositorio: ${projectName} en ${this.repositoryPlatform}`);

      let project = null;
      let files = [];

      if (this.repositoryPlatform === 'gitlab') {
        // Lógica específica de GitLab
        if (groupId) {
          // Buscar en el grupo específico
          const projects = await repositoryClient.listGroupProjects(groupId);
          project = projects.find(p => 
            p.name === projectName || 
            p.path_with_namespace.includes(projectName)
          );
        } else {
          // Buscar por nombre de proyecto usando la API
          try {
            project = await repositoryClient.getProjectByPath(projectName);
          } catch (err) {
            logger.warn(`No se pudo encontrar proyecto por path: ${projectName}`);
          }
        }

        if (!project) {
          throw new Error(`Proyecto '${projectName}' no encontrado en GitLab`);
        }

        logger.info(`Proyecto encontrado: ${project.name} (ID: ${project.id})`);

        // Escanear archivos del proyecto
        files = await repositoryClient.scanRepository(project.id, {
          fileExtensions: ['.js', '.ts', '.md', '.json', '.py', '.java', '.go', '.php', '.rb', '.cs'],
          maxFiles: 1000
        });

      } else if (this.repositoryPlatform === 'github') {
        // Lógica específica de GitHub
        const [owner, repo] = projectName.includes('/') ? projectName.split('/') : [groupId, projectName];
        
        if (!owner || !repo) {
          throw new Error(`Para GitHub, proporciona el repositorio como 'owner/repo' o especifica la organización`);
        }

        try {
          project = await repositoryClient.getRepositoryInfo(owner, repo);
        } catch (err) {
          throw new Error(`Repositorio '${owner}/${repo}' no encontrado en GitHub`);
        }

        logger.info(`Repositorio encontrado: ${project.full_name} (ID: ${project.id})`);

        // Escanear archivos del repositorio
        const allFiles = await repositoryClient.scanRepository(owner, repo);
        
        // Filtrar por extensiones de archivo
        const allowedExtensions = ['.js', '.ts', '.md', '.json', '.py', '.java', '.go', '.php', '.rb', '.cs'];
        files = allFiles.filter(file => 
          allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
        ).slice(0, 1000); // Limitar a 1000 archivos
      }

      logger.info(`Archivos encontrados: ${files.length}`);

      if (files.length === 0) {
        return {
          filesIndexed: 0,
          chunksGenerated: 0,
          processingTime: Date.now() - startTime
        };
      }

      // Preparar archivos para indexación
      const filesWithMetadata = files.map(file => ({
        ...file,
        project_name: project.name || project.full_name.split('/')[1],
        projectPath: project.path_with_namespace || project.full_name,
        groupId: groupId,
        platform: this.repositoryPlatform
      }));

      // Indexar archivos
      let indexResult;
      if (groupId) {
        indexResult = await this.knowledgeBase.indexGroupData(groupId, filesWithMetadata);
      } else {
        indexResult = await this.knowledgeBase.indexData(filesWithMetadata);
      }

      const result = {
        filesIndexed: indexResult.processedFiles,
        chunksGenerated: indexResult.totalChunks,
        processingTime: Date.now() - startTime,
        platform: this.repositoryPlatform
      };

      logger.info(`Reindexación completada para ${projectName}:`, result);
      return result;

    } catch (error) {
      logger.error(`Error reindexando repositorio ${projectName}:`, error.message);
      throw error;
    }
  }

  /**
   * Responde preguntas filtradas por grupo específico
   * @param {string} prompt - Pregunta del usuario
   * @param {string} groupId - ID del grupo (opcional)
   * @param {Object} options - Opciones adicionales
   * @returns {Object} Respuesta del agente
   */
  async answerQuestionInGroup(prompt, groupId = null, options = {}) {
    const startTime = Date.now();
    
    try {
      await this.initialize();

      // Buscar contexto en el grupo específico con parámetros mejorados
      const contextChunks = await this.knowledgeBase.searchInGroup(
        prompt, 
        groupId, 
        options.searchLimit || 20, // Aumentado de 8 a 20 para más contexto
        options.threshold || 0.05   // Reducido de 0.1 a 0.05 para ser más permisivo
      );

      // Si no hay contexto suficiente, usar fallback directo con más posibilidades
      if (contextChunks.length < 3 && /clases|class|código|javascript|contenido|métodos|method|función|function|service|component|util|process/i.test(prompt)) {
        logger.info(`Contexto insuficiente (${contextChunks.length}), usando fallback directo`);
        try {
          const fallbackChunks = await this.knowledgeBase.directSearchFallback(prompt, options.searchLimit || 15);
          const filteredFallback = fallbackChunks.filter(chunk => !groupId || chunk.source.group_id === groupId);
          contextChunks.push(...filteredFallback);
          logger.info(`Fallback agregó ${filteredFallback.length} chunks adicionales`);
        } catch (fallbackErr) {
          logger.error('Error en fallback directo:', fallbackErr.message);
        }
      }

      // Determinar estrategia de respuesta
      let responseStrategy = 'no_context';
      if (contextChunks.length > 0) {
        const avgRelevance = contextChunks.reduce((s, c) => s + (c.relevance_score || 0), 0) / contextChunks.length;
        if (avgRelevance > 0.7) responseStrategy = 'high_confidence';
        else if (avgRelevance > 0.4) responseStrategy = 'medium_confidence';
        else responseStrategy = 'low_confidence';
      }

      // Generar respuesta usando el cliente de IA actual
      const currentClient = this.getActiveAIClient();
      if (!currentClient) {
        throw new Error('No hay cliente de IA disponible');
      }

      let response;
      if (this.aiProvider === 'claude') {
        // Para Claude, usar parámetros específicos y el nuevo método buildPrompt
        const claudeOptions = { 
          temperature: responseStrategy === 'high_confidence' ? 0.3 : responseStrategy === 'medium_confidence' ? 0.5 : 0.75, 
          max_tokens: 4000 
        };
        const systemPrompt = currentClient.buildPrompt(prompt, contextChunks, `grupo ${groupId}`);
        const aiResponse = await currentClient.generateResponse(systemPrompt, prompt, claudeOptions);
        // Adaptar respuesta de Claude al formato esperado
        response = {
          answer: aiResponse.text,
          metadata: aiResponse.metadata
        };
      } else if (this.aiProvider === 'openai') {
        // Para OpenAI, usar parámetros específicos
        const openaiOptions = { 
          temperature: responseStrategy === 'high_confidence' ? 0.1 : responseStrategy === 'medium_confidence' ? 0.3 : 0.5, 
          max_tokens: 4000 
        };
        const messages = currentClient.buildPrompt(prompt, contextChunks, `grupo ${groupId}`);
        const aiResponse = await currentClient.generateResponse(messages, openaiOptions);
        // Adaptar respuesta de OpenAI al formato esperado
        response = {
          answer: aiResponse.response,
          metadata: aiResponse
        };
      } else {
        // Para Gemini, usar el método existente con información del grupo
        response = await currentClient.getAnswer(prompt, contextChunks, { groupInfo: `grupo ${groupId}` });
      }

      // Preparar metadatos de la respuesta
      const sourcesUsed = contextChunks.map(chunk => ({
        file: chunk.source.file_name,
        project: chunk.source.project_name,
        group: chunk.source.group_id,
        relevance: chunk.relevance_score
      }));

      const avgRelevance = contextChunks.length > 0 ? 
        (contextChunks.reduce((s, c) => s + (c.relevance_score || 0), 0) / contextChunks.length) : 0;

      // Agregar información de debugging al inicio de la respuesta
      const debugInfo = `🔍 **[GRUPO ${groupId}]** Consultando en grupo ${groupId} | Encontrados ${contextChunks.length} chunks | Proyectos: ${[...new Set(contextChunks.map(c => c.source?.project_name).filter(p => p))].slice(0, 3).join(', ')}${contextChunks.length > 3 ? '...' : ''}\n\n`;
      
      // Corrección de organización basada en la selección del grupo del usuario
      let correctedAnswer = response.answer;
      const correctOrganization = await this.getOrganizationForGroup(groupId);
      
      // Corregir referencias incorrectas a organizaciones
      if (correctOrganization !== 'PLABACOM') {
        // Reemplazar PLABACOM por la organización correcta si es diferente
        correctedAnswer = correctedAnswer.replace(/PLABACOM/g, correctOrganization);
        correctedAnswer = correctedAnswer.replace(new RegExp(`repositorios de ${correctOrganization} que me proporcionaste`, 'g'), `repositorios de ${correctOrganization}`);
      }
      
      return {
        answer: debugInfo + correctedAnswer,
        context: contextChunks, // Agregar contexto para debug
        metadata: {
          processing_time: Date.now() - startTime,
          validation: response.validation || { is_valid: true, reason: 'Validación no disponible para este proveedor', category: 'general' },
          enhanced_query: response.enhanced_query || null,
          context_found: contextChunks.length > 0,
          context_chunks_count: contextChunks.length,
          response_strategy: responseStrategy,
          sources_used: sourcesUsed,
          average_relevance: avgRelevance.toFixed(3),
          group_filter: groupId,
          debug_info: {
            selected_group: groupId,
            unique_groups_in_context: [...new Set(contextChunks.map(c => c.source?.group_id).filter(g => g))],
            unique_projects_in_context: [...new Set(contextChunks.map(c => c.source?.project_name).filter(p => p))]
          },
          ...response.metadata,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Error respondiendo pregunta en grupo:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup de recursos
   */
  async cleanup() {
    try {
      if (this.knowledgeBase) {
        await this.knowledgeBase.close();
      }
    } catch (error) {
      logger.error('Error en cleanup:', error.message);
    }
  }
}

// Crear instancia singleton del agente
let agentInstance = null;

/**
 * Obtiene la instancia singleton del agente
 * @returns {Agent} Instancia del agente
 */
function getAgent() {
  if (!agentInstance) {
    agentInstance = new Agent();
  }
  return agentInstance;
}

/**
 * Función principal exportada para responder preguntas
 * @param {string} prompt - Pregunta del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Object} Respuesta del agente
 */
async function answerQuestion(prompt, options = {}) {
  const agent = getAgent();
  return await agent.answerQuestion(prompt, options);
}

/**
 * Obtiene sugerencias de preguntas
 * @param {number} count - Número de sugerencias
 * @returns {Array} Array de preguntas sugeridas
 */
async function getSuggestedQuestions(count = 5) {
  const agent = getAgent();
  return await agent.getSuggestedQuestions(count);
}

/**
 * Obtiene estadísticas del sistema
 * @returns {Object} Estadísticas completas
 */
async function getStats() {
  const agent = getAgent();
  return await agent.getStats();
}

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  if (agentInstance) {
    await agentInstance.cleanup();
  }
});

process.on('SIGINT', async () => {
  if (agentInstance) {
    await agentInstance.cleanup();
  }
});

module.exports = {
  Agent,
  answerQuestion,
  getSuggestedQuestions,
  getStats,
  getAgent
};