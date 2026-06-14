// ─── Edge MedTech Copilot - RAG Retriever ───
// Wraps @qvac/rag similarity search.

import { RAG, HyperDBAdapter } from '@qvac/rag';
import Corestore from 'corestore';
import path from 'node:path';
import { embed } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { SearchResult } from '../types.js';

export class RAGRetriever {
  private modelManager: ModelManager;
  private config: AppConfig;
  private rag!: RAG;

  constructor(modelManager: ModelManager, config: AppConfig, rag?: RAG) {
    this.modelManager = modelManager;
    this.config = config;
    if (rag) {
      this.rag = rag;
    } else {
      const store = new Corestore(path.resolve(config.rag.dataDir, 'hyperdb'));
      const dbAdapter = new HyperDBAdapter({
        store,
        dbName: 'biomed-rag-vectors',
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
        console.error('RAGRetriever fallback RAG init failed:', err);
      });
    }
  }

  /**
   * Search the HyperDB RAG index for chunks similar to the query.
   * @param query - Search query
   * @param documentId - Optional document ID to filter by
   * @param topK - Number of results to return (default from config)
   */
  async search(query: string, documentId?: string, topK?: number): Promise<SearchResult[]> {
    const finalK = topK ?? this.config.rag.topK;
    // If filtering by document, request more results initially since SDK lacks metadata filtering
    const searchK = documentId ? 50 : finalK;

    try {
      const results = await this.rag.search(query, {
        topK: searchK,
      });

      if (!results || !Array.isArray(results)) {
        return [];
      }

      // RAG search returns { id, content, score }
      let filteredResults = results as { id?: string; content?: string; score?: number; }[];
      
      // Filter by document ID if provided (must be deterministic match)
      if (documentId) {
        filteredResults = filteredResults.filter((r) => r.id && r.id.startsWith(`${documentId}::`));
      }

      return filteredResults
        .slice(0, finalK)
        .map((result) => {
          // Extract document name from id (e.g., "manual.pdf::chunk-2" → "manual.pdf")
          const docName = result.id
            ? result.id.replace(/::chunk-\d+$/, '')
            : 'unknown';
          return {
            text: (result.content ?? '').substring(0, 600), // limit chunk length to save context tokens
            document: docName,
            similarity: result.score ?? 0,
          };
        })
        .filter((r) => r.text.length > 0);
    } catch (err) {
      console.error(`❌ HyperDB RAG search error: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Format search results into a context string for agent prompts.
   * Includes source citations.
   */
  formatContext(results: SearchResult[]): string {
    if (!results || results.length === 0) return '';

    return results
      .map((r, i) => {
        const similarity = (r.similarity * 100).toFixed(0);
        return `--- [Source ${i + 1}: ${r.document}] (Relevance: ${similarity}%) ---\n${r.text}\n`;
      })
      .join('\n');
  }
}
