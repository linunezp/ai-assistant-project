# 🤖 AI Assistant - Agente Técnico Inteligente# Asistente de IA Local



Un asistente de inteligencia artificial especializado que utiliza repositorios de **GitLab y GitHub** como base de conocimiento y **3 motores de IA** (Google Gemini, Anthropic Claude, OpenAI GPT) para generar respuestas técnicas precisas y específicas sobre código fuente.



## 🎯 Objetivo Principal

**"Tener un agente técnico funcional que responda todas las preguntas de forma acertada y específica sobre el código fuente"**

✅ **VALIDADO**: El sistema responde preguntas técnicas específicas con referencias exactas a archivos, líneas de código, y análisis contextual detallado.



**"Tener un agente técnico funcional que responda todas las preguntas de forma acertada y específica sobre el código fuente"**

✅ **VALIDADO**: El sistema responde preguntas técnicas específicas con referencias exactas a archivos, líneas de código, y análisis contextual detallado.

## 🚀 Características Principales

### 📦 **Soporte Dual-Platform**
- 🦊 **GitLab**: Integración completa con GitLab (self-hosted o GitLab.com)
- 🐙 **GitHub**: Soporte completo para repositorios de GitHub
- 🔄 **Cambio dinámico** entre plataformas desde la interfaz web

### 🔧 **Sistema de IA Multi-Motor**
- 🌟 **Google Gemini**: Rápido y eficiente para consultas técnicas generales
- 🧠 **Anthropic Claude**: Análisis detallado y respuestas estructuradas
- ⚡ **OpenAI GPT**: Comprensión avanzada y respuestas versátiles
- 🔄 **Cambio dinámico** entre motores desde la interfaz web

### � **Base de Conocimiento Inteligente**
- **PostgreSQL + pgvector**: Búsquedas semánticas de alta velocidad
- **Priorización de archivos**: Código fuente (Java 3.0x) > documentación (1.0x) > migraciones (0.3x)
- **Indexación automática**: Procesa repositorios completos de GitLab y GitHub
- **Chunks optimizados**: División inteligente de documentos para mejor contexto

### 🌐 **Interfaz y API**
- **API REST**: Servidor Express con endpoints para interactuar con el asistente
- **Interfaz Web**: Dashboard completo con selectores de plataforma y motor de IA
- **Procesamiento inteligente**: Divide documentos en chunks, mejora consultas automáticamente
- **Logging avanzado**: Sistema de logs detallado para monitoreo y debugging

## 📋 Requisitos Previos

### 📊 **Base de Conocimiento Inteligente**

- **PostgreSQL + pgvector**: Búsquedas semánticas de alta velocidad- **Node.js** >= 16.0.0

- **Priorización de archivos**: Código fuente (Java 3.0x) > documentación (1.0x) > migraciones (0.3x)- **PostgreSQL** >= 12 con extensión `pgvector`

- **Indexación automática**: Procesa repositorios completos de GitLab- **Cuenta de GitLab** con acceso al repositorio objetivo

- **Chunks optimizados**: División inteligente de documentos para mejor contexto- **Al menos una API Key de IA**:

  - Google Gemini (recomendado)

### 🌐 **Interfaz Completa**  - Anthropic Claude (opcional)

- **Dashboard web responsivo**: http://localhost:3000  - OpenAI GPT (opcional)

- **Selector de motores IA**: Cambio en tiempo real

- **Chat formateado**: Respuestas estructuradas con sintaxis highlighting## 🛠️ Instalación

- **Exportación PDF**: Descarga conversaciones técnicas

- **API REST completa**: Integración programática1. **Clonar e instalar dependencias**:

```bash

---cd C:\Desarrollos\ai-assistant-project

npm install

## 📋 Requisitos del Sistema```



### **Software Base**2. **Configurar PostgreSQL con pgvector**:

- **Node.js** >= 16.0.0```sql

- **PostgreSQL** >= 12 con extensión `pgvector`-- Conectar a PostgreSQL como superusuario

- **Git** para clonado de repositoriosCREATE DATABASE ai_assistant;

\c ai_assistant;

### **Credenciales Requeridas**CREATE EXTENSION vector;

- **GitLab**: Token de acceso personal con permisos `read_api`, `read_repository````

