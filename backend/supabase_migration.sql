-- =====================================================================
-- Supabase PGVector Migration Script for RAG Chatbot
-- =====================================================================

-- 1. Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 2. Create a table to store document chunks and their embeddings
create table if not exists documents (
  id bigserial primary key,
  content text not null,                -- The text chunk content
  metadata jsonb,                       -- File metadata (citation source, page number, etc.)
  embedding vector(384)                 -- Embedding vector representation (384 is standard for Xenova/all-MiniLM-L6-v2)
);

-- 3. Create a function to perform cosine similarity searches
create or replace function match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 4. Create an HNSW index for fast similarity search queries on vector embeddings
-- Note: This speeds up similarity searches significantly as the dataset grows.
create index if not exists documents_embedding_hnsw_idx 
on documents 
using hnsw (embedding vector_cosine_ops);
