const axios = require('axios');
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
 * Cliente para interactuar con la API de Claude (Anthropic)
 */
class ClaudeClient {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229';
    this.baseURL = 'https://api.anthropic.com/v1/messages';
    
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY es requerido');
    }

    // Configuración por defecto
    this.defaultConfig = {
      max_tokens: 4000,
      temperature: 0.3,
      top_p: 0.8,
    };

    // Configurar axios para Claude
    this.client = axios.create({
      baseURL: 'https://api.anthropic.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 30000
    });
  }

  /**
   * Construye un prompt inteligente basado en el contexto y tipo de consulta
   * @param {string} userQuery - Consulta del usuario
   * @param {Array} context - Contexto encontrado
   * @param {string} groupName - Nombre del grupo
   * @returns {string} Prompt del sistema optimizado
   */
  buildPrompt(userQuery, context, groupName = 'repositorio') {
    // Extraer organización desde groupName si viene en formato "grupo XXXX"
    let organizacion = 'PLABACOM';
    if (groupName && groupName.includes('1439')) {
      organizacion = 'RENOVA';
    }
    // TODO: Hacer esto más dinámico con mapeo configurable
    
    // Detectar el tipo de audiencia y consulta
    const queryLower = userQuery.toLowerCase();
    
    // Detectar consultas técnicas
    const isTechnicalQuery = /\b(clase|class|method|método|función|function|código|code|implementación|implementation|arquitectura|architecture|api|endpoint|database|sql|exception|error|log|debug)\b/i.test(queryLower);
    
    // Detectar consultas funcionales/de negocio
    const isFunctionalQuery = /\b(proceso|process|negocio|business|cálculo|calculo|calculation|balance|saldo|cliente|customer|producto|product|servicio|service|flujo|workflow|regla|rule|política|policy)\b/i.test(queryLower);
    
    // Detectar consultas específicas de archivos
    const isFileQuery = /\.(java|js|ts|py|php|cs|cpp|c|h)\b/i.test(userQuery);
    
    let systemPrompt = `Eres un asistente de IA especializado en análisis de código y documentación para el ${groupName}.

Tu OBJETIVO principal es servir de ayuda a:
1. 👨‍💻 Técnicos desarrolladores - Proporcionando detalles técnicos, código, arquitectura, implementación
2. 👔 Funcionales de nivel 1 - Explicando procesos de negocio, cálculos, flujos operativos  
3. 🏢 Cualquiera que requiere entendimiento de la plataforma - Ofreciendo explicaciones claras y accesibles

INSTRUCCIONES ESPECÍFICAS POR TIPO DE CONSULTA:

`;

    if (isTechnicalQuery || isFileQuery) {
      systemPrompt += `🔧 CONSULTA TÉCNICA DETECTADA:
- Proporciona detalles técnicos específicos y precisos
- Incluye fragmentos de código relevantes cuando estén disponibles
- Explica la arquitectura y patrones de diseño utilizados
- Detalla parámetros, tipos de datos, y estructuras
- Menciona dependencias y relaciones entre componentes
- Si es una clase o método, explica su propósito, parámetros, y funcionamiento interno

`;
    } else if (isFunctionalQuery) {
      systemPrompt += `💼 CONSULTA FUNCIONAL/NEGOCIO DETECTADA:
- Enfócate en el propósito del negocio y los procesos
- Explica CÓMO impacta en las operaciones del negocio
- Describe los flujos de trabajo y reglas de negocio
- Menciona cálculos, validaciones, y lógica de negocio
- Usa lenguaje accesible para usuarios no técnicos

`;
    } else {
      systemPrompt += `🎯 CONSULTA GENERAL DETECTADA:
- Proporciona una respuesta equilibrada entre aspectos técnicos y funcionales
- Comienza con una explicación general del propósito
- Luego profundiza en detalles técnicos y funcionales según corresponda

`;
    }

    systemPrompt += `REGLAS DE RESPUESTA:

1. 📋 ESTRUCTURA DE RESPUESTA:
   - Comienza con un resumen claro del componente/proceso
   - Organiza la información en secciones lógicas
   - Usa emojis y formato markdown para mejor legibilidad
   - Termina con información adicional relevante si está disponible

2. 🎯 MANEJO DE CONTEXTO:
   - Analiza TODO el contexto proporcionado antes de responder
   - Si encuentras el archivo específico, proporciona información detallada
   - Si no encuentras el archivo exacto, busca componentes relacionados
   - Siempre menciona la fuente de la información (archivo, líneas)

3. 🔍 BÚSQUEDA INTELIGENTE:
   - Si no encuentras el archivo exacto, sugiere alternativas similares
   - Busca patrones en nombres de archivos y clases relacionadas
   - Proporciona información de contexto sobre componentes similares

4. 📝 FORMATO DE CÓDIGO:
   - Usa bloques de código con sintaxis highlighting apropiada
   - Incluye comentarios explicativos en español
   - Resalta las partes más importantes del código

5. 🚫 LIMITACIONES:
   - Si no tienes información suficiente, dilo claramente
   - No inventes información que no esté en el contexto
   - Sugiere dónde el usuario podría encontrar más información

6. ⚡ REGLA CRÍTICA:
   - DEBES usar el contexto proporcionado en la sección "CONTEXTO DISPONIBLE"
   - Si hay contexto disponible, NO digas que no tienes acceso a los archivos
   - Basa tu respuesta en el código y archivos mostrados en el contexto
   - El contexto proviene de un repositorio indexado localmente
   - Si solo encuentras archivos __init__.py o con poco contenido, menciona que necesitas ver archivos más específicos (servicios, controladores, clases principales)
   - Proporciona recomendaciones generales basadas en el tipo de proyecto que observas

CONTEXTO DISPONIBLE DEL GRUPO ${groupName.toUpperCase()}:
${context && context.length > 0 ? 
  context.map((item, idx) => `
📄 **ARCHIVO ${idx + 1}: ${item.file_path || item.source?.file_name || 'archivo_desconocido'}**
� **PROYECTO**: ${item.source?.project_name || 'proyecto_desconocido'}
📍 **LÍNEAS**: ${item.start_line || 'N/A'}-${item.end_line || 'N/A'}
🎯 **RELEVANCIA**: ${(item.relevance_score * 100).toFixed(1)}%

**CONTENIDO DEL CÓDIGO:**
\`\`\`
${item.content || item.chunk_content || 'Contenido no disponible'}
\`\`\`

---`).join('\n') : 
  "❌ No se encontró contexto específico en el repositorio para esta consulta."}