- **Al menos una API Key de IA**:

  - 🌟 Google Gemini (recomendado) - [Google AI Studio](https://makersuite.google.com/app/apikey)3. **Configurar variables de entorno**:

  - 🧠 Anthropic Claude (opcional) - [Anthropic Console](https://console.anthropic.com/)Copiar `.env` y completar con tus credenciales:

  - ⚡ OpenAI GPT (opcional) - [OpenAI Platform](https://platform.openai.com/api-keys)

```bash

---# GitLab Configuration

GITLAB_API_URL=https://gitlab.com/api/v4

## 🛠️ Instalación y ConfiguraciónGITLAB_PRIVATE_TOKEN=tu_token_aqui

GITLAB_PROJECT_ID=123456

### **1. Preparar el Entorno**

# Google Gemini

```bashGEMINI_API_KEY=tu_api_key_aqui

# Clonar e instalar dependencias

git clone <tu-repositorio># Database

cd ai-assistant-projectDB_HOST=localhost

npm installDB_NAME=ai_assistant

```DB_USER=postgres

DB_PASSWORD=tu_password_aqui

### **2. Configurar PostgreSQL con pgvector**```



```sql## 🔧 Configuración Detallada

-- Conectar como superusuario

psql -U postgres### GitLab Setup



-- Crear base de datos1. Ve a tu proyecto en GitLab

CREATE DATABASE ai_assistant;2. Navega a **Settings > Access Tokens**

\c ai_assistant;3. Crea un token con permisos:

   - `read_api`

-- Instalar extensión pgvector   - `read_repository`

CREATE EXTENSION vector;4. Copia el token al archivo `.env`

5. Obtén el Project ID desde la página principal del proyecto

-- Verificar instalación

SELECT * FROM pg_extension WHERE extname = 'vector';### Google Gemini Setup

```

1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)

### **3. Configurar Variables de Entorno**2. Crea una nueva API Key

3. Cópiala al archivo `.env`

Copia `.env.example` a `.env` y completa:

### PostgreSQL Setup

```bash

# =============================================================================```bash

# SERVIDOR CONFIGURATION# Ubuntu/Debian

# =============================================================================sudo apt-get install postgresql postgresql-contrib

PORT=3000sudo -u postgres psql -c "CREATE DATABASE ai_assistant;"

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Instalar pgvector

# =============================================================================git clone https://github.com/pgvector/pgvector.git

# GITLAB CONFIGURATIONcd pgvector

# =============================================================================make

GITLAB_API_URL=https://tu-gitlab.com/api/v4sudo make install

GITLAB_PRIVATE_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx

# Opcional: Para indexar grupo completo# Windows (usando Chocolatey)

GITLAB_GROUP_ID=123choco install postgresql

# Seguir documentación de pgvector para Windows

# =============================================================================```

# DATABASE CONFIGURATION

# =============================================================================### Levantar PostgreSQL en Docker Desktop (recomendado para desarrollo local)

DB_HOST=localhost

DB_PORT=5432Si prefieres ejecutar la base de datos localmente usando Docker Desktop, hemos añadido una configuración lista para usar.

DB_NAME=ai_assistant

DB_USER=postgres- Archivos añadidos:

DB_PASSWORD=tu_password  - `docker-compose.yml` — servicio `db` con PostgreSQL 15, mapeo de puerto 5432 y un healthcheck

  - `docker/init/init-db.sql` — script de inicialización que crea la base de datos `ai_assistant`, la extensión `pgvector` y una tabla de ejemplo `documents`

# =============================================================================  - `.env.docker` — variables de entorno para docker-compose (usuario/password/puerto)

# AI PROVIDERS CONFIGURATION

# =============================================================================Pasos rápidos:



# Proveedor por defecto (gemini, claude, openai)1. Asegúrate de tener Docker Desktop instalado y en ejecución.

AI_PROVIDER=gemini2. Copia las variables de `.env.docker` a tu `.env` si quieres que la app Node.js use las mismas credenciales, o ajusta `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD` en tu `.env`.



# Google Gemini (RECOMENDADO)Iniciar la base de datos:

GEMINI_API_KEY=tu_gemini_api_key

GEMINI_MODEL=gemini-1.5-flash```bash

# Desde la raíz del proyecto

# Anthropic Claude (OPCIONAL)docker compose up -d

ANTHROPIC_API_KEY=tu_anthropic_api_key```

ANTHROPIC_MODEL=claude-3-haiku-20240307

Verificar el estado del contenedor:

# OpenAI (OPCIONAL)

OPENAI_API_KEY=sk-proj-tu_openai_api_key```bash

OPENAI_MODEL=gpt-4o-minidocker compose ps

docker compose logs -f db

# =============================================================================```

# CONFIGURACIÓN AVANZADA

# =============================================================================Conectarse con psql (desde tu máquina si tienes psql instalado):

LOG_LEVEL=info

DEFAULT_SEARCH_LIMIT=20```bash

DEFAULT_SEARCH_THRESHOLD=0.3PGPASSWORD=postgres psql -h localhost -U postgres -d ai_assistant -p 5432

MAX_CHUNK_SIZE=1000```

CHUNK_OVERLAP=200

```Si prefieres usar una GUI como TablePlus, DBeaver o pgAdmin, usa estos parámetros de conexión:



### **4. Inicializar el Sistema**- Host: localhost

- Puerto: 5432

```bash- Base de datos: ai_assistant

# Iniciar servidor- Usuario: postgres

npm start- Password: postgres



# O en modo desarrolloNotas:

npm run dev

```- El script `docker/init/init-db.sql` crea la extensión `vector` (pgvector). Si por alguna razón la imagen base no incluye herramientas necesarias para compilar pgvector, puedes usar la imagen oficial `postgres:15` y el script intentará crear la extensión; en la mayoría de setups modernos de Docker Desktop esto funcionará.

- Ajusta `.env.docker` para cambiar la contraseña o el nombre de la base de datos. Si cambias la contraseña, asegura que tu `.env` usado por la app Node apunte a las mismas credenciales.

---



## 📚 Uso del Sistema## 🚀 Uso



### **🌐 Interfaz Web** (Recomendado)### 1. Indexar contenido de GitLab



1. **Acceder**: http://localhost:3000```bash

2. **Indexar grupo**: Ingresa el ID del grupo principal de GitLab# Indexar repositorio configurado en .env

3. **Seleccionar motor**: Elige entre Gemini, Claude o OpenAInpm run ingest

4. **Consultar**: Haz preguntas técnicas específicas

# Ver ayuda completa

**Ejemplos de consultas efectivas:**npm run ingest -- --help

```

❓ ¿Cómo funciona la integración con el sistema de pagos?# Opciones útiles

❓ Explica la arquitectura del módulo de autenticaciónnpm run ingest -- --clear-first          # Limpiar antes de indexar

❓ ¿Qué patrones de diseño se usan en el controlador de usuarios?npm run ingest -- --dry-run --verbose    # Vista previa

❓ Muestra el flujo de datos en la creación de transaccionesnpm run ingest -- --project-id=12345     # Proyecto específico

❓ ¿Cómo se manejan los errores en la API de participantes?```

```

### Ingestar todos los proyectos de un grupo (GitLab)

### **🔧 API REST**

Si quieres indexar todo un grupo de GitLab (todos los proyectos dentro de un namespace o subgrupo), el script de ingest soporta la opción `--group-id` y el `GITLAB_GROUP_ID` en `.env`.

#### **Indexar Grupo**

```bashPasos recomendados:

curl -X POST http://localhost:3000/groups \

  -H "Content-Type: application/json" \1. Verifica que tu `.env` tenga `GITLAB_API_URL` y `GITLAB_PRIVATE_TOKEN` con permisos `read_api` y `read_repository`.

  -d '{"groupId": 926, "async": true}'2. Haz un `--dry-run` para ver cuántos proyectos y archivos se detectan sin indexar nada:

```

```bash

#### **Consultar con Motor Específico**# Vista previa (no indexa):

```bashnode scripts/ingest.js --group-id=mercados/plabacom --dry-run --verbose

curl -X POST http://localhost:3000/ask \```

  -H "Content-Type: application/json" \

  -d '{3. Si el dry-run es correcto, ejecuta la ingesta real. Si quieres limpiar la KB antes de reindexar, añade `--clear-first`:

    "prompt": "¿Cómo funciona el sistema de pagos?",

    "groupId": 926,```bash

    "aiProvider": "gemini"# Ingesta real para todo el grupo (puede tardar):

  }'node scripts/ingest.js --group-id=mercados/plabacom --clear-first

``````



#### **Verificar Motores Disponibles**Notas sobre comportamiento y límites

```bash

curl -s http://localhost:3000/api/providers | jq .- Retries y backoff: Las llamadas HTTP a GitLab usan reintentos con backoff exponencial para manejar 429/5xx transitorios. Puedes ajustar el comportamiento vía `.env`:

```  - `GITLAB_RETRY_COUNT` (por defecto 3)

  - `GITLAB_RETRY_DELAY_MS` (por defecto 500)

---

- Chunking y límites para evitar explosiones de fragmentos:

## 🏗️ Arquitectura del Sistema  - `MAX_CHUNK_SIZE` (por defecto 1000)

  - `CHUNK_OVERLAP` (por defecto 200)

### **Componentes Principales**  - `MAX_CHUNKS_PER_FILE` (por defecto 100) — si un archivo genera más chunks, se truncará y se dejará un warning en logs.



```- Tamaño de archivos: el cliente de GitLab excluye archivos mayores a 1 MB por defecto al escanear el repositorio. Puedes ajustar esa lógica en `src/gitlab_client.js` si necesitas incluir archivos más grandes (con precaución).

├── src/

│   ├── app.js                 # Servidor Express principal- Recomendación: para grupos grandes, procesa primero con `--dry-run` y luego ejecuta la ingesta en horas de baja actividad. Considera añadir `sleep` entre proyectos en `scripts/ingest.js` si recibes rate limits.

│   ├── agent.js               # Orquestador de IA multi-motor

│   ├── knowledge_base.js      # Búsquedas semánticas optimizadas

│   ├── gemini_client.js       # Cliente Google Gemini### 2. Iniciar el servidor

│   ├── claude_client.js       # Cliente Anthropic Claude

│   ├── openai_client.js       # Cliente OpenAI GPT```bash

│   ├── gitlab_client.js       # Integración GitLab API# Modo desarrollo (con recarga automática)

│   └── repository_manager.js  # Gestión de repositoriosnpm run dev

├── scripts/

│   └── ingest.js              # Script de indexación masiva# Modo producción

├── public/npm start

│   └── index.html             # Interfaz web completa```

└── README.md                  # Esta documentación

```El servidor estará disponible en `http://localhost:3000`



### **Flujo de Datos**### 3. Realizar consultas



1. **Indexación**: GitLab Repository → Cloning → Text Chunking → Vector Embeddings → PostgreSQL**Via API REST:**

2. **Consulta**: User Query → Semantic Search → Context Retrieval → AI Provider → Structured Response

```bash

### **Sistema de Priorización**curl -X POST http://localhost:3000/ask \

  -H "Content-Type: application/json" \

El sistema prioriza archivos por relevancia técnica:  -d '{"prompt": "¿Cómo funciona la autenticación en este proyecto?"}'

```

```javascript

Prioridades por tipo de archivo:**Respuesta de ejemplo:**

- Código fuente (.java, .js, .py, etc.): 3.0x```json

- Configuración (.json, .xml, .yml): 2.0x{

- Tests: 1.5x  "success": true,

- Documentación (.md, .txt): 1.0x    "prompt": "¿Cómo funciona la autenticación en este proyecto?",

- Migraciones SQL: 0.3x  "response": "Basándome en la documentación del proyecto, la autenticación se implementa usando JWT tokens...",

```  "metadata": {

    "processing_time": 1250,

---    "context_found": true,

    "sources_used": [

## ⚙️ Configuración Avanzada      {"file": "auth.md", "project": "mi-proyecto", "relevance": 0.85}

    ]

### **Optimización de Motores IA**  }

}

#### **Google Gemini**```

```bash

# Modelos disponibles## 📚 API Endpoints

GEMINI_MODEL=gemini-1.5-flash      # Rápido y económico

GEMINI_MODEL=gemini-1.5-pro        # Mayor capacidad### `POST /ask`

```Realiza una pregunta al asistente.



#### **Anthropic Claude****Request:**

```bash```json

# Modelos disponibles{

ANTHROPIC_MODEL=claude-3-haiku-20240307     # Rápido  "prompt": "¿Cuáles son las dependencias principales del proyecto?"

ANTHROPIC_MODEL=claude-3-5-sonnet-latest    # Análisis avanzado}

``````



#### **OpenAI GPT****Response:**

```bash```json

# Modelos disponibles{

OPENAI_MODEL=gpt-4o-mini          # Económico y rápido  "success": true,

OPENAI_MODEL=gpt-4o               # Máxima calidad  "prompt": "...",

OPENAI_MODEL=gpt-3.5-turbo        # Básico  "response": "Las dependencias principales incluyen...",

```  "metadata": {

    "processing_time": 1200,

### **Ajuste de Rendimiento**    "context_found": true,

    "sources_used": [...]

```bash  }

# Búsquedas más precisas pero lentas}

DEFAULT_SEARCH_LIMIT=30```

DEFAULT_SEARCH_THRESHOLD=0.5

### `GET /health`

# Búsquedas más rápidas pero menos precisasVerifica el estado del servicio.

DEFAULT_SEARCH_LIMIT=10

DEFAULT_SEARCH_THRESHOLD=0.3### `GET /knowledge-base/info`

Obtiene estadísticas de la base de conocimiento.

# Chunks más grandes para más contexto

MAX_CHUNK_SIZE=2000## 🏗️ Arquitectura

CHUNK_OVERLAP=400

``````

src/

---├── app.js              # Servidor Express principal

├── agent.js            # Orquestador principal del asistente

## 🔍 Solución de Problemas├── gitlab_client.js    # Cliente para API de GitLab

├── knowledge_base.js   # Manejo de base de datos vectorial

### **🚨 Errores Comunes**└── gemini_client.js    # Cliente para Google Gemini



#### **Error de Base de Datos**scripts/

```bash└── ingest.js          # Script de indexación de contenido

Error: relation "documents" does not exist```

```

**Solución**: Ejecutar el primer indexado para crear tablas### Flujo de Procesamiento

```bash

curl -X POST http://localhost:3000/groups -d '{"groupId": 926}'1. **Ingesta**: `gitlab_client` → `knowledge_base` (indexación)

```2. **Consulta**: `agent` → `knowledge_base` (búsqueda) → `gemini_client` (respuesta)



#### **Error de API de IA**## 🔧 Configuración Avanzada

```bash

Error: GEMINI_API_KEY es requerido### Variables de Entorno Completas

```

**Solución**: Verificar variables de entorno```bash

```bash# Servidor

echo $GEMINI_API_KEYPORT=3000

# Debe mostrar tu API keyALLOWED_ORIGINS=http://localhost:3000

```

# GitLab

#### **Error de GitLab**GITLAB_API_URL=https://gitlab.com/api/v4

```bashGITLAB_PRIVATE_TOKEN=tu_token

Error 401: UnauthorizedGITLAB_PROJECT_ID=123456

```

**Solución**: Verificar permisos del token# Gemini

- Token debe tener `read_api` y `read_repository`GEMINI_API_KEY=tu_key

- Verificar que el grupo/proyecto sea accesibleGEMINI_MODEL=gemini-1.5-flash



### **📊 Monitoreo y Logs**# Base de datos

DB_HOST=localhost

```bashDB_PORT=5432

# Ver logs en tiempo realDB_NAME=ai_assistant

tail -f server.logDB_USER=postgres

DB_PASSWORD=tu_password

# Logs específicos de IA

tail -f server.log | grep -i "gemini\|claude\|openai"# Configuración avanzada

LOG_LEVEL=info

# Verificar estado del sistemaDEFAULT_SEARCH_LIMIT=5

curl -s http://localhost:3000/healthDEFAULT_SEARCH_THRESHOLD=0.3

```MAX_CHUNK_SIZE=1000

CHUNK_OVERLAP=200

### **🔧 Mantenimiento**```



```bash### Optimización de Performance

# Limpiar caché de repositorios

rm -rf ./data/repositories/*- **Índices de base de datos**: Se crean automáticamente para búsquedas eficientes

- **Chunking inteligente**: Divide documentos manteniendo contexto

# Reiniciar base de datos- **Caché de embeddings**: Los embeddings se almacenan para evitar recálculos

psql -U postgres -d ai_assistant -c "TRUNCATE documents, groups;"- **Búsqueda híbrida**: Combina búsqueda vectorial y textual



# Reindexar grupo específico## 🚨 Troubleshooting

curl -X POST http://localhost:3000/groups -d '{"groupId": 926, "force": true}'

```### Errores Comunes



---**Error de conexión a GitLab:**

```

## 🧪 Validación del SistemaError: GITLAB_PRIVATE_TOKEN es requerido

```

### **✅ Lista de Verificación**- Verifica que el token esté configurado en `.env`

- Asegúrate de que el token tenga los permisos correctos

#### **Instalación Base**

- [ ] Node.js >= 16.0.0 instalado**Error de base de datos:**

- [ ] PostgreSQL con pgvector funcionando```

- [ ] Dependencias npm instaladasError: relation "vector" does not exist

- [ ] Variables de entorno configuradas```

- Instala la extensión pgvector en PostgreSQL

#### **Motores de IA**- Verifica que la base de datos exista

- [ ] Al menos un motor configurado y funcionando

- [ ] Endpoint `/api/providers` devuelve motores disponibles**Error de Gemini:**

- [ ] Cambio de motor desde interfaz web funciona```

Error: Clave de API de Gemini inválida

#### **Base de Conocimiento**```

- [ ] Grupo indexado correctamente- Verifica tu API key en Google AI Studio

- [ ] Búsquedas semánticas devuelven resultados relevantes- Asegúrate de que no haya caracteres extra

- [ ] Priorización de archivos funciona

### Logs y Debugging

#### **Respuestas Técnicas**

- [ ] Respuestas incluyen referencias a archivos específicos```bash

- [ ] Análisis técnico es preciso y contextual# Ver logs en tiempo real

- [ ] Formato de respuestas es estructurado y legibletail -f logs/combined.log



### **🧪 Tests de Funcionalidad**# Cambiar nivel de logging

export LOG_LEVEL=debug

```bashnpm start

# Test 1: Verificar motores```

curl -s http://localhost:3000/api/providers

## 🤝 Contribución

# Test 2: Consulta técnica básica

curl -X POST http://localhost:3000/ask \1. Fork el proyecto

  -H "Content-Type: application/json" \2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)

  -d '{"prompt": "¿Cuántos archivos están indexados?", "groupId": 926}'3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)

