import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';
import { sql } from 'kysely';
import { KnowledgeScope } from './dto/knowledge.dto';

interface ChunkMetadata {
  headings?: string[];
  section?: string;
  pageNumber?: number;
}

interface ContentChunk {
  text: string;
  metadata: ChunkMetadata;
}

@Injectable()
export class KnowledgeProcessorService {
  private readonly logger = new Logger(KnowledgeProcessorService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  // Cache for markdown content (for sources created via API with direct content)
  private markdownContentCache = new Map<string, string>();

  async processSource(sourceId: string, directContent?: string): Promise<void> {
    // Store direct content in cache if provided
    if (directContent) {
      this.markdownContentCache.set(sourceId, directContent);
    }

    const source = await sql<{
      id: string;
      name: string;
      type: string;
      source_url: string | null;
      file_id: string | null;
      page_id: string | null;
      scope: string;
      workspace_id: string | null;
      space_id: string | null;
    }>`
      SELECT id, name, type, source_url, file_id, page_id, scope, workspace_id, space_id
      FROM knowledge_sources
      WHERE id = ${sourceId}::uuid
    `.execute(this.db);

    const sourceRecord = source.rows[0];
    if (!sourceRecord) {
      throw new Error(`Source ${sourceId} not found`);
    }

    try {
      // Update status to processing
      await sql`
        UPDATE knowledge_sources
        SET status = 'processing', updated_at = now()
        WHERE id = ${sourceId}::uuid
      `.execute(this.db);

      // Fetch content based on source type
      let content: string;
      switch (sourceRecord.type) {
        case 'url':
          content = await this.fetchUrlContent(sourceRecord.source_url!);
          break;
        case 'file':
          content = await this.extractFileContent(sourceRecord.file_id!);
          break;
        case 'page':
          content = await this.getPageContent(sourceRecord.page_id!);
          break;
        case 'markdown':
          content = this.markdownContentCache.get(sourceId) || '';
          this.markdownContentCache.delete(sourceId); // Clean up after use
          if (!content) {
            // Markdown sources without cached content cannot be refreshed
            // (they were seeded directly to the database)
            this.logger.warn(`Cannot refresh markdown source ${sourceId} - no content available`);
            throw new Error('Markdown source content not available for refresh');
          }
          break;
        default:
          throw new Error(`Unknown source type: ${sourceRecord.type}`);
      }

      if (!content || content.trim().length === 0) {
        throw new Error('No content extracted from source');
      }

      // Chunk the content
      const chunks = this.chunkContent(content);
      this.logger.log(`Created ${chunks.length} chunks for source ${sourceId}`);

      // Delete existing chunks
      await sql`
        DELETE FROM knowledge_chunks WHERE source_id = ${sourceId}::uuid
      `.execute(this.db);

      // Process chunks in batches
      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await this.processChunkBatch(sourceRecord, batch, i);
      }

      // Update source status
      await sql`
        UPDATE knowledge_sources
        SET status = 'ready',
            chunk_count = ${chunks.length},
            last_synced_at = now(),
            error_message = NULL,
            updated_at = now()
        WHERE id = ${sourceId}::uuid
      `.execute(this.db);

      this.logger.log(`Successfully processed source ${sourceId} with ${chunks.length} chunks`);
    } catch (error: any) {
      this.logger.error(`Failed to process source ${sourceId}:`, error);
      await sql`
        UPDATE knowledge_sources
        SET status = 'error',
            error_message = ${error.message || String(error)},
            updated_at = now()
        WHERE id = ${sourceId}::uuid
      `.execute(this.db);
      throw error;
    }
  }

  private async fetchUrlContent(url: string): Promise<string> {
    this.logger.log(`Fetching content from URL: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RavenDocs-KnowledgeBot/1.0',
          'Accept': 'text/html,application/xhtml+xml,text/plain,text/markdown',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      // If it's HTML, do basic cleanup
      if (contentType.includes('text/html')) {
        return this.htmlToText(text);
      }

      return text;
    } catch (error: any) {
      this.logger.error(`Failed to fetch URL ${url}:`, error);
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  private htmlToText(html: string): string {
    // Basic HTML to text conversion
    // Remove script and style tags with their content
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    // Convert headings to markdown-style
    text = text
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

    // Convert paragraphs and line breaks
    text = text
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '');

    // Convert links to text
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)');

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return text;
  }

  private async extractFileContent(fileId: string): Promise<string> {
    // TODO: Implement file content extraction
    // For now, this is a placeholder
    // Would need to:
    // 1. Fetch file from storage
    // 2. Parse based on file type (PDF, DOCX, MD, TXT)
    // 3. Extract text content
    this.logger.warn(`File extraction not yet implemented for fileId: ${fileId}`);
    throw new Error('File content extraction not yet implemented');
  }

  private async getPageContent(pageId: string): Promise<string> {
    const page = await sql<{ text_content: string | null; title: string | null }>`
      SELECT text_content, title
      FROM pages
      WHERE id = ${pageId}::uuid AND deleted_at IS NULL
    `.execute(this.db);

    const pageRecord = page.rows[0];
    if (!pageRecord) {
      throw new Error(`Page ${pageId} not found`);
    }

    const title = pageRecord.title || '';
    const content = pageRecord.text_content || '';

    return title ? `# ${title}\n\n${content}` : content;
  }

  private chunkContent(content: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const maxChunkSize = 1000; // characters
    const minChunkSize = 100;

    // Split by headers first
    const sections = content.split(/(?=^#{1,3}\s)/m);

    for (const section of sections) {
      if (!section.trim()) continue;

      // Extract heading if present
      const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
      const heading = headingMatch ? headingMatch[2].trim() : undefined;
      const headingLevel = headingMatch ? headingMatch[1].length : 0;

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
            metadata: { headings: heading ? [heading] : [] },
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
            metadata: { headings: heading ? [heading] : [] },
          });
          currentChunk = heading ? `${heading} (continued)\n\n${trimmedPara}` : trimmedPara;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        }
      }

      if (currentChunk.trim().length >= minChunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: { headings: heading ? [heading] : [] },
        });
      }
    }

    return chunks;
  }

  private async processChunkBatch(
    source: {
      id: string;
      scope: string;
      workspace_id: string | null;
      space_id: string | null;
    },
    chunks: ContentChunk[],
    startIndex: number,
  ): Promise<void> {
    // Generate embeddings for all chunks in batch
    const embeddings = await Promise.all(
      chunks.map((chunk) => this.vectorSearch.embedText(chunk.text)),
    );

    // Insert chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;
      const tokenCount = Math.ceil(chunk.text.length / 4); // Rough estimate

      await sql`
        INSERT INTO knowledge_chunks (
          source_id, content, embedding, chunk_index, metadata,
          token_count, scope, workspace_id, space_id
        )
        VALUES (
          ${source.id}::uuid,
          ${chunk.text},
          ${embeddingStr}::vector,
          ${startIndex + i},
          ${JSON.stringify(chunk.metadata)}::jsonb,
          ${tokenCount},
          ${source.scope},
          ${source.workspace_id}::uuid,
          ${source.space_id}::uuid
        )
      `.execute(this.db);
    }
  }
}
