# Memgraph Vector Search Refactor

## Current State (Problematic)

### Issues Identified

1. **Wrong Docker image**: Using `memgraph/memgraph:2.11.0` (base) instead of `memgraph/memgraph-mage:2.11.0` (includes algorithms)

2. **No vector index**: Embeddings are stored on `:MemoryNode` nodes but no vector index is created

3. **Manual similarity in JavaScript**: The `queryMemories()` function:
   - Fetches ALL matching nodes from Memgraph (line 428-437)
   - Transfers 768 floats per record over the network
   - Calculates cosine similarity in Node.js (lines 458-465)
   - Sorts in JavaScript
   - This is O(n) for every query

4. **Version constraints**:
   - Memgraph 2.14+ has native `CREATE VECTOR INDEX` and `vector_search.search()`
   - But 2.14+ crashes with GPF on GCP
   - Stuck on 2.11.0

### Current Code Flow (Bad)

```
User query "find memories about X"
           │
           ▼
┌─────────────────────────────────────┐
│ Embed query text (Gemini API)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ MATCH (m:MemoryNode)                │
│ WHERE m.workspaceId = $workspaceId  │
│ RETURN m                            │  ◄── Returns ALL nodes with embeddings
│ LIMIT 100                           │
└──────────────┬──────────────────────┘
               │
               ▼
    Transfer 100 × 768 floats = 76,800 numbers over network
               │
               ▼
┌─────────────────────────────────────┐
│ JavaScript: for each record         │
│   calculate cosineSimilarity()      │  ◄── O(n) in Node.js
│ sort by score                       │
│ return top 10                       │
└─────────────────────────────────────┘
```

## Fix Options

### Option 1: Switch to memgraph-mage:2.11.0 (Quick Win)

**Change in Terraform:**
```hcl
docker pull memgraph/memgraph-mage:2.11.0
docker run -d \
  --name memgraph \
  memgraph/memgraph-mage:2.11.0 \
  ...
```

**Then use MAGE algorithms:**
```cypher
-- KNN search (if available in 2.11.0)
CALL knn.get({nodeProperties: "embedding", topK: 10})
YIELD node, neighbour, similarity

-- Or node_similarity.cosine()
CALL node_similarity.cosine("embedding")
YIELD node1, node2, similarity
```

**Pros:**
- Minimal code changes
- Uses database-side computation
- No new infrastructure

**Cons:**
- Still no HNSW/ANN index (still O(n))
- Need to verify MAGE 2.11.0 has the needed algorithms

### Option 2: Add pgvector to Postgres (Recommended)

**Database migration:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- New table or add column
ALTER TABLE agent_memories
ADD COLUMN embedding vector(768);

-- Create HNSW index for fast ANN
CREATE INDEX agent_memories_embedding_idx
ON agent_memories
USING hnsw (embedding vector_cosine_ops);
```

**Query pattern:**
```typescript
const results = await db.query(`
  SELECT id, summary, content,
         1 - (embedding <=> $1::vector) as similarity
  FROM agent_memories
  WHERE workspace_id = $2
    AND ($3::uuid IS NULL OR space_id = $3)
  ORDER BY embedding <=> $1::vector
  LIMIT $4
`, [queryEmbedding, workspaceId, spaceId, limit]);
```

**Pros:**
- Proper HNSW index (O(log n) queries)
- Proven technology
- Already using Postgres
- Cloud SQL supports pgvector

**Cons:**
- Need to migrate existing embeddings from Memgraph
- Dual storage (metadata in Memgraph for graph, vectors in Postgres)

### Option 3: Hybrid Approach

Keep Memgraph for graph traversals (entity relationships, memory graph), use Postgres+pgvector for vector similarity search.

```
                    ┌─────────────────┐
User query ────────►│ pgvector search │───► Top 10 memory IDs
                    │ (Postgres)      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Fetch content   │───► Full memory records
                    │ (Postgres)      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Get graph data  │───► Entity relationships
                    │ (Memgraph)      │
                    └─────────────────┘
```

### Option 4: Investigate 2.14+ Crash

The GPF crash might be fixable with:
- Different CPU platform (not Skylake)
- Different GCP region
- Different machine type
- Container runtime flags

But this is higher risk and effort.

## Recommended Path

1. **Immediate (Option 1)**: Switch to `memgraph-mage:2.11.0` to get MAGE algorithms
2. **Short-term**: At minimum, move similarity calculation into Memgraph using MAGE
3. **Medium-term (Option 2/3)**: Add pgvector for proper ANN search
4. **Long-term**: Unified approach with pgvector for all embedding workloads

## Files to Modify

1. `infra/modules/memgraph/main.tf` - Change Docker image
2. `apps/server/src/core/agent-memory/agent-memory.service.ts` - Refactor queryMemories()
3. Database migration for pgvector if going that route

## Performance Impact

| Approach | Query Time | Network Transfer |
|----------|------------|------------------|
| Current (JS cosine) | O(n) + network | 768 × n floats |
| MAGE in Memgraph | O(n) in DB | Just top K results |
| pgvector with HNSW | O(log n) | Just top K results |

## Next Steps

1. [ ] Test memgraph-mage:2.11.0 locally to verify it works
2. [ ] Check what MAGE algorithms are available in 2.11.0
3. [ ] Update Terraform to use memgraph-mage
4. [ ] Refactor agent-memory.service.ts to use MAGE functions
5. [ ] Evaluate if pgvector is needed for scale