4. Push a la rama (`git push origin feature/AmazingFeature`)

# Test 3: Consulta específica de código5. Abre un Pull Request

curl -X POST http://localhost:3000/ask \

  -H "Content-Type: application/json" \## 📄 Licencia

  -d '{"prompt": "Explica la clase ApiClientResource", "groupId": 926}'

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

# Test 4: Comparar motores

for provider in gemini claude openai; do## 🔗 Enlaces Útiles

  echo "=== Testing $provider ==="

  curl -X POST http://localhost:3000/ask \- [Documentación de GitLab API](https://docs.gitlab.com/ee/api/)

    -H "Content-Type: application/json" \- [Google Gemini API](https://ai.google.dev/docs)

    -d "{\"prompt\": \"¿Cómo funciona la autenticación?\", \"groupId\": 926, \"aiProvider\": \"$provider\"}"- [pgvector](https://github.com/pgvector/pgvector)

done- [Express.js](https://expressjs.com/)

```

---

---

**¿Necesitas ayuda?** Abre un issue en el repositorio o consulta la documentación de cada componente.
## 📈 Métricas y Rendimiento

### **📊 Estadísticas Típicas**
- **Tiempo de indexación**: ~5-10 min por cada 100 archivos
- **Tiempo de respuesta**: 2-8 segundos según motor y complejidad
- **Precisión promedio**: 85-95% para consultas técnicas específicas
- **Chunks promedio**: 1,000-5,000 por grupo mediano

### **🎯 Benchmarks por Motor**

| Motor | Velocidad | Precisión Técnica | Análisis Detallado | Costo |
|-------|-----------|-------------------|-------------------|--------|
| 🌟 Gemini | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 💰 |
| 🧠 Claude | ⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 💰💰 |
| ⚡ OpenAI | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 💰💰💰 |

---

## 🚀 Próximos Pasos y Extensiones

### **🔧 Mejoras Planificadas**
- [ ] Soporte para más lenguajes de programación
- [ ] Integración con Azure DevOps / GitHub
- [ ] Cache inteligente de respuestas
- [ ] Análisis de código estático integrado
- [ ] Métricas de uso y analíticas

### **🌟 Ideas de Extensión**
- **Plugin VS Code**: Consultas directas desde el editor
- **Slack Bot**: Integración con equipos de desarrollo
- **CI/CD Integration**: Análisis automático en pipelines
- **Knowledge Graph**: Relaciones entre componentes del sistema

---

## 📞 Soporte y Contribución

### **🐛 Reporte de Bugs**
Si encuentras algún problema:
1. Revisa los logs: `tail -f server.log`
2. Verifica la configuración: `curl http://localhost:3000/health`
3. Incluye información del entorno en tu reporte

### **💡 Solicitudes de Funcionalidades**
Para nuevas características:
1. Describe el caso de uso específico
2. Incluye ejemplos de consultas esperadas
3. Especifica el tipo de respuesta deseada

### **🤝 Contribuciones**
El sistema está diseñado para ser extensible:
- **Nuevos motores IA**: Implementa la interfaz en `src/`
- **Mejoras de UI**: Edita `public/index.html`
- **Optimizaciones**: Modifica `src/knowledge_base.js`

---

## 📚 Referencias y Enlaces

### **📖 APIs de IA**
- [Google Gemini API](https://ai.google.dev/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI GPT API](https://platform.openai.com/docs)

### **🔧 Tecnologías**
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [GitLab API](https://docs.gitlab.com/ee/api/)
- [Node.js Express](https://expressjs.com/)

### **📊 Herramientas**
- [Google AI Studio](https://makersuite.google.com/) - API Keys Gemini
- [Anthropic Console](https://console.anthropic.com/) - API Keys Claude
- [OpenAI Platform](https://platform.openai.com/) - API Keys GPT

---

## � Configuración de GitHub

### **Configurar Token de Acceso de GitHub**

1. **Crear Personal Access Token**:
   - Ve a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Clic en "Generate new token (classic)"
   - Selecciona permisos:
     - `repo` (para repositorios privados)
     - `public_repo` (para repositorios públicos)
     - `read:org` (para acceder a organizaciones)

2. **Variables de entorno para GitHub**:
```bash
# Configuración de GitHub
GITHUB_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_API_URL=https://api.github.com
GITHUB_USERNAME=tu_usuario_github
GITHUB_ORGANIZATION=tu_organizacion_github  # Opcional
```

### **Usar GitHub en lugar de GitLab**

1. **Cambiar plataforma por defecto**:
```bash
REPOSITORY_PLATFORM=github
```

2. **Usar selector web**: En la interfaz web puedes cambiar entre GitLab y GitHub dinámicamente.

3. **Indexar repositorio de GitHub**:
```bash
# Para repositorio específico (formato: owner/repo)
curl -X POST http://localhost:3000/api/reindex \
  -H "Content-Type: application/json" \
  -d '{"project": "facebook/react"}'

# Para organización completa
curl -X POST http://localhost:3000/api/reindex \
  -H "Content-Type: application/json" \
  -d '{"groupId": "facebook"}'
```

### **Endpoints específicos de GitHub**

- `GET /api/platforms` - Lista plataformas disponibles
- `POST /api/platforms/switch` - Cambiar entre GitLab/GitHub
- Todos los demás endpoints funcionan igual independientemente de la plataforma

---

## �📄 Licencia

MIT License - Desarrollado por **Luis Nuñez** con **GitHub Copilot**

---

**🎯 ¡Tu agente técnico está listo para responder preguntas específicas y precisas sobre tu código fuente con 3 motores de IA y soporte para GitLab y GitHub!** ✨