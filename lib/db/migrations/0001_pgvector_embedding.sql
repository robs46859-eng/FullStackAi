-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint
-- Add embedding column to semantic_cache for Gemini text-embedding-004 (768 dims)
ALTER TABLE semantic_cache ADD COLUMN IF NOT EXISTS embedding vector(768);

--> statement-breakpoint
-- Create ivfflat index for approximate nearest-neighbour cosine search
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_ivfflat_idx
  ON semantic_cache USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
