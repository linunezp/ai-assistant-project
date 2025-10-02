const OpenAI = require('openai');
const winston = require('winston');

// Configuración del logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Cliente para interactuar con la API de OpenAI
 */
class OpenAIClient {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY es requerido');
    }

    // Configuración por defecto
    this.defaultConfig = {
      max_tokens: 4000,
      temperature: 0.3,
      top_p: 0.8,
    };

    // Configurar cliente OpenAI
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  /**
   * Construye un prompt inteligente basado en el contexto y tipo de consulta
   * @param {string} userQuery - Consulta del usuario
   * @param {Array} contextChunks - Fragmentos de contexto relevantes
   * @param {string} groupInfo - Información del grupo (opcional)
   * @returns {Array} Mensajes formateados para OpenAI
   */
  buildPrompt(userQuery, contextChunks = [], groupInfo = '') {
    // La organización se detectará automáticamente en el agent.js
    
    const systemPrompt = `Eres un asistente especializado en análisis de código y documentación, diseñado para ayudar tanto a desarrolladores técnicos como a usuarios funcionales y de negocio.

TU AUDIENCIA:
- DESARROLLADORES: Necesitan detalles técnicos, código, arquitectura, implementación
- USUARIOS FUNCIONALES: Necesitan entender procesos de negocio, cálculos, flujos operativos
- ANALISTAS DE NIVEL 1: Necesitan entender tanto aspectos técnicos como funcionales

INSTRUCCIONES ESPECÍFICAS:
1. **IDENTIFICA EL PERFIL DEL USUARIO** por el tipo de pregunta:
   - Preguntas sobre código, APIs, errores → DESARROLLADOR
   - Preguntas sobre procesos, cálculos, operaciones → FUNCIONAL
   - Preguntas mixtas → ANALISTA

2. **ADAPTA TU RESPUESTA** según el perfil:
   - Para DESARROLLADORES: Incluye código, nombres de clases, métodos, líneas específicas
   - Para FUNCIONALES: Explica el "qué" y "por qué", no el "cómo técnico"
   - Para ANALISTAS: Combina ambos enfoques

3. **ESTRUCTURA DE RESPUESTA:**
   - Respuesta directa y específica
   - Referencias precisas a archivos y líneas cuando sea relevante
   - Ejemplos prácticos
   - Explicación del contexto de negocio cuando aplique

4. **SIEMPRE:**
   - Responde en español
   - Sé específico y preciso
   - Usa el contexto proporcionado
   - Mantén el foco en ${organizacion}
   - Si no tienes información suficiente, dilo claramente

CONTEXTO DISPONIBLE:
${this.formatContextChunks(contextChunks)}

PREGUNTA DEL USUARIO: ${userQuery}

Responde de manera específica, precisa y adaptada al perfil del usuario que identificaste.`;

    return [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user", 
        content: userQuery
      }
    ];
  }

  /**
   * Formatea los chunks de contexto para el prompt
   * @param {Array} contextChunks - Fragmentos de contexto
   * @returns {string} Contexto formateado
   */
  formatContextChunks(contextChunks) {
    if (!contextChunks || contextChunks.length === 0) {
      return "No hay contexto específico disponible.";
    }

    return contextChunks.map((chunk, index) => {
      const fileName = chunk.file_path ? chunk.file_path.split('/').pop() : 'archivo_desconocido';
      const groupName = chunk.group_name || 'Grupo desconocido';
      
      return `## Fragmento ${index + 1}: ${fileName} (${groupName})
Relevancia: ${(chunk.similarity * 100).toFixed(1)}%
${chunk.content}
---`;
    }).join('\n');
  }

  /**
   * Detecta el tipo de consulta para adaptar la respuesta
   * @param {string} query - Consulta del usuario
   * @returns {string} Tipo de consulta: 'technical', 'functional', 'mixed'
   */
  detectQueryType(query) {
    const technicalKeywords = [
      'código', 'implementación', 'clase', 'método', 'función', 'variable', 'api', 'endpoint',
      'error', 'excepción', 'debug', 'log', 'configuración', 'deployment', 'arquitectura',
      'base datos', 'query', 'sql', 'json', 'xml', 'http', 'request', 'response'
    ];
    
    const functionalKeywords = [
      'proceso', 'negocio', 'cálculo', 'operación', 'flujo', 'usuario', 'cliente',
      'pago', 'transacción', 'comisión', 'tarifa', 'monto', 'saldo', 'cuenta',
      'portal', 'dashboard', 'reporte', 'validación', 'regla', 'política'
    ];

    const queryLower = query.toLowerCase();
    const technicalMatches = technicalKeywords.filter(word => queryLower.includes(word)).length;
    const functionalMatches = functionalKeywords.filter(word => queryLower.includes(word)).length;

    if (technicalMatches > functionalMatches) return 'technical';
    if (functionalMatches > technicalMatches) return 'functional';
    return 'mixed';
  }

  /**
   * Genera una respuesta usando OpenAI
   * @param {string} userQuery - Pregunta del usuario
   * @param {Array} contextChunks - Fragmentos relevantes del conocimiento
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Respuesta estructurada
   */
  async generateResponse(userQuery, contextChunks = [], options = {}) {
    try {
      const startTime = Date.now();
      
      // Detectar tipo de consulta
      const queryType = this.detectQueryType(userQuery);
      logger.info(`Tipo de consulta detectado: ${queryType}`);

      // Construir mensajes para OpenAI
      const messages = this.buildPrompt(userQuery, contextChunks);
      
      // Configurar parámetros según el tipo de consulta
      const config = {
        ...this.defaultConfig,
        ...options,
        model: this.model,
      };

      // Ajustar temperatura según el tipo de consulta
      if (queryType === 'technical') {
        config.temperature = 0.1; // Más determinístico para respuestas técnicas
      } else if (queryType === 'functional') {
        config.temperature = 0.3; // Moderado para explicaciones de negocio
      }

      logger.info(`Enviando solicitud a OpenAI con modelo: ${config.model}`);
      
      const response = await this.client.chat.completions.create({
        messages: messages,
        ...config
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const result = {
        response: response.choices[0].message.content,
        provider: 'openai',
        model: this.model,
        query_type: queryType,
        context_chunks_used: contextChunks.length,
        response_time_ms: responseTime,
        tokens_used: {
          prompt: response.usage.prompt_tokens,
          completion: response.usage.completion_tokens,
          total: response.usage.total_tokens
        },
        finish_reason: response.choices[0].finish_reason
      };

      logger.info(`Respuesta OpenAI generada en ${responseTime}ms`, {
        model: this.model,
        tokens: result.tokens_used,
        queryType: queryType
      });

      return result;

    } catch (error) {
      logger.error('Error al generar respuesta con OpenAI:', {
        error: error.message,
        model: this.model,
        userQuery: userQuery.substring(0, 100)
      });

      // Manejar errores específicos de OpenAI
      if (error.code === 'insufficient_quota') {
        throw new Error('Cuota de API de OpenAI agotada. Verifica tu plan de facturación.');
      } else if (error.code === 'invalid_api_key') {
        throw new Error('Clave de API de OpenAI inválida. Verifica tu configuración.');
      } else if (error.code === 'model_not_found') {
        throw new Error(`Modelo ${this.model} no encontrado. Verifica el nombre del modelo.`);
      } else if (error.code === 'rate_limit_exceeded') {
        throw new Error('Límite de velocidad de OpenAI excedido. Intenta nuevamente en unos minutos.');
      }

      throw new Error(`Error de OpenAI: ${error.message}`);
    }
  }

  /**
   * Lista los modelos disponibles
   * @returns {Array} Lista de modelos
   */
  async listAvailableModels() {
    try {
      const models = await this.client.models.list();
      return models.data.filter(model => 
        model.id.includes('gpt') || model.id.includes('text-davinci')
      ).map(model => ({
        id: model.id,
        created: new Date(model.created * 1000),
        owned_by: model.owned_by
      }));
    } catch (error) {
      logger.error('Error listando modelos OpenAI:', error.message);
      return [];
    }
  }

  /**
   * Valida la configuración del cliente
   * @returns {Promise<Object>} Estado de la validación
   */
  async validateConfiguration() {
    try {
      // Intentar una llamada simple para validar la API key
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
      });

      return {
        valid: true,
        model: this.model,
        apiKeyConfigured: !!this.apiKey,
        error: null
      };
    } catch (error) {
      return {
        valid: false,
        model: this.model,
        apiKeyConfigured: !!this.apiKey,
        error: error.message
      };
    }
  }
}

module.exports = OpenAIClient;