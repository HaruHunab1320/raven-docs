# Knowledge System Design

## Overview

A general-purpose knowledge system that allows users to upload documents/URLs as knowledge sources, automatically chunks and vectorizes them, and makes them available to the agent for RAG (Retrieval-Augmented Generation).

## Scopes

```
System (Raven Docs help) ──► applies to all workspaces
    │
Workspace Knowledge ──► company-wide docs, policies
    │
Space Knowledge ──► team/project specific docs
```

- **System-wide**: Raven Docs application documentation (default, always available)
- **Workspace-wide**: Company knowledge, policies, shared docs
- **Space-specific**: Team/project specific documentation

## Data Model

### knowledge_sources table (Postgres)

```sql
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('url', 'file', 'page')),

  -- Source reference (one of these)
  source_url TEXT,           -- For URL type
  file_id UUID,              -- For file type (reference to uploads)
  page_id UUID,              -- For page type (internal raven docs page)

  -- Scoping
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('system', 'workspace', 'space')),
  workspace_id UUID,         -- NULL for system scope
  space_id UUID,             -- NULL for system/workspace scope

  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_schedule VARCHAR(50), -- Cron expression for URL refresh

  -- Metadata
  created_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_space FOREIGN KEY (space_id) REFERENCES spaces(id)
);
```

### knowledge_chunks table (Postgres with pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  embedding vector(768),     -- Gemini text-embedding-004 dimension

  -- Chunk metadata
  chunk_index INTEGER NOT NULL,
  metadata JSONB,            -- heading hierarchy, page number, section, etc.

  -- Denormalized for query efficiency
  scope VARCHAR(20) NOT NULL,
  workspace_id UUID,
  space_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast ANN search
CREATE INDEX knowledge_chunks_embedding_idx
ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops);

-- Filter indexes
CREATE INDEX knowledge_chunks_scope_idx ON knowledge_chunks(scope, workspace_id, space_id);
CREATE INDEX knowledge_chunks_source_idx ON knowledge_chunks(source_id);
```

## Processing Pipeline

```
User adds URL/File/Page
         │
         ▼
┌─────────────────────┐
│  Queue Job Created  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Fetch Content     │  ◄── URL: web scrape
│                     │      File: parse PDF/DOCX/MD/TXT
│                     │      Page: extract page content
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Smart Chunking    │  ◄── Split by headers, semantic boundaries
│                     │      Preserve hierarchy metadata
│                     │      ~500-1000 tokens per chunk
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Generate Embeds   │  ◄── Gemini text-embedding-004
│                     │      Batch processing
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Store in Postgres │  ◄── Insert chunks with embeddings
│                     │      Update source status to 'ready'
└─────────────────────┘
```

## Agent Retrieval

```typescript
async function getRelevantKnowledge(
  query: string,
  context: { workspaceId: string; spaceId?: string },
  limit: number = 5
): Promise<KnowledgeChunk[]> {
  const embedding = await embedText(query);

  // Query with scope hierarchy using pgvector
  const results = await db.query(`
    SELECT
      kc.content,
      kc.metadata,
      ks.name as source_name,
      1 - (kc.embedding <=> $1::vector) as similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON kc.source_id = ks.id
    WHERE (
      kc.scope = 'system'
      OR (kc.scope = 'workspace' AND kc.workspace_id = $2)
      OR (kc.scope = 'space' AND kc.space_id = $3)
    )
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $4
  `, [embedding, context.workspaceId, context.spaceId, limit]);

  return results.rows;
}
```

## Configuration

### Workspace Settings

```typescript
interface WorkspaceKnowledgeSettings {
  systemKnowledgeEnabled: boolean;    // Enable Raven Docs help (default: true)
  allowSpaceKnowledge: boolean;       // Let spaces add their own (default: true)
  allowedFileTypes: string[];         // ['pdf', 'md', 'docx', 'txt']
  maxSourcesPerSpace: number;         // Limit per space (default: 20)
  maxFileSizeMB: number;              // Max file size (default: 10)
}
```

### Space Settings

```typescript
interface SpaceKnowledgeSettings {
  inheritWorkspaceKnowledge: boolean; // Default: true
  sources: string[];                  // Source IDs enabled for this space
}
```

## UI Components

### Workspace Settings > Knowledge

- Toggle system knowledge (Raven Docs help)
- Add workspace-wide knowledge sources
- Configure defaults for spaces
- View processing status

### Space Settings > Knowledge

- Add space-specific sources
- See inherited sources (read-only)
- Toggle individual sources on/off

### Knowledge Source Form

- Name
- Type: URL / File Upload / Internal Page
- URL input (with validation)
- File upload (drag & drop)
- Page selector (search internal pages)
- Sync schedule (for URLs): Manual / Daily / Weekly

## URL Refresh Strategy

For URL-type sources:
- Manual refresh button
- Optional scheduled refresh (cron)
- Track `last_synced_at`
- Diff detection to avoid re-processing unchanged content

## Chunking Strategy

Smart chunking based on content structure:
1. Split by headers (H1, H2, H3, etc.)
2. Keep header hierarchy in metadata
3. If section too long, split by paragraphs
4. Target chunk size: 500-1000 tokens
5. Overlap: 50-100 tokens between chunks

## Error Handling

- Source status: `error` with `error_message`
- Retry logic with exponential backoff
- Notification to source creator on failure
- Admin view of failed sources

## Future Considerations

- [ ] Chunk versioning for incremental updates
- [ ] Citation/source linking in agent responses
- [ ] Knowledge source permissions (who can add/edit)
- [ ] Analytics on knowledge usage
- [ ] Multi-language support
- [ ] Image/table extraction from PDFs

---

## Related: Memgraph Vector Search Improvements

The current agent memory implementation does NOT use Memgraph's vector capabilities correctly. See separate document for refactoring plan.

Current issues:
- Fetches all nodes to JavaScript
- Calculates cosine similarity in Node.js
- No vector indexes

Memgraph supports:
- `CREATE VECTOR INDEX` with HNSW-like ANN search
- `vector_search.search()` for indexed queries
- `vector_search.cosine_similarity()` for direct calculation
- `knn.get()` for k-nearest neighbors

This needs to be fixed before adding the knowledge system.
