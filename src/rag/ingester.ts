// ─── Edge MedTech Copilot — RAG Ingestion Pipeline ───
// Chunks documents and embeds them using @qvac/rag.

import { embed, ragSaveEmbeddings } from '@qvac/sdk';
import fs from 'fs';
import path from 'path';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { LoadedDocument, DocumentChunk } from '../types.js';

export class RAGIngester {
  private modelManager: ModelManager;
  private config: AppConfig;
  private totalChunks: number = 0;
  private totalDocuments: number = 0;

  constructor(modelManager: ModelManager, config: AppConfig) {
    this.modelManager = modelManager;
    this.config = config;
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

    console.log(`\n📚 Starting RAG ingestion of ${documents.length} documents...`);

    for (const doc of documents) {
      try {
        // 1. Chunk the document manually to guarantee it never exceeds context window
        const chunkSizeChars = 800; // Safe below 1024 tokens limit
        const overlapChars = 100;
        const chunks: { content: string }[] = [];
        let i = 0;
        while (i < doc.content.length) {
          const slice = doc.content.substring(i, i + chunkSizeChars).trim();
          if (slice.length > 0) {
            chunks.push({ content: slice });
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

        // 4. Save embeddings to the workspace database
        await ragSaveEmbeddings({
          modelId: embedModelId,
          documents: saveDocs,
        });

        chunksCreated += saveDocs.length;
        console.log(`  ✅ ${doc.filename}: ${saveDocs.length} chunks ingested`);
        
        // Add to manifest
        this.updateManifest(doc.filename);
      } catch (err) {
        console.error(`  ❌ Failed to ingest ${doc.filename}: ${(err as Error).message}`);
      }
    }

    const timeMs = performance.now() - startTime;
    this.totalChunks += chunksCreated;
    this.totalDocuments += documents.length;

    console.log(`\n📊 Ingestion complete:`);
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
