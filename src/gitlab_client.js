const axios = require('axios');
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

class GitLabClient {
  constructor() {
    this.apiUrl = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';
    this.privateToken = process.env.GITLAB_PRIVATE_TOKEN;
    this.projectId = process.env.GITLAB_PROJECT_ID || null;
    this.groupId = process.env.GITLAB_GROUP_ID || null;

    if (!this.privateToken) {
      throw new Error('GITLAB_PRIVATE_TOKEN es requerido en las variables de entorno');
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Private-Token': this.privateToken,
        'Content-Type': 'application/json'
      },
      timeout: 120000, // 2 minutos para conexiones lentas
      maxRedirects: 3  // Reducir redirects
    });
    
    // Rate limiting para evitar bloqueos
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 segundo entre requests
  }

  // Helper: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper: retry wrapper with exponential backoff
  async withRetry(fn, attempts = null, initialDelayMs = null) {
    const maxAttempts = attempts || (process.env.GITLAB_RETRY_COUNT ? parseInt(process.env.GITLAB_RETRY_COUNT, 10) : 3);
    const initialDelay = initialDelayMs || (process.env.GITLAB_RETRY_DELAY_MS ? parseInt(process.env.GITLAB_RETRY_DELAY_MS, 10) : 5000); // Aumentar delay inicial

    let attempt = 0;
    while (true) {
      try {
        // Rate limiting: esperar al menos 1 segundo entre requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          await this.sleep(this.minRequestInterval - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();
        
        return await fn();
      } catch (err) {
        attempt += 1;
        const status = err.response?.status;
        // For 4xx errors (except 429) don't retry
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw err;
        }

        if (attempt >= maxAttempts) {
          logger.error(`Request failed after ${attempt} attempts: ${err.message}`);
          throw err;
        }

        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.warn(`Request failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms: ${err.message}`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Permite cambiar el projectId dinámicamente (útil cuando se listan proyectos de un grupo)
   * @param {string|number} projectId
   */
  setProjectId(projectId) {
    this.projectId = projectId;
  }

  /**
   * Permite cambiar el groupId dinámicamente
   * @param {string|number} groupId
   */
  setGroupId(groupId) {
    this.groupId = groupId;
  }

  /**
   * Obtiene información de un grupo de GitLab
   * @param {string|number} groupId - ID o path del grupo
   * @returns {Object} Información del grupo (id, name, path, description, projectsCount)
   */
  async getGroupInfo(groupId) {
    if (!groupId) {
      throw new Error('Group ID es requerido');
    }

    try {
      logger.info(`Obteniendo información del grupo: ${groupId}`);
      
      const response = await this.withRetry(() => 
        this.axiosInstance.get(`/groups/${encodeURIComponent(groupId)}`)
      );
      
      const group = response.data;
      
      // Contar proyectos del grupo - obtenemos todos para contar correctamente
      // IMPORTANTE: incluir subgrupos para que coincida con listGroupProjects
      const projectsResponse = await this.withRetry(() =>
        this.axiosInstance.get(`/groups/${encodeURIComponent(groupId)}/projects`, {
          params: {
            per_page: 100,
            simple: true,
            include_subgroups: true
          }
        })
      );
      
      // Debug: mostrar información de headers y respuesta
      logger.info(`Debug headers: x-total=${projectsResponse.headers['x-total']}, x-total-pages=${projectsResponse.headers['x-total-pages']}, data.length=${projectsResponse.data.length}`);
      
      // Usar el header x-total si está disponible, sino contar los proyectos directamente
      let projectsCount = 0;
      if (projectsResponse.headers['x-total']) {
        projectsCount = parseInt(projectsResponse.headers['x-total']);
        logger.info(`Usando x-total header: ${projectsCount}`);
      } else if (projectsResponse.headers['x-total-pages']) {
        // Si tenemos páginas, necesitamos calcular o hacer más requests
        const totalPages = parseInt(projectsResponse.headers['x-total-pages']);
        if (totalPages === 1) {
          projectsCount = projectsResponse.data.length;
          logger.info(`Una página, contando datos directamente: ${projectsCount}`);
        } else {
          // Para simplificar, usamos una aproximación
          projectsCount = projectsResponse.data.length * totalPages;
          logger.info(`Múltiples páginas (${totalPages}), aproximación: ${projectsCount}`);
        }
      } else {
        // Fallback: contar los proyectos en la respuesta actual
        projectsCount = projectsResponse.data.length;
        logger.info(`Sin headers especiales, contando datos directamente: ${projectsCount}`);
      }
      
      logger.info(`Proyectos contados en grupo ${groupId}: ${projectsCount}`);
      
      return {
        id: group.id,
        name: group.name,
        path: group.path,
        description: group.description || '',
        webUrl: group.web_url,
        projectsCount: projectsCount,
        visibility: group.visibility
      };
    } catch (error) {
      logger.error(`Error obteniendo información del grupo:`, error.response?.data || error.message);
      throw new Error(`Error obteniendo grupo ${groupId}: ${error.message}`);
    }
  }

  /**
   * Lista todos los grupos accesibles
   * @param {Object} options - Opciones de filtrado
   * @returns {Array} Array de grupos accesibles
   */
  async listAccessibleGroups(options = {}) {
    return await this.withRetry(async () => {
      const response = await this.axiosInstance.get('/groups', {
        params: {
          per_page: 100,
          owned: false, // Incluir grupos donde el usuario tiene acceso
          order_by: 'name',
          sort: 'asc',
          ...options
        }
      });

      return response.data.map(group => ({
        id: group.id,
        name: group.name,
        path: group.path,
        full_path: group.full_path,
        web_url: group.web_url,
        visibility: group.visibility,
        description: group.description
      }));
    });
  }

  /**
   * Lista proyectos dentro de un grupo de GitLab (soporta paginación)
   * @param {string|number} groupId - ID o path del grupo
   * @returns {Array} Array de proyectos (id, name, path, web_url, default_branch)
   */
  async listGroupProjects(groupId = null) {
    const gid = groupId || this.groupId;
    if (!gid) {
      throw new Error('groupId no proporcionado y GITLAB_GROUP_ID no está configurado');
    }

    try {
      const projects = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.withRetry(() => this.axiosInstance.get(`/groups/${encodeURIComponent(gid)}/projects`, {
          params: {
            page,
            per_page: perPage,
            include_subgroups: true
          }
        }));

        if (!Array.isArray(response.data) || response.data.length === 0) break;

        for (const p of response.data) {
          projects.push({
            id: p.id,
            name: p.name,
            path_with_namespace: p.path_with_namespace,
            web_url: p.web_url,
            default_branch: p.default_branch
          });
        }

        if (response.data.length < perPage) break;
        page += 1;
      }

      return projects;
    } catch (error) {
      logger.error('Error listando proyectos del grupo:', error.message);
      throw new Error(`Error conectando con GitLab para listar proyectos del grupo: ${error.message}`);
    }
  }

  /**
   * Obtiene información básica del proyecto
   */
  async getProjectInfo() {
    if (!this.projectId) {
      throw new Error('GITLAB_PROJECT_ID no está configurado. Llama a setProjectId(projectId) o configura GITLAB_PROJECT_ID en .env');
    }

    try {
  const response = await this.withRetry(() => this.axiosInstance.get(`/projects/${this.projectId}`));
      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        web_url: response.data.web_url,
        default_branch: response.data.default_branch,
        last_activity_at: response.data.last_activity_at
      };
    } catch (error) {
      logger.error('Error obteniendo información del proyecto:', error.message);
      throw new Error(`Error conectando con GitLab: ${error.message}`);
    }
  }

  /**
   * Obtiene un proyecto por su path_with_namespace (por ejemplo 'group/subgroup/project')
   * @param {string} pathWithNamespace
   */
  async getProjectByPath(pathWithNamespace) {
    try {
      if (!pathWithNamespace) throw new Error('pathWithNamespace requerido');
      const response = await this.withRetry(() => this.axiosInstance.get(`/projects/${encodeURIComponent(pathWithNamespace)}`));
      const p = response.data;
      return {
        id: p.id,
        name: p.name,
        path_with_namespace: p.path_with_namespace,
        web_url: p.web_url,
        default_branch: p.default_branch
      };
    } catch (error) {
      logger.error('Error obteniendo proyecto por path:', error.message || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Busca proyectos accesibles por el token usando el parámetro `search`
   * @param {string} searchTerm
   */
  async searchProjects(searchTerm) {
    try {
      const projects = [];
      let page = 1;
      const perPage = 100;
      while (true) {
        const response = await this.withRetry(() => this.axiosInstance.get('/projects', { params: { search: searchTerm, page, per_page: perPage } }));
        if (!Array.isArray(response.data) || response.data.length === 0) break;
        for (const p of response.data) {
          projects.push({ id: p.id, name: p.name, path_with_namespace: p.path_with_namespace, web_url: p.web_url, default_branch: p.default_branch });
        }
        if (response.data.length < perPage) break;
        page += 1;
      }
      return projects;
    } catch (error) {
      logger.error('Error buscando proyectos:', error.message || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Obtiene la lista de archivos del repositorio de forma recursiva
   * @param {string} path - Ruta dentro del repositorio (opcional)
   * @param {string} ref - Rama o commit (opcional, usa default_branch por defecto)
   * @returns {Array} Lista de archivos con su información
   */
  async getRepositoryTree(path = '', ref = null) {
    try {
      if (!this.projectId) {
        throw new Error('GITLAB_PROJECT_ID no está configurado. Llama a setProjectId(projectId) o configura GITLAB_PROJECT_ID en .env');
      }
      const params = {
        recursive: true,
        per_page: 100
      };
      
      if (path) params.path = path;
      if (ref) params.ref = ref;

      const response = await this.withRetry(() => this.axiosInstance.get(
        `/projects/${this.projectId}/repository/tree`,
        { params }
      ));

      // Filtrar solo archivos (no directorios) y archivos de texto
      const textFileExtensions = [
        // Documentación y texto
        '.md', '.txt', '.rst', '.adoc', '.org',
        // Código fuente
        '.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
        '.html', '.css', '.scss', '.sass', '.less',
        '.vue', '.jsx', '.tsx', '.svelte',
        // Configuración y datos
        '.json', '.xml', '.yml', '.yaml', '.toml',
        '.ini', '.cfg', '.conf', '.config', '.env',
        '.properties', '.gradle', '.pom',
        // Scripts y automatización
        '.sh', '.bat', '.ps1', '.dockerfile', '.makefile',
        // Bases de datos
        '.sql', '.ddl', '.dml',
        // Otros lenguajes
        '.r', '.rb', '.php', '.go', '.rs', '.kt', '.swift', '.dart',
        // Archivos de proyecto
        '.log', '.csv', '.gitignore', '.dockerignore',
        '.lock', '.sum', '.mod'
      ];

      return response.data
        .filter(item => item.type === 'blob') // Solo archivos, no directorios
        .filter(item => {
          const extension = '.' + item.name.split('.').pop().toLowerCase();
          const fileName = item.name.toLowerCase();
          
          // Incluir archivos por extensión
          if (textFileExtensions.includes(extension)) return true;
          
          // Incluir archivos de documentación comunes (sin extensión o con extensiones no estándar)
          const docFileNames = [
            'readme', 'license', 'changelog', 'contributing', 'authors',
            'install', 'usage', 'help', 'todo', 'news', 'history',
            'copying', 'notice', 'disclaimer', 'manifest', 'version',
            'dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile'
          ];
          
          if (docFileNames.some(doc => fileName.includes(doc))) return true;
          
          // Incluir archivos sin extensión que podrían ser documentación o configuración
          if (!item.name.includes('.') && item.size < 100000) return true; // < 100KB
          
          return false;
        })
        .map(item => ({
          id: item.id,
          name: item.name,
          path: item.path,
          mode: item.mode,
          type: item.type,
          size: item.size || 0
        }));
    } catch (error) {
      logger.error('Error obteniendo árbol del repositorio:', error.message);
      throw new Error(`Error obteniendo archivos del repositorio: ${error.message}`);
    }
  }

  /**
   * Obtiene el contenido de un archivo específico
   * @param {string} filePath - Ruta del archivo en el repositorio
   * @param {string} ref - Rama o commit (opcional)
   * @returns {Object} Contenido del archivo con metadatos
   */
  async getFileContent(filePath, ref = null) {
    try {
      if (!this.projectId) {
        throw new Error('GITLAB_PROJECT_ID no está configurado. Llama a setProjectId(projectId) o configura GITLAB_PROJECT_ID en .env');
      }
      const params = {};
      if (ref) params.ref = ref;

      const response = await this.withRetry(() => this.axiosInstance.get(
        `/projects/${this.projectId}/repository/files/${encodeURIComponent(filePath)}`,
        { params }
      ));

      // El contenido viene en base64, necesitamos decodificarlo
      let content = '';
      if (response.data.content) {
        content = Buffer.from(response.data.content, 'base64').toString('utf8');
      }

      return {
        file_name: response.data.file_name,
        file_path: response.data.file_path,
        size: response.data.size,
        encoding: response.data.encoding,
        content: content,
        content_sha256: response.data.content_sha256,
        ref: response.data.ref,
        blob_id: response.data.blob_id,
        commit_id: response.data.commit_id,
        last_commit_id: response.data.last_commit_id
      };
    } catch (error) {
      logger.error(`Error obteniendo contenido del archivo ${filePath}:`, error.message);
      if (error.response?.status === 404) {
        throw new Error(`Archivo no encontrado: ${filePath}`);
      }
      throw new Error(`Error obteniendo contenido del archivo: ${error.message}`);
    }
  }

  /**
   * Obtiene el contenido de múltiples archivos en lotes
   * @param {Array} filePaths - Array de rutas de archivos
   * @param {string} ref - Rama o commit (opcional)
   * @param {number} batchSize - Tamaño del lote para procesar archivos
   * @returns {Array} Array de objetos con contenido de archivos
   */
  async getMultipleFileContents(filePaths, ref = null, batchSize = 5) {
    const results = [];
    const errors = [];

    // Procesar archivos en lotes para evitar sobrecargar la API
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (filePath) => {
        try {
          const content = await this.getFileContent(filePath, ref);
          return content;
        } catch (error) {
          logger.warn(`Error procesando archivo ${filePath}: ${error.message}`);
          errors.push({ filePath, error: error.message });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));

      // Pequeña pausa entre lotes para no sobrecargar la API
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (errors.length > 0) {
      logger.warn(`Se encontraron errores en ${errors.length} archivos:`, errors);
    }

    return results;
  }

  /**
   * Escanea todo el repositorio y obtiene el contenido de todos los archivos de texto
   * @param {string} ref - Rama o commit (opcional)
   * @returns {Array} Array con el contenido de todos los archivos
   */
  async scanRepository(ref = null) {
    try {
      logger.info('Iniciando escaneo del repositorio...');
      
      // Obtener información del proyecto
      const projectInfo = await this.getProjectInfo();
      logger.info(`Escaneando proyecto: ${projectInfo.name}`);
      // Determinar la rama/ref a usar para obtener contenidos (usar default_branch si no se especifica)
      const refToUse = ref || projectInfo.default_branch || 'master';

      // Obtener lista de archivos
      const files = await this.getRepositoryTree('', refToUse);
      logger.info(`Se encontraron ${files.length} archivos de texto`);

      if (files.length === 0) {
        logger.warn('No se encontraron archivos de texto en el repositorio');
        return [];
      }

      // Filtrar archivos muy grandes (> 5MB)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const filteredFiles = files.filter(file => file.size < MAX_FILE_SIZE);
      if (filteredFiles.length < files.length) {
        logger.info(`Se excluyeron ${files.length - filteredFiles.length} archivos por ser muy grandes (> 5MB)`);
      }

      // Obtener contenido de todos los archivos
  const filePaths = filteredFiles.map(file => file.path);
  const fileContents = await this.getMultipleFileContents(filePaths, refToUse);

      logger.info(`Se procesaron exitosamente ${fileContents.length} archivos`);

      return fileContents.map(content => ({
        ...content,
        project_info: projectInfo
      }));

    } catch (error) {
      logger.error('Error escaneando el repositorio:', error.message);
      throw error;
    }
  }

  /**
   * Busca archivos que contengan cierto texto
   * @param {string} searchTerm - Término a buscar
   * @param {string} scope - Ámbito de búsqueda ('blobs', 'commits', 'issues', etc.)
   * @returns {Array} Resultados de la búsqueda
   */
  async searchInRepository(searchTerm, scope = 'blobs') {
    try {
      if (!this.projectId) {
        throw new Error('GITLAB_PROJECT_ID no está configurado. Llama a setProjectId(projectId) o configura GITLAB_PROJECT_ID en .env');
      }

      const response = await this.withRetry(() => this.axiosInstance.get(`/projects/${this.projectId}/search`, {
        params: {
          scope: scope,
          search: searchTerm,
          per_page: 50
        }
      }));

      return response.data.map(item => ({
        id: item.id,
        filename: item.filename,
        path: item.path,
        ref: item.ref,
        startline: item.startline,
        data: item.data
      }));
    } catch (error) {
      logger.error('Error buscando en el repositorio:', error.message);
      throw new Error(`Error en búsqueda: ${error.message}`);
    }
  }

  /**
   * Escanea todos los repositorios de un grupo y obtiene archivos
   * @param {string|number} groupId - ID o path del grupo
   * @param {Object} options - Opciones de escaneo
   * @returns {Array} Array de archivos encontrados
   */
  async scanGroupRepositories(groupId, options = {}) {
    const {
      includeSubgroups = true,
      fileExtensions = ['.js', '.ts', '.md', '.json', '.py', '.java', '.go', '.php', '.rb', '.cs'],
      maxFilesPerRepo = 1000
    } = options;

    try {
      logger.info(`Escaneando repositorios del grupo: ${groupId}`);
      
      // Obtener proyectos del grupo
      const projects = await this.listGroupProjects(groupId);
      logger.info(`Proyectos encontrados: ${projects.length}`);
      
      let allFiles = [];
      
      for (const project of projects) {
        try {
          logger.info(`Escaneando proyecto: ${project.name}`);
          
          // Establecer proyecto actual
          this.setProjectId(project.id);
          
          // Escanear archivos del repositorio
          const files = await this.scanRepository();
          
          // Filtrar por extensiones si se especifican
          const filteredFiles = files.filter(file => {
            if (fileExtensions.length === 0) return true;
            return fileExtensions.some(ext => file.path.toLowerCase().endsWith(ext.toLowerCase()));
          }).slice(0, maxFilesPerRepo);
          
          // Agregar información del proyecto a cada archivo
          const projectFiles = filteredFiles.map(file => ({
            ...file,
            projectId: project.id,
            projectName: project.name,
            projectPath: project.path,
            groupId: groupId
          }));
          
          allFiles = allFiles.concat(projectFiles);
          
          logger.info(`Archivos encontrados en ${project.name}: ${filteredFiles.length}`);
          
        } catch (error) {
          logger.warn(`Error escaneando proyecto ${project.name}:`, error.message);
          continue;
        }
      }
      
      logger.info(`Total de archivos encontrados en el grupo: ${allFiles.length}`);
      
      return {
        files: allFiles,
        projectsFound: projects.length,
        projectsWithFiles: allFiles.length > 0 ? new Set(allFiles.map(f => f.projectName)).size : 0
      };
      
    } catch (error) {
      logger.error(`Error escaneando repositorios del grupo:`, error.message);
      throw error;
    }
  }
}

module.exports = GitLabClient;