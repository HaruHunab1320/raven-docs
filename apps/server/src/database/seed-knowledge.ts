/**
 * Production knowledge seeder
 *
 * Seeds the knowledge base with documentation from apps/docs.
 * Reads markdown files, chunks them, generates embeddings via Gemini,
 * and stores them in the knowledge_sources and knowledge_chunks tables.
 *
 * Usage: node dist/database/seed-knowledge.js [--workspace-id <id>]
 */
import * as path from 'path';
import * as fs from 'fs';
import { Pool } from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

interface ContentChunk {
  text: string;
  metadata: {
    headings?: string[];
    source?: string;
  };
}

function getDbConfig(): any {
  const connectionString = process.env.DATABASE_URL;
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;

  if (connectionString) {
    return { connectionString };
  } else if (dbHost && dbName && dbUser && dbPassword) {
    return {
      host: dbHost,
      port: parseInt(dbPort, 10),
      database: dbName,
      user: dbUser,
      password: dbPassword,
    };
  }

  throw new Error('Either DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD must be set');
}

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required');
  }
  return key;
}

function chunkContent(content: string, sourceName: string): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const maxChunkSize = 1000;
  const minChunkSize = 100;

  // Split by headers first
  const sections = content.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
    const heading = headingMatch ? headingMatch[2].trim() : undefined;

    const sectionContent = headingMatch
      ? section.slice(headingMatch[0].length).trim()
      : section.trim();

    if (!sectionContent && !heading) continue;

    if (sectionContent.length <= maxChunkSize) {
      const chunkText = heading ? `${heading}\n\n${sectionContent}` : sectionContent;
      if (chunkText.length >= minChunkSize) {
        chunks.push({
          text: chunkText,
          metadata: { headings: heading ? [heading] : [], source: sourceName },
        });
      }
      continue;
    }

    // Split large sections by paragraphs
    const paragraphs = sectionContent.split(/\n\n+/);
    let currentChunk = heading ? `${heading}\n\n` : '';

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      if ((currentChunk + trimmedPara).length > maxChunkSize && currentChunk.length >= minChunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: { headings: heading ? [heading] : [], source: sourceName },
        });
        currentChunk = heading ? `${heading} (continued)\n\n${trimmedPara}` : trimmedPara;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
      }
    }

    if (currentChunk.trim().length >= minChunkSize) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: { headings: heading ? [heading] : [], source: sourceName },
      });
    }
  }

  return chunks;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Embedding API error: ${(json as any)?.error?.message || response.status}`);
  }

  return (json as any)?.embedding?.values || [];
}

function getMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getMarkdownFiles(fullPath, files);
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function seedKnowledge() {
  console.log('Starting knowledge base seeding...');
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);

  const apiKey = getGeminiApiKey();
  const poolConfig = getDbConfig();

  const db = new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool(poolConfig),
    }),
  });

  try {
    // Get workspace and user IDs
    const workspaceIdArg = getArgValue('--workspace-id');

    const workspaceResult = workspaceIdArg
      ? await sql<{ id: string }>`SELECT id FROM workspaces WHERE id = ${workspaceIdArg}::uuid`.execute(db)
      : await sql<{ id: string }>`SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`.execute(db);

    const userResult = await sql<{ id: string }>`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`.execute(db);

    const workspaceId = workspaceResult.rows[0]?.id;
    const creatorId = userResult.rows[0]?.id;

    if (!workspaceId || !creatorId) {
      console.error('Error: No workspace or user found. Please create a workspace first.');
      process.exit(1);
    }

    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`Creator ID: ${creatorId}`);

    // Try multiple possible docs paths (container vs local)
    const possiblePaths = [
      path.join(process.cwd(), 'docs'),                     // Container: /app/docs (WORKDIR=/app)
      '/app/docs',                                           // Container: absolute path
      path.join(process.cwd(), 'apps/docs/docs'),           // Local dev from repo root
      path.join(__dirname, '../../../../apps/docs/docs'),   // Relative from dist/database
    ];

    let docsPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        docsPath = p;
        break;
      }
    }

    if (!docsPath) {
      console.error('Error: Docs directory not found. Tried:', possiblePaths);
      console.log('Note: For production, mount the docs at /app/docs or include them in the container.');
      process.exit(1);
    }

    console.log(`Docs path: ${docsPath}`);

    const files = getMarkdownFiles(docsPath);
    console.log(`Found ${files.length} documentation files`);

    if (files.length === 0) {
      console.log('No documentation files found. Exiting.');
      await db.destroy();
      process.exit(0);
    }

    let totalChunks = 0;
    let sourcesCreated = 0;
    let sourcesUpdated = 0;

    for (const filePath of files) {
      const relativePath = path.relative(docsPath, filePath);
      const sourceName = `Docs: ${relativePath}`;

      console.log(`\nProcessing: ${relativePath}`);

      const content = fs.readFileSync(filePath, 'utf-8');

      if (!content.trim()) {
        console.log('  Skipping empty file');
        continue;
      }

      // Check if source already exists
      const existing = await sql<{ id: string }>`
        SELECT id FROM knowledge_sources WHERE name = ${sourceName} AND workspace_id = ${workspaceId}::uuid
      `.execute(db);

      let sourceId: string;
      if (existing.rows.length > 0) {
        sourceId = existing.rows[0].id;
        console.log('  Source exists, updating...');
        await sql`DELETE FROM knowledge_chunks WHERE source_id = ${sourceId}::uuid`.execute(db);
        sourcesUpdated++;
      } else {
        const sourceResult = await sql<{ id: string }>`
          INSERT INTO knowledge_sources (name, type, scope, workspace_id, status, created_by_id)
          VALUES (${sourceName}, 'markdown', 'workspace', ${workspaceId}::uuid, 'processing', ${creatorId}::uuid)
          RETURNING id
        `.execute(db);
        sourceId = sourceResult.rows[0].id;
        sourcesCreated++;
      }

      const chunks = chunkContent(content, sourceName);
      console.log(`  Created ${chunks.length} chunks`);

      // Process chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          const embedding = await getEmbedding(chunk.text, apiKey);
          const embeddingStr = `[${embedding.join(',')}]`;
          const tokenCount = Math.ceil(chunk.text.length / 4);

          await sql`
            INSERT INTO knowledge_chunks (source_id, content, embedding, chunk_index, metadata, token_count, scope, workspace_id)
            VALUES (
              ${sourceId}::uuid,
              ${chunk.text},
              ${embeddingStr}::vector,
              ${i},
              ${JSON.stringify(chunk.metadata)}::jsonb,
              ${tokenCount},
              'workspace',
              ${workspaceId}::uuid
            )
          `.execute(db);

          totalChunks++;
          process.stdout.write(`\r  Embedded chunk ${i + 1}/${chunks.length}`);

          // Rate limit delay
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`\n  Error embedding chunk ${i}: ${error.message}`);
        }
      }

      // Update source status
      await sql`
        UPDATE knowledge_sources
        SET status = 'ready', chunk_count = ${chunks.length}, last_synced_at = now(), updated_at = now()
        WHERE id = ${sourceId}::uuid
      `.execute(db);

      console.log(''); // New line after progress
    }

    console.log(`\n========================================`);
    console.log(`Seeding complete!`);
    console.log(`  Sources created: ${sourcesCreated}`);
    console.log(`  Sources updated: ${sourcesUpdated}`);
    console.log(`  Total chunks embedded: ${totalChunks}`);
    console.log(`========================================`);

    await db.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('Seeding failed:', error);
    await db.destroy();
    process.exit(1);
  }
}

seedKnowledge();