🚨 IMPORTANTE: Analiza TODO el contexto proporcionado arriba antes de responder. El contexto contiene código real indexado del repositorio ${groupName}.

---
Responde de manera precisa, útil y apropiada para tu audiencia. Si no encuentras información específica, proporciona orientación sobre dónde buscar o qué componentes similares existen.`;

    return systemPrompt;
  }

  /**
   * Genera una respuesta usando Claude
   * @param {string} systemPrompt - Prompt del sistema con contexto
   * @param {string} userQuery - Consulta del usuario
   * @param {Object} options - Opciones de generación
   * @returns {Object} Respuesta de Claude con metadata
   */
  async generateResponse(systemPrompt, userQuery, options = {}) {
    const startTime = Date.now();
    
    logger.info('Iniciando consulta a Claude...', {
      model: this.model,
      promptLength: systemPrompt.length,
      queryLength: userQuery.length
    });

    try {
      const config = { ...this.defaultConfig, ...options };
      
      const messages = [
        {
          role: 'user',
          content: `${systemPrompt}\n\nPregunta: ${userQuery}`
        }
      ];

      const requestData = {
        model: this.model,
        messages: messages,
        ...config
      };

      logger.info(`Enviando consulta a Claude (${systemPrompt.length + userQuery.length} caracteres)...`);

      const response = await this.client.post('/messages', requestData);
      
      const responseTime = Date.now() - startTime;
      const responseText = response.data.content[0].text;

      logger.info(`Respuesta de Claude recibida (${responseText.length} caracteres)`, {
        responseTime: `${responseTime}ms`,
        inputTokens: response.data.usage?.input_tokens,
        outputTokens: response.data.usage?.output_tokens
      });

      return {
        text: responseText,
        metadata: {
          model: this.model,
          prompt_length: systemPrompt.length + userQuery.length,
          response_length: responseText.length,
          generation_config: config,
          timestamp: new Date().toISOString(),
          usage: response.data.usage,
          response_time: responseTime
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Error en Claude:', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        status: error.response?.status,
        statusText: error.response?.statusText
      });

      if (error.response?.status === 401) {
        throw new Error('Error de autenticación con Claude: Verifica tu CLAUDE_API_KEY');
      } else if (error.response?.status === 429) {
        throw new Error('Límite de rate excedido en Claude. Intenta de nuevo más tarde');
      } else if (error.response?.status === 400) {
        throw new Error(`Error de solicitud a Claude: ${error.response.data?.error?.message || 'Solicitud inválida'}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout en la conexión con Claude');
      }

      throw new Error(`Error inesperado en Claude: ${error.message}`);
    }
  }

  /**
   * Valida que la configuración de Claude sea correcta
   * @returns {Promise<boolean>} true si la configuración es válida
   */
  async validateConfiguration() {
    try {
      logger.info('Validando configuración de Claude...');
      
      const testResponse = await this.generateResponse(
        'Eres un asistente de IA. Responde brevemente.',
        '¿Funciona la configuración?',
        { max_tokens: 50 }
      );

      logger.info('Configuración de Claude validada exitosamente');
      return true;

    } catch (error) {
      logger.error('Error validando configuración de Claude:', error.message);
      return false;
    }
  }

  /**
   * Obtiene información sobre el modelo y configuración actual
   * @returns {Object} Información del cliente
   */
  getClientInfo() {
    return {
      provider: 'Claude (Anthropic)',
      model: this.model,
      defaultConfig: this.defaultConfig,
      hasApiKey: !!this.apiKey
    };
  }
}

module.exports = ClaudeClient;