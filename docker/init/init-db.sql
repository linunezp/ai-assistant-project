-- init-db.sql
-- AI Assistant Project - Database Initialization Script
-- Este script inicializa la base de datos con todas las tablas, índices y extensiones necesarias
-- para el sistema de base de conocimiento con soporte para múltiples grupos de GitLab
-- Versión: 2.0 - Sistema dinámico multi-organización
-- Fecha: 2 de octubre de 2025

-- Conectarse a la base creada por POSTGRES_DB (ajustada en .env.docker)
\connect ai_assistant;

-- =============================================================================
-- EXTENSIONES
-- =============================================================================

-- Crear extensión pgvector para soporte de embeddings vectoriales
CREATE EXTENSION IF NOT EXISTS vector;

-- Verificar que la extensión se instaló correctamente
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
      RAISE EXCEPTION 'Error: No se pudo instalar la extensión pgvector';
   END IF;
   RAISE NOTICE 'Extensión pgvector instalada correctamente';
END$$;

-- =============================================================================
-- TABLAS PRINCIPALES
-- =============================================================================

-- Tabla para grupos de GitLab registrados
CREATE TABLE IF NOT EXISTS gitlab_groups (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL UNIQUE,
  group_name TEXT,
  group_path TEXT,
  group_full_path TEXT,
  description TEXT,
  web_url TEXT,
  visibility TEXT,
  indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  projects_count INTEGER DEFAULT 0,
  files_count INTEGER DEFAULT 0,
  chunks_count INTEGER DEFAULT 0
);

-- Tabla para proyectos detectados en los grupos
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50) NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  project_path VARCHAR(255),
  web_url TEXT,
  description TEXT,
  default_branch VARCHAR(100),
  visibility VARCHAR(50),
  detected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  files_count INTEGER DEFAULT 0,
  indexed_files_count INTEGER DEFAULT 0,
  UNIQUE(group_id, project_id)
);

-- Tabla principal para documentos indexados
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  project_name TEXT,
  group_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_path)
);

-- Tabla para chunks (fragmentos) de documentos con embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

-- =============================================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =============================================================================

-- Índices para tabla documents
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
CREATE INDEX IF NOT EXISTS idx_documents_project_name ON documents(project_name);
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_name_pattern ON documents USING btree (file_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_documents_group_file_pattern ON documents USING btree (group_id, file_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING gin (metadata);

-- Índices para tabla document_chunks
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_embedding ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON document_chunks USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_text_search ON document_chunks USING gin (to_tsvector('english', chunk_text));

-- Índices vectoriales para búsqueda de similaridad (IVFFlat)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_optimized ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Índices para tabla gitlab_groups
CREATE INDEX IF NOT EXISTS idx_gitlab_groups_group_id ON gitlab_groups(group_id);

-- Índices para tabla projects
CREATE INDEX IF NOT EXISTS idx_projects_group_id ON projects(group_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);

-- =============================================================================
-- TRIGGERS Y FUNCIONES
-- =============================================================================

-- Función para actualizar timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para tabla documents
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- CONFIGURACIÓN Y OPTIMIZACIONES
-- =============================================================================

-- Configurar parámetros para optimización de pgvector
-- (Estos valores se pueden ajustar según el hardware disponible)
DO $$
BEGIN
    -- Configurar memoria compartida para pgvector
    PERFORM set_config('shared_preload_libraries', 'vector', false);
    
    -- Configurar parámetros de memoria para búsquedas vectoriales
    PERFORM set_config('work_mem', '256MB', false);
    PERFORM set_config('maintenance_work_mem', '1GB', false);
    
    RAISE NOTICE 'Configuración de pgvector aplicada';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Advertencia: No se pudieron aplicar algunas configuraciones de pgvector';
END$$;

-- =============================================================================
-- VERIFICACIÓN Y ESTADÍSTICAS
-- =============================================================================

-- Mostrar estadísticas de inicialización
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    extension_count INTEGER;
BEGIN
    -- Contar tablas creadas
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('documents', 'document_chunks', 'gitlab_groups', 'projects');
    
    -- Contar índices creados
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    -- Contar extensiones
    SELECT COUNT(*) INTO extension_count 
    FROM pg_extension 
    WHERE extname = 'vector';
    
    RAISE NOTICE '=== AI ASSISTANT DATABASE INICIALIZADA CORRECTAMENTE ===';
    RAISE NOTICE 'Tablas creadas: %', table_count;
    RAISE NOTICE 'Índices creados: %', index_count;
    RAISE NOTICE 'Extensiones instaladas: %', extension_count;
    RAISE NOTICE 'Sistema listo para detectar organizaciones dinámicamente';
    RAISE NOTICE '========================================================';
END$$;
