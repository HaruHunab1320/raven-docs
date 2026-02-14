#!/usr/bin/env node

/**
 * Seed knowledge base with documentation from apps/docs
 * Usage: node scripts/seed-knowledge.js [--workspace-id <id>]
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://raven-docs_user:raven-docs_secure_password@localhost:5432/raven-docs';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const DOCS_PATH = path.join(__dirname, '../apps/docs/docs');

// Parse command line args
const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

// Chunk content into smaller pieces
function chunkContent(content, sourceName) {
  const chunks = [];
  const maxChunkSize = 1000;
  const minChunkSize = 100;

  // Split by headers first
  const sections = content.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract heading if present
    const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
    const heading = headingMatch ? headingMatch[2].trim() : undefined;

    // Get content without the heading line
    const sectionContent = headingMatch
      ? section.slice(headingMatch[0].length).trim()
      : section.trim();

    if (!sectionContent && !heading) continue;

    // If section is small enough, add as single chunk
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

// Get embedding from Gemini API
async function getEmbedding(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Embedding API error: ${json?.error?.message || response.status}`);
  }

  return json?.embedding?.values || [];
}

// Get all markdown files recursively
function getMarkdownFiles(dir, files = []) {
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

async function seedKnowledge() {
  console.log('Starting knowledge base seeding...');
  console.log(`Docs path: ${DOCS_PATH}`);
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);

  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY or GOOGLE_API_KEY is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  // Get workspace and user IDs
  const workspaceId = getArgValue('--workspace-id') ||
    (await client.query('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1')).rows[0]?.id;

  const creatorId =
    (await client.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')).rows[0]?.id;

  if (!workspaceId || !creatorId) {
    console.error('Error: No workspace or user found. Please create a workspace first.');
    await client.end();
    process.exit(1);
  }

  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`Creator ID: ${creatorId}`);

  // Check if docs directory exists
  if (!fs.existsSync(DOCS_PATH)) {
    console.error(`Error: Docs directory not found at ${DOCS_PATH}`);
    await client.end();
    process.exit(1);
  }

  // Get all markdown files
  const files = getMarkdownFiles(DOCS_PATH);
  console.log(`Found ${files.length} documentation files`);

  let totalChunks = 0;
  let sourcesCreated = 0;

  for (const filePath of files) {
    const relativePath = path.relative(DOCS_PATH, filePath);
    const sourceName = `Docs: ${relativePath}`;

    console.log(`\nProcessing: ${relativePath}`);

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Skip empty files
    if (!content.trim()) {
      console.log('  Skipping empty file');
      continue;
    }

    // Check if source already exists
    const existing = await client.query(
      `SELECT id FROM knowledge_sources WHERE name = $1 AND workspace_id = $2`,
      [sourceName, workspaceId]
    );

    let sourceId;
    if (existing.rows.length > 0) {
      sourceId = existing.rows[0].id;
      console.log('  Source exists, updating...');
      // Delete existing chunks
      await client.query('DELETE FROM knowledge_chunks WHERE source_id = $1', [sourceId]);
    } else {
      // Create knowledge source
      const sourceResult = await client.query(
        `INSERT INTO knowledge_sources
          (name, type, scope, workspace_id, status, created_by_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [sourceName, 'markdown', 'workspace', workspaceId, 'processing', creatorId]
      );
      sourceId = sourceResult.rows[0].id;
      sourcesCreated++;
    }

    // Chunk the content
    const chunks = chunkContent(content, sourceName);
    console.log(`  Created ${chunks.length} chunks`);

    // Process chunks in batches of 5
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Get embeddings for batch (with delay to avoid rate limits)
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const chunkIndex = i + j;

        try {
          const embedding = await getEmbedding(chunk.text);
          const embeddingStr = `[${embedding.join(',')}]`;
          const tokenCount = Math.ceil(chunk.text.length / 4);

          await client.query(
            `INSERT INTO knowledge_chunks
              (source_id, content, embedding, chunk_index, metadata, token_count, scope, workspace_id)
            VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8)`,
            [
              sourceId,
              chunk.text,
              embeddingStr,
              chunkIndex,
              JSON.stringify(chunk.metadata),
              tokenCount,
              'workspace',
              workspaceId,
            ]
          );

          totalChunks++;
          process.stdout.write(`\r  Embedded chunk ${chunkIndex + 1}/${chunks.length}`);

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`\n  Error embedding chunk ${chunkIndex}: ${error.message}`);
        }
      }
    }

    // Update source status
    await client.query(
      `UPDATE knowledge_sources
       SET status = 'ready', chunk_count = $1, last_synced_at = now(), updated_at = now()
       WHERE id = $2`,
      [chunks.length, sourceId]
    );

    console.log(''); // New line after progress
  }

  console.log(`\n========================================`);
  console.log(`Seeding complete!`);
  console.log(`  Sources created: ${sourcesCreated}`);
  console.log(`  Total chunks embedded: ${totalChunks}`);
  console.log(`========================================`);

  await client.end();
}

seedKnowledge().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
