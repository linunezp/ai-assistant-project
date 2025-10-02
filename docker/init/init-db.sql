-- init-db.sql
-- Este script se ejecuta al inicializar el contenedor PostgreSQL
-- Crea la base de datos, el usuario y la extensión pgvector
-- init-db.sql
-- Este script se ejecuta al inicializar el contenedor PostgreSQL
-- NOTA: la imagen oficial de Postgres creará la base indicada en POSTGRES_DB
-- por lo que aquí únicamente nos encargamos de crear la extensión pgvector
-- y tablas necesarias de forma idempotente.

-- Conectarse a la base creada por POSTGRES_DB (ajustada en .env.docker)
\connect ai_assistant;

-- Crear extensión pgvector (if supported)
DO $$
BEGIN
   -- La creación de extensiones debe hacerse en la base de datos destino
   -- Usamos CREATE EXTENSION IF NOT EXISTS para evitar errores si ya existe
   IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
      PERFORM pg_catalog.set_config('search_path', 'public', false);
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
   END IF;
END$$;

-- Tabla de ejemplo para almacenar documentos y embeddings
CREATE TABLE IF NOT EXISTS documents (
   id serial PRIMARY KEY,
   content text NOT NULL,
   embedding vector(1536)
);
