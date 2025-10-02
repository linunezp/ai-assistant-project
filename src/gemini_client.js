const { GoogleGenerativeAI } = require('@google/generative-ai');
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

class GeminiClient {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY es requerido en las variables de entorno');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    });

    // Configuración por defecto - más determinístico para respuestas precisas
    this.defaultConfig = {
      temperature: 0.3, // Reducido de 0.7 para respuestas más determinísticas
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
    };
  }

  /**
   * Construye el prompt del sistema con contexto
   * @param {string} userPrompt - Pregunta del usuario
   * @param {Array} contextChunks - Fragmentos de contexto relevantes
   * @returns {string} Prompt completo para Gemini
   */
  buildPrompt(userPrompt, contextChunks = []) {
    const systemPrompt = `Eres un asistente especializado en la plataforma PLABACOM, diseñado para ayudar tanto a desarrolladores técnicos como a usuarios funcionales y de negocio.

TU AUDIENCIA:
- DESARROLLADORES: Necesitan detalles técnicos, código, arquitectura, implementación
- USUARIOS FUNCIONALES: Necesitan entender procesos de negocio, cálculos, flujos operativos
- ANALISTAS DE NIVEL 1: Necesitan entender tanto aspectos técnicos como funcionales

TU FUENTE DE CONOCIMIENTO:
Repositorios de código fuente de GitLab de la plataforma PLABACOM que incluyen:
- Servicios de proceso (cálculos energéticos, balances, precios)
- Servicios de datos maestros (contratos, líneas, parámetros)
- Interfaces web (componentes Angular/TypeScript)
- Lógica de negocio del sector energético

INSTRUCCIONES PARA RESPUESTAS:

PARA PREGUNTAS TÉCNICAS (desarrolladores):
- Proporciona detalles completos de implementación
- Explica métodos, parámetros, y dependencias
- Muestra patrones de código y arquitectura
- Incluye ejemplos de uso cuando sea posible

PARA PREGUNTAS FUNCIONALES (negocio):
- Explica QUÉ hace cada funcionalidad en términos de negocio
- Describe CÓMO se realizan los cálculos y procesos
- Traduce conceptos técnicos a lenguaje funcional
- Contextualiza en el dominio energético cuando sea relevante

PARA BÚSQUEDAS ESPECÍFICAS:
- Si no encuentras el archivo/clase exacto, confirma que no existe
- SIEMPRE sugiere alternativas similares disponibles
- Explica tanto el aspecto técnico como funcional de las alternativas
- Lista servicios relacionados con descripción de su propósito de negocio

FORMATO DE RESPUESTA:
- Comienza explicando el propósito funcional/de negocio
- Luego proporciona detalles técnicos si es relevante
- Cita siempre las fuentes (archivos y proyectos)
- Nunca inventes información que no esté en las fuentes

INFORMACIÓN DE LOS REPOSITORIOS PLABACOM:`;

    let contextSection = '';
    if (contextChunks && contextChunks.length > 0) {
      contextSection = '\n\n--- INFORMACIÓN RELEVANTE ---\n';
      
      // Detectar si se está buscando un archivo específico
      const isSpecificFileSearch = /\.(java|ts|js|py|cpp|cs|php)(\s|$)/i.test(userPrompt);
      const searchedFileName = userPrompt.match(/(\w+\.\w+)/);
      
      if (isSpecificFileSearch && searchedFileName) {
        const fileName = searchedFileName[1];
        const hasExactMatch = contextChunks.some(chunk => 
          chunk.source.file_name.toLowerCase().includes(fileName.toLowerCase())
        );
        
        if (!hasExactMatch) {
          contextSection += `\n🔍 ANÁLISIS DE BÚSQUEDA:\n`;
          contextSection += `- Archivo buscado: "${fileName}"\n`;
          contextSection += `- Estado: NO ENCONTRADO en los repositorios indexados\n`;
          contextSection += `- Archivos similares encontrados:\n`;
          
          const relatedFiles = [...new Set(contextChunks.map(chunk => chunk.source.file_name))];
          relatedFiles.forEach(file => {
            contextSection += `  • ${file}\n`;
          });
          contextSection += `\nINSTRUCCIÓN: Confirma que el archivo buscado no existe y describe los archivos similares encontrados.\n\n`;
        }
      }
      
      contextChunks.forEach((chunk, index) => {
        contextSection += `\n[FUENTE ${index + 1}: ${chunk.source.file_name} - ${chunk.source.project_name}]\n`;
        contextSection += `${chunk.content}\n`;
        contextSection += `[Relevancia: ${(chunk.relevance_score * 100).toFixed(1)}%]\n`;
        contextSection += '---\n';
      });
    } else {
      contextSection = '\n\n--- INFORMACIÓN RELEVANTE ---\n[No se encontró información relevante en los repositorios de GitLab indexados para esta consulta específica]\n';
    }

    // Detectar tipo de consulta y adaptar el prompt
    const isSpecificFileSearch = /\.(java|ts|js|py|cpp|cs|php)(\s|$)/i.test(userPrompt);
    const isTechnicalQuery = /clase|class|método|method|función|function|código|implementa|desarrolla|programa/i.test(userPrompt);
    const isFunctionalQuery = /cálculo|calcula|proceso|funciona|negocio|operación|balance|precio|energía|línea|contrato/i.test(userPrompt);
    
    let userSection = `\n\n--- PREGUNTA DEL USUARIO ---\n${userPrompt}\n\n--- TIPO DE CONSULTA ---\n`;
    
    if (isFunctionalQuery && !isTechnicalQuery) {
      userSection += `CONSULTA FUNCIONAL - Enfoca la respuesta en:
- Propósito de negocio y funcionalidad
- Cómo se realizan los procesos/cálculos
- Impacto en operaciones energéticas
- Después incluye aspectos técnicos relevantes\n\n`;
    } else if (isTechnicalQuery) {
      userSection += `CONSULTA TÉCNICA - Enfoca la respuesta en:
- Detalles de implementación
- Métodos, parámetros y arquitectura
- Patrones de código y dependencias
- También explica el propósito funcional\n\n`;
    } else {
      userSection += `CONSULTA GENERAL - Proporciona respuesta equilibrada con aspectos funcionales y técnicos\n\n`;
    }
    
    // Manejo específico para archivos no encontrados
    if (isSpecificFileSearch && contextChunks && contextChunks.length > 0) {
      const searchedFileName = userPrompt.match(/(\w+\.\w+)/)?.[1];
      const hasExactMatch = contextChunks.some(chunk => 
        chunk.source.file_name.toLowerCase().includes(searchedFileName?.toLowerCase() || '')
      );
      
      if (!hasExactMatch) {
        const relatedFiles = [...new Set(contextChunks.map(chunk => chunk.source.file_name))];
        userSection += `--- ARCHIVO NO ENCONTRADO ---\n"${searchedFileName}" NO existe. Archivos similares disponibles: ${relatedFiles.join(', ')}\n
INSTRUCCIÓN: Confirma que no existe, lista las alternativas similares, y explica tanto el propósito funcional como técnico de cada alternativa.\n\n`;
      }
    }
    
    userSection += `--- RESPUESTA ---\n`;

    return systemPrompt + contextSection + userSection;
  }

  /**
   * Obtiene una respuesta de Gemini
   * @param {string} prompt - Pregunta del usuario
   * @param {Array} context - Contexto relevante de la base de conocimiento
   * @param {Object} options - Opciones adicionales para la generación
   * @returns {Object} Respuesta de Gemini con metadatos
   */
  async getAnswer(prompt, context = [], options = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('El prompt debe ser una cadena no vacía');
    }

    try {
      const fullPrompt = this.buildPrompt(prompt, context);
      
      // Configuración de generación
      const generationConfig = {
        ...this.defaultConfig,
        ...options
      };

      logger.info(`Enviando consulta a Gemini (${fullPrompt.length} caracteres)...`);

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig
      });

      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('Gemini devolvió una respuesta vacía');
      }

      // Extraer metadatos si están disponibles
      const metadata = {
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        prompt_length: fullPrompt.length,
        response_length: text.length,
        context_chunks_used: context.length,
        generation_config: generationConfig,
        timestamp: new Date().toISOString()
      };

      // Agregar información de usage si está disponible
      if (response.usageMetadata) {
        metadata.usage = {
          prompt_tokens: response.usageMetadata.promptTokenCount,
          candidates_tokens: response.usageMetadata.candidatesTokenCount,
          total_tokens: response.usageMetadata.totalTokenCount
        };
      }

      logger.info(`Respuesta de Gemini recibida (${text.length} caracteres)`);

      return {
        answer: text.trim(),
        metadata: metadata,
        context_used: context.map(chunk => ({
          source: chunk.source,
          relevance_score: chunk.relevance_score
        }))
      };

    } catch (error) {
      logger.error('Error obteniendo respuesta de Gemini:', error.message);
      
      // Manejar errores específicos de la API
      if (error.message.includes('API_KEY')) {
        throw new Error('Clave de API de Gemini inválida o faltante');
      }
      
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        throw new Error('Límite de cuota de Gemini excedido. Intenta más tarde');
      }
      
      if (error.message.includes('safety')) {
        throw new Error('El contenido fue bloqueado por filtros de seguridad');
      }

      throw new Error(`Error en Gemini: ${error.message}`);
    }
  }

  /**
   * Genera un resumen de un texto largo
   * @param {string} text - Texto a resumir
   * @param {number} maxLength - Longitud máxima del resumen
   * @returns {Object} Resumen generado
   */
  async generateSummary(text, maxLength = 500) {
    if (!text || typeof text !== 'string') {
      throw new Error('El texto debe ser una cadena no vacía');
    }

    const summaryPrompt = `Resume el siguiente texto en máximo ${maxLength} caracteres, manteniendo los puntos clave y la información más importante:

${text}

Resumen:`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
        generationConfig: {
          ...this.defaultConfig,
          maxOutputTokens: Math.min(maxLength * 2, 1024),
          temperature: 0.5
        }
      });

      const response = await result.response;
      const summary = response.text().trim();

      return {
        summary: summary,
        original_length: text.length,
        summary_length: summary.length,
        compression_ratio: (text.length / summary.length).toFixed(2)
      };

    } catch (error) {
      logger.error('Error generando resumen:', error.message);
      throw new Error(`Error generando resumen: ${error.message}`);
    }
  }

  /**
   * Mejora una consulta de búsqueda para obtener mejores resultados
   * @param {string} query - Consulta original
   * @returns {Object} Consulta mejorada con términos adicionales
   */
  async enhanceQuery(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('La consulta debe ser una cadena no vacía');
    }

    const enhancementPrompt = `Mejora la siguiente consulta para obtener mejores resultados de búsqueda en una base de conocimiento técnica. Proporciona términos relacionados, sinónimos y conceptos clave:

Consulta original: "${query}"

Proporciona:
1. Consulta mejorada
2. Términos relacionados
3. Conceptos clave

Respuesta en formato JSON:`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: enhancementPrompt }] }],
        generationConfig: {
          ...this.defaultConfig,
          temperature: 0.3,
          maxOutputTokens: 512
        }
      });

      const response = await result.response;
      const text = response.text().trim();

      // Intentar parsear como JSON, si falla devolver estructura básica
      try {
        return JSON.parse(text);
      } catch {
        return {
          enhanced_query: query,
          related_terms: [],
          key_concepts: [],
          original_query: query
        };
      }

    } catch (error) {
      logger.error('Error mejorando consulta:', error.message);
      // Devolver la consulta original si hay error
      return {
        enhanced_query: query,
        related_terms: [],
        key_concepts: [],
        original_query: query,
        error: error.message
      };
    }
  }

  /**
   * Valida si una pregunta es apropiada para el asistente técnico
   * @param {string} question - Pregunta a validar
   * @returns {Object} Resultado de la validación
   */
  async validateQuestion(question) {
    if (!question || typeof question !== 'string') {
      return { is_valid: false, reason: 'Pregunta vacía o inválida' };
    }

    const validationPrompt = `Evalúa si la siguiente pregunta es apropiada para un asistente técnico especializado en documentación de código y proyectos:

Pregunta: "${question}"

Criterios:
- ¿Es una pregunta técnica válida?
- ¿Se relaciona con programación, desarrollo, documentación o tecnología?
- ¿No contiene contenido inapropiado?

Responde con JSON: {"is_valid": boolean, "reason": "explicación", "category": "categoría técnica"}`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256
        }
      });

      const response = await result.response;
      const text = response.text().trim();

      try {
        return JSON.parse(text);
      } catch {
        return { 
          is_valid: true, 
          reason: 'No se pudo validar, asumiendo válida',
          category: 'general' 
        };
      }

    } catch (error) {
      logger.error('Error validando pregunta:', error.message);
      return { 
        is_valid: true, 
        reason: 'Error en validación, asumiendo válida',
        category: 'general' 
      };
    }
  }

  /**
   * Obtiene información sobre el modelo y configuración actual
   * @returns {Object} Información del cliente
   */
  getInfo() {
    return {
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      api_key_configured: !!this.apiKey,
      default_config: this.defaultConfig,
      available_methods: [
        'getAnswer',
        'generateSummary', 
        'enhanceQuery',
        'validateQuestion'
      ]
    };
  }
}

module.exports = GeminiClient;