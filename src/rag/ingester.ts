// ─── Edge MedTech Copilot - RAG Ingestion Pipeline ───
// Chunks documents, embeds them, and stores them in the HyperDB vector database.

import { embed } from '@qvac/sdk';
import fs from 'fs';
import path from 'path';
import { RAG, HyperDBAdapter } from '@qvac/rag';
import Corestore from 'corestore';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { LoadedDocument } from '../types.js';

export class RAGIngester {
  private modelManager: ModelManager;
  private config: AppConfig;
  private rag!: RAG;
  private totalChunks: number = 0;
  private totalDocuments: number = 0;

  constructor(modelManager: ModelManager, config: AppConfig, rag?: RAG) {
    this.modelManager = modelManager;
    this.config = config;
    if (rag) {
      this.rag = rag;
    } else {
      const store = new Corestore(path.resolve(config.rag.dataDir, 'hyperdb'));
      const dbAdapter = new HyperDBAdapter({
        store,
        dbName: 'biomed-rag-vectors-v2',
      });
      const embeddingFunction = async (text: string | string[]) => {
        const embedModelId = modelManager.getModelId('embeddings');
        const result = await embed({
          modelId: embedModelId,
          text,
        });
        return result.embedding;
      };
      this.rag = new RAG({
        embeddingFunction,
        dbAdapter,
      });
      this.rag.ready().catch((err) => {
        console.error('RAGIngester fallback RAG init failed:', err);
      });
    }
  }

  /**
   * Ingest an array of documents: chunk → embed → store.
   */
  async ingest(
    documents: LoadedDocument[]
  ): Promise<{ chunksCreated: number; documentsProcessed: number; timeMs: number }> {
    const startTime = performance.now();
    const embedModelId = this.modelManager.getModelId('embeddings');
    let chunksCreated = 0;

    console.log(`\n📚 Starting HyperDB RAG ingestion of ${documents.length} documents...`);

    for (const doc of documents) {
      try {
        // Extract section headers and their character indices to track section boundaries
        const sections: { index: number; header: string }[] = [];
        const headerRegex = /^\s*(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+([A-Z][A-Za-z0-9\s,\-\/()]{2,75})\s*$/;
        
        let pos = 0;
        while (pos < doc.content.length) {
          let nextNewline = doc.content.indexOf('\n', pos);
          if (nextNewline === -1) {
            nextNewline = doc.content.length;
          }
          const line = doc.content.substring(pos, nextNewline);
          const trimmed = line.trim();
          if (headerRegex.test(trimmed)) {
            sections.push({ index: pos, header: trimmed });
          }
          pos = nextNewline + 1;
        }

        const getSectionForIndex = (index: number): string => {
          let activeSection = 'General';
          for (const sec of sections) {
            if (index >= sec.index) {
              activeSection = sec.header;
            } else {
              break;
            }
          }
          return activeSection;
        };

        // 1. Chunk the document manually to guarantee it never exceeds context window
        const chunkSizeChars = 800; // Safe below 1024 tokens limit
        const overlapChars = 100;
        const chunks: { content: string }[] = [];
        let i = 0;
        while (i < doc.content.length) {
          const slice = doc.content.substring(i, i + chunkSizeChars).trim();
          if (slice.length > 0) {
            const section = getSectionForIndex(i);
            const prefixedContent = `[Manual: ${doc.filename}] [Section: ${section}]\n${slice}`;
            chunks.push({ content: prefixedContent });
          }
          i += (chunkSizeChars - overlapChars);
        }

        if (!chunks || chunks.length === 0) {
          console.warn(`  ⚠ No chunks generated for: ${doc.filename}`);
          continue;
        }

        // 2. Extract texts and generate embeddings
        const chunkTexts = chunks.map((c) => c.content);
        const { embedding: embeddings } = await embed({
          modelId: embedModelId,
          text: chunkTexts,
        });

        // 3. Format documents for saving with metadata
        const saveDocs = chunks.map((chunk, index) => {
          return {
            id: `${doc.filename}::chunk-${index}`,
            content: chunk.content,
            embedding: embeddings[index],
            embeddingModelId: embedModelId,
            metadata: {
              document: doc.filename,
              chunkIndex: index,
              type: doc.type,
            },
          };
        });

        // 4. Save embeddings to the HyperDBAdapter database
        await this.rag.saveEmbeddings(saveDocs);

        chunksCreated += saveDocs.length;
        console.log(`  ✅ ${doc.filename}: ${saveDocs.length} chunks ingested in HyperDB`);
        
        // Add to manifest
        this.updateManifest(doc.filename);
      } catch (err) {
        console.error(`  ❌ Failed to ingest ${doc.filename}: ${(err as Error).message}`);
      }
    }

    const timeMs = performance.now() - startTime;
    this.totalChunks += chunksCreated;
    this.totalDocuments += documents.length;

    console.log(`\n📊 HyperDB Ingestion complete:`);
    console.log(`   Documents: ${documents.length}`);
    console.log(`   Chunks: ${chunksCreated}`);
    console.log(`   Time: ${(timeMs / 1000).toFixed(1)}s\n`);

    return {
      chunksCreated,
      documentsProcessed: documents.length,
      timeMs: Math.round(timeMs),
    };
  }

  /**
   * Get total ingestion stats.
   */
  getStatus(): { indexed_documents: number; total_chunks: number } {
    return {
      indexed_documents: this.totalDocuments,
      total_chunks: this.totalChunks,
    };
  }

  /**
   * Update the JSON manifest of ingested documents.
   */
  private updateManifest(filename: string) {
    const manifestPath = path.join(this.config.rag.dataDir, 'ingested_manifest.json');
    let manifest: string[] = [];
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (e) {
        manifest = [];
      }
    }
    if (!manifest.includes(filename)) {
      manifest.push(filename);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }
}
