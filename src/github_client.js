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

class GitHubClient {
  constructor() {
    this.apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
    this.accessToken = process.env.GITHUB_ACCESS_TOKEN;
    this.username = process.env.GITHUB_USERNAME || null;
    this.organization = process.env.GITHUB_ORGANIZATION || null;

    if (!this.accessToken) {
      throw new Error('GITHUB_ACCESS_TOKEN es requerido en las variables de entorno');
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Assistant-Project'
      },
      timeout: 120000, // 2 minutos para conexiones lentas
      maxRedirects: 3
    });
    
    // Rate limiting para GitHub API (5000 requests/hour)
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 segundo entre requests
  }

  // Helper: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper: retry wrapper with exponential backoff
  async withRetry(fn, attempts = null, initialDelayMs = null) {
    const maxAttempts = attempts || (process.env.GITHUB_RETRY_COUNT ? parseInt(process.env.GITHUB_RETRY_COUNT, 10) : 3);
    const initialDelay = initialDelayMs || (process.env.GITHUB_RETRY_DELAY_MS ? parseInt(process.env.GITHUB_RETRY_DELAY_MS, 10) : 2000);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          await this.sleep(this.minRequestInterval - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();

        return await fn();
      } catch (error) {
        logger.warn(`GitHub API attempt ${attempt}/${maxAttempts} failed:`, error.message);
        
        // Check for rate limiting
        if (error.response?.status === 403 && error.response?.headers['x-ratelimit-remaining'] === '0') {
          const resetTime = parseInt(error.response.headers['x-ratelimit-reset']) * 1000;
          const waitTime = resetTime - Date.now() + 1000; // Add 1 second buffer
          logger.warn(`Rate limit exceeded. Waiting ${waitTime}ms until reset.`);
          if (waitTime > 0) {
            await this.sleep(waitTime);
          }
        }
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.info(`Waiting ${delay}ms before retry...`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Obtiene información de una organización de GitHub
   * @param {string} orgName - Nombre de la organización
   * @returns {Object} Información de la organización
   */
  async getOrganizationInfo(orgName) {
    return await this.withRetry(async () => {
      logger.info(`Getting GitHub organization info for: ${orgName}`);
      
      const response = await this.axiosInstance.get(`/orgs/${orgName}`);
      
      const orgInfo = {
        id: response.data.id,
        name: response.data.name || response.data.login,
        login: response.data.login,
        description: response.data.description,
        public_repos: response.data.public_repos,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        html_url: response.data.html_url
      };

      logger.info(`Organization found: ${orgInfo.name} (${orgInfo.login}) with ${orgInfo.public_repos} public repos`);
      return orgInfo;
    });
  }

  /**
   * Lista las organizaciones accesibles para el usuario autenticado
   * @param {Object} options - Opciones de filtrado
   * @returns {Array} Lista de organizaciones
   */
  async listAccessibleOrganizations(options = {}) {
    return await this.withRetry(async () => {
      logger.info('Listing accessible GitHub organizations');
      
      const params = {
        per_page: options.per_page || 100,
        page: options.page || 1
      };

      const response = await this.axiosInstance.get('/user/orgs', { params });
      
      const organizations = response.data.map(org => ({
        id: org.id,
        name: org.name || org.login,
        login: org.login,
        description: org.description,
        public_repos: org.public_repos,
        html_url: org.html_url
      }));

      logger.info(`Found ${organizations.length} accessible organizations`);
      return organizations;
    });
  }

  /**
   * Lista los repositorios de una organización
   * @param {string} orgName - Nombre de la organización
   * @returns {Array} Lista de repositorios
   */
  async listOrganizationRepositories(orgName) {
    const allRepos = [];
    let page = 1;
    const perPage = 100;

    return await this.withRetry(async () => {
      logger.info(`Listing repositories for organization: ${orgName}`);
      
      while (true) {
        const params = {
          per_page: perPage,
          page: page,
          type: 'all', // all, public, private, forks, sources, member
          sort: 'updated',
          direction: 'desc'
        };

        const response = await this.axiosInstance.get(`/orgs/${orgName}/repos`, { params });
        
        if (response.data.length === 0) {
          break;
        }

        const repos = response.data.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          default_branch: repo.default_branch,
          clone_url: repo.clone_url,
          ssh_url: repo.ssh_url,
          html_url: repo.html_url,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          size: repo.size,
          language: repo.language,
          archived: repo.archived,
          disabled: repo.disabled
        }));

        allRepos.push(...repos);
        
        if (response.data.length < perPage) {
          break;
        }
        page++;
      }

      logger.info(`Found ${allRepos.length} repositories in organization ${orgName}`);
      return allRepos;
    });
  }

  /**
   * Obtiene información de un repositorio específico
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @returns {Object} Información del repositorio
   */
  async getRepositoryInfo(owner, repo) {
    return await this.withRetry(async () => {
      logger.info(`Getting repository info for: ${owner}/${repo}`);
      
      const response = await this.axiosInstance.get(`/repos/${owner}/${repo}`);
      
      const repoInfo = {
        id: response.data.id,
        name: response.data.name,
        full_name: response.data.full_name,
        description: response.data.description,
        private: response.data.private,
        default_branch: response.data.default_branch,
        clone_url: response.data.clone_url,
        ssh_url: response.data.ssh_url,
        html_url: response.data.html_url,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        size: response.data.size,
        language: response.data.language,
        archived: response.data.archived,
        disabled: response.data.disabled
      };

      logger.info(`Repository found: ${repoInfo.full_name}`);
      return repoInfo;
    });
  }

  /**
   * Busca repositorios por término de búsqueda
   * @param {string} searchTerm - Término de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Array} Lista de repositorios encontrados
   */
  async searchRepositories(searchTerm, options = {}) {
    return await this.withRetry(async () => {
      logger.info(`Searching repositories for: ${searchTerm}`);
      
      const params = {
        q: searchTerm,
        per_page: options.per_page || 30,
        page: options.page || 1,
        sort: options.sort || 'updated',
        order: options.order || 'desc'
      };

      const response = await this.axiosInstance.get('/search/repositories', { params });
      
      const repositories = response.data.items.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        default_branch: repo.default_branch,
        clone_url: repo.clone_url,
        html_url: repo.html_url,
        language: repo.language,
        score: repo.score
      }));

      logger.info(`Found ${repositories.length} repositories matching "${searchTerm}"`);
      return repositories;
    });
  }

  /**
   * Obtiene el árbol de archivos de un repositorio
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @param {string} path - Ruta dentro del repositorio
   * @param {string} ref - Rama o commit
   * @returns {Array} Lista de archivos y directorios
   */
  async getRepositoryTree(owner, repo, path = '', ref = null) {
    return await this.withRetry(async () => {
      const branch = ref || 'main'; // GitHub usa 'main' como rama por defecto
      logger.info(`Getting repository tree for: ${owner}/${repo} at ${branch}/${path}`);
      
      let url;
      if (path) {
        url = `/repos/${owner}/${repo}/contents/${path}`;
      } else {
        url = `/repos/${owner}/${repo}/contents`;
      }

      const params = ref ? { ref } : {};
      const response = await this.axiosInstance.get(url, { params });
      
      const items = Array.isArray(response.data) ? response.data : [response.data];
      
      const tree = items.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type, // file, dir
        size: item.size,
        sha: item.sha,
        download_url: item.download_url,
        git_url: item.git_url
      }));

      logger.info(`Found ${tree.length} items in ${owner}/${repo}/${path}`);
      return tree;
    });
  }

  /**
   * Obtiene el contenido de un archivo
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @param {string} filePath - Ruta del archivo
   * @param {string} ref - Rama o commit
   * @returns {Object} Contenido del archivo
   */
  async getFileContent(owner, repo, filePath, ref = null) {
    return await this.withRetry(async () => {
      logger.info(`Getting file content: ${owner}/${repo}/${filePath}`);
      
      const params = ref ? { ref } : {};
      const response = await this.axiosInstance.get(`/repos/${owner}/${repo}/contents/${filePath}`, { params });
      
      if (response.data.type !== 'file') {
        throw new Error(`Path ${filePath} is not a file`);
      }

      // Decodificar contenido base64
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      
      const fileInfo = {
        name: response.data.name,
        path: response.data.path,
        size: response.data.size,
        sha: response.data.sha,
        content: content,
        encoding: response.data.encoding
      };

      logger.info(`File content retrieved: ${filePath} (${fileInfo.size} bytes)`);
      return fileInfo;
    });
  }

  /**
   * Obtiene el contenido de múltiples archivos
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @param {Array} filePaths - Array de rutas de archivos
   * @param {string} ref - Rama o commit
   * @param {number} batchSize - Tamaño del lote para procesar
   * @returns {Array} Array con el contenido de los archivos
   */
  async getMultipleFileContents(owner, repo, filePaths, ref = null, batchSize = 5) {
    const results = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchPromises = batch.map(async (filePath) => {
        try {
          return await this.getFileContent(owner, repo, filePath, ref);
        } catch (error) {
          logger.warn(`Failed to get content for ${filePath}:`, error.message);
          return {
            path: filePath,
            error: error.message,
            content: null
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Pequeña pausa entre lotes para no saturar la API
      if (i + batchSize < filePaths.length) {
        await this.sleep(500);
      }
    }
    
    return results;
  }

  /**
   * Escanea un repositorio completo y obtiene todos los archivos
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @param {string} ref - Rama o commit
   * @returns {Array} Lista de todos los archivos del repositorio
   */
  async scanRepository(owner, repo, ref = null) {
    logger.info(`Starting repository scan: ${owner}/${repo}`);
    const allFiles = [];

    const scanDirectory = async (path = '') => {
      const items = await this.getRepositoryTree(owner, repo, path, ref);
      
      for (const item of items) {
        if (item.type === 'file') {
          allFiles.push({
            name: item.name,
            path: item.path,
            size: item.size,
            sha: item.sha
          });
        } else if (item.type === 'dir') {
          await scanDirectory(item.path);
        }
      }
    };

    await scanDirectory();
    
    logger.info(`Repository scan completed: found ${allFiles.length} files in ${owner}/${repo}`);
    return allFiles;
  }

  /**
   * Busca contenido dentro de un repositorio
   * @param {string} owner - Propietario del repositorio
   * @param {string} repo - Nombre del repositorio
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Array} Resultados de la búsqueda
   */
  async searchInRepository(owner, repo, searchTerm) {
    return await this.withRetry(async () => {
      logger.info(`Searching in repository ${owner}/${repo} for: ${searchTerm}`);
      
      const params = {
        q: `${searchTerm} repo:${owner}/${repo}`,
        per_page: 100
      };

      const response = await this.axiosInstance.get('/search/code', { params });
      
      const results = response.data.items.map(item => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        html_url: item.html_url,
        score: item.score,
        repository: {
          name: item.repository.name,
          full_name: item.repository.full_name
        }
      }));

      logger.info(`Found ${results.length} code matches for "${searchTerm}"`);
      return results;
    });
  }

  /**
   * Escanea todos los repositorios de una organización
   * @param {string} orgName - Nombre de la organización
   * @param {Object} options - Opciones de escaneo
   * @returns {Object} Resultados del escaneo
   */
  async scanOrganizationRepositories(orgName, options = {}) {
    logger.info(`Starting organization scan: ${orgName}`);
    
    const repositories = await this.listOrganizationRepositories(orgName);
    const results = {
      organization: orgName,
      repositories: [],
      totalFiles: 0,
      errors: []
    };

    const maxRepos = options.maxRepositories || repositories.length;
    const reposToScan = repositories.slice(0, maxRepos);

    for (const repo of reposToScan) {
      try {
        logger.info(`Scanning repository: ${repo.full_name}`);
        
        if (repo.archived || repo.disabled) {
          logger.info(`Skipping archived/disabled repository: ${repo.full_name}`);
          continue;
        }

        const [owner, repoName] = repo.full_name.split('/');
        const files = await this.scanRepository(owner, repoName);
        
        results.repositories.push({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          language: repo.language,
          files: files,
          fileCount: files.length
        });
        
        results.totalFiles += files.length;
        
      } catch (error) {
        logger.error(`Error scanning repository ${repo.full_name}:`, error.message);
        results.errors.push({
          repository: repo.full_name,
          error: error.message
        });
      }
    }

    logger.info(`Organization scan completed: ${results.repositories.length} repositories, ${results.totalFiles} total files`);
    return results;
  }
}

module.exports = GitHubClient;