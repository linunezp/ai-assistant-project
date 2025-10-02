const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const winston = require('winston');

// Logger configuration
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

/**
 * Gestiona repositorios Git locales con clonado, actualización y detección de cambios
 */
class RepositoryManager {
  constructor() {
    // Determinar la ruta base según el ambiente
    this.baseReposPath = process.env.NODE_ENV === 'production' 
      ? process.env.PROD_REPOS_PATH || '/mnt/repositories'
      : process.env.LOCAL_REPOS_PATH || './data/repositories';
    
    this.gitlabToken = process.env.GITLAB_PRIVATE_TOKEN;
    this.gitlabUrl = process.env.GITLAB_API_URL?.replace('/api/v4', '') || 'https://gvs.coordinador.cl';
    
    logger.info(`📁 RepositoryManager iniciado - Ruta base: ${this.baseReposPath}`);
  }

  /**
   * Asegura que el directorio base existe
   */
  async ensureBaseDirectory() {
    try {
      await fs.mkdir(this.baseReposPath, { recursive: true });
      logger.info(`✅ Directorio base verificado: ${this.baseReposPath}`);
    } catch (error) {
      logger.error(`❌ Error creando directorio base: ${error.message}`);
      throw error;
    }
  }

  /**
   * Construye la URL de clonado con autenticación
   */
  buildAuthenticatedUrl(repositoryUrl) {
    if (!this.gitlabToken) {
      logger.warn('⚠️ No se encontró GITLAB_PRIVATE_TOKEN, usando URL sin autenticación');
      return repositoryUrl;
    }

    // Convertir URLs web a URLs de clonado
    let cloneUrl = repositoryUrl;
    
    // Si es una URL web, convertirla a .git
    if (repositoryUrl.includes('/groups/') || repositoryUrl.includes('/projects/')) {
      cloneUrl = repositoryUrl.replace(/\/$/, '') + '.git';
    }
    
    // Agregar autenticación
    if (cloneUrl.startsWith('https://')) {
      return cloneUrl.replace('https://', `https://oauth2:${this.gitlabToken}@`);
    }
    
    return cloneUrl;
  }

  /**
   * Obtiene el nombre del repositorio desde la URL
   */
  getRepositoryName(repositoryUrl) {
    return repositoryUrl
      .replace(/\.git$/, '')
      .split('/')
      .pop();
  }

  /**
   * Obtiene la ruta local del repositorio
   */
  getRepositoryPath(repositoryUrl, groupName = null) {
    const repoName = this.getRepositoryName(repositoryUrl);
    
    if (groupName) {
      return path.join(this.baseReposPath, groupName, repoName);
    }
    
    return path.join(this.baseReposPath, repoName);
  }

  /**
   * Verifica si un repositorio ya existe localmente
   */
  async repositoryExists(repositoryPath) {
    try {
      await fs.access(path.join(repositoryPath, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clona un repositorio
   */
  async cloneRepository(repositoryUrl, groupName = null) {
    await this.ensureBaseDirectory();
    
    const repoPath = this.getRepositoryPath(repositoryUrl, groupName);
    const repoName = this.getRepositoryName(repositoryUrl);
    
    try {
      logger.info(`🔄 Clonando repositorio: ${repoName}`);
      
      // Verificar si ya existe
      if (await this.repositoryExists(repoPath)) {
        logger.info(`✅ Repositorio ya existe: ${repoName}`);
        return { path: repoPath, cloned: false };
      }
      
      // Crear directorio padre si no existe
      await fs.mkdir(path.dirname(repoPath), { recursive: true });
      
      // Construir URL autenticada
      const authUrl = this.buildAuthenticatedUrl(repositoryUrl);
      
      // Clonar repositorio
      const { stdout, stderr } = await execAsync(`git clone "${authUrl}" "${repoPath}"`, {
        timeout: 300000 // 5 minutos timeout
      });
      
      if (stderr && !stderr.includes('Cloning into')) {
        logger.warn(`⚠️ Git clone warning: ${stderr}`);
      }
      
      logger.info(`✅ Repositorio clonado exitosamente: ${repoName}`);
      return { path: repoPath, cloned: true };
      
    } catch (error) {
      logger.error(`❌ Error clonando repositorio ${repoName}: ${error.message}`);
      throw new Error(`Error clonando repositorio: ${error.message}`);
    }
  }

  /**
   * Actualiza un repositorio existente
   */
  async updateRepository(repositoryPath) {
    try {
      const repoName = path.basename(repositoryPath);
      logger.info(`🔄 Actualizando repositorio: ${repoName}`);
      
      // Verificar que existe
      if (!(await this.repositoryExists(repositoryPath))) {
        throw new Error(`Repositorio no existe: ${repositoryPath}`);
      }
      
      // Obtener hash antes del pull
      const { stdout: beforeHash } = await execAsync('git rev-parse HEAD', {
        cwd: repositoryPath
      });
      
      // Hacer pull
      const { stdout, stderr } = await execAsync('git pull origin', {
        cwd: repositoryPath,
        timeout: 60000 // 1 minuto timeout
      });
      
      // Obtener hash después del pull
      const { stdout: afterHash } = await execAsync('git rev-parse HEAD', {
        cwd: repositoryPath
      });
      
      const hasChanges = beforeHash.trim() !== afterHash.trim();
      
      if (hasChanges) {
        logger.info(`✅ Repositorio actualizado con cambios: ${repoName}`);
      } else {
        logger.info(`✅ Repositorio actualizado sin cambios: ${repoName}`);
      }
      
      return {
        updated: true,
        hasChanges,
        beforeHash: beforeHash.trim(),
        afterHash: afterHash.trim()
      };
      
    } catch (error) {
      logger.error(`❌ Error actualizando repositorio: ${error.message}`);
      throw new Error(`Error actualizando repositorio: ${error.message}`);
    }
  }

  /**
   * Detecta archivos modificados usando git diff
   */
  async getChangedFiles(repositoryPath, fromHash, toHash = 'HEAD') {
    try {
      const { stdout } = await execAsync(`git diff --name-only ${fromHash} ${toHash}`, {
        cwd: repositoryPath
      });
      
      const changedFiles = stdout
        .split('\n')
        .filter(file => file.trim() !== '')
        .map(file => path.join(repositoryPath, file));
      
      logger.info(`📄 Archivos modificados detectados: ${changedFiles.length}`);
      return changedFiles;
      
    } catch (error) {
      logger.error(`❌ Error detectando archivos modificados: ${error.message}`);
      return [];
    }
  }

  /**
   * Lista todos los archivos de un repositorio (filtrados por extensiones)
   */
  async listRepositoryFiles(repositoryPath, extensions = ['.js', '.ts', '.md', '.json', '.py', '.java']) {
    try {
      const files = [];
      
      async function scanDirectory(dirPath) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          // Ignorar directorios .git y node_modules
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
              // Convertir ruta absoluta a relativa desde el repositorio
              const relativePath = path.relative(repositoryPath, fullPath);
              files.push(relativePath);
            }
          }
        }
      }
      
      await scanDirectory(repositoryPath);
      logger.info(`📄 Archivos encontrados en repositorio: ${files.length}`);
      return files;
      
    } catch (error) {
      logger.error(`❌ Error listando archivos del repositorio: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene información del repositorio
   */
  async getRepositoryInfo(repositoryPath) {
    try {
      const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', {
        cwd: repositoryPath
      });
      
      const { stdout: currentBranch } = await execAsync('git branch --show-current', {
        cwd: repositoryPath
      });
      
      const { stdout: lastCommit } = await execAsync('git log -1 --format="%H %s %an %ad"', {
        cwd: repositoryPath
      });
      
      return {
        path: repositoryPath,
        name: path.basename(repositoryPath),
        remoteUrl: remoteUrl.trim(),
        currentBranch: currentBranch.trim(),
        lastCommit: lastCommit.trim()
      };
      
    } catch (error) {
      logger.error(`❌ Error obteniendo información del repositorio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el hash del commit actual del repositorio
   */
  async getCurrentCommitHash(repositoryPath) {
    try {
      if (!(await this.repositoryExists(repositoryPath))) {
        return null;
      }
      
      const { stdout } = await execAsync('git rev-parse HEAD', {
        cwd: repositoryPath
      });
      
      return stdout.trim();
    } catch (error) {
      logger.warn(`⚠️ No se pudo obtener hash del commit: ${error.message}`);
      return null;
    }
  }

  /**
   * Elimina un repositorio local
   */
  async removeRepository(repositoryPath) {
    try {
      await fs.rm(repositoryPath, { recursive: true, force: true });
      logger.info(`🗑️ Repositorio eliminado: ${repositoryPath}`);
    } catch (error) {
      logger.error(`❌ Error eliminando repositorio: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RepositoryManager;