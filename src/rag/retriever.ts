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
        const targetDoc = documentId.replace(/\\/g, '/');
        filteredResults = filteredResults.filter((r) => {
          if (!r.id) return false;
          const normalizedId = r.id.replace(/\\/g, '/');
          const docPart = normalizedId.split('::')[0];
          return docPart === targetDoc || docPart.endsWith('/' + targetDoc);
        });
      }

      // Deduplicate near-identical chunks caused by overlapping ingestion windows
      filteredResults = this.deduplicateResults(filteredResults);

      return filteredResults
        .slice(0, finalK)
        .map((result) => {
          // Extract document name from id (e.g., "manual.pdf::chunk-2" → "manual.pdf")
          const docName = result.id
            ? result.id.replace(/::chunk-\d+$/, '')
            : 'unknown';
          return {
            text: result.content ?? '',
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

  /**
   * Remove near-duplicate chunks caused by overlapping ingestion windows.
   * Uses Jaccard similarity on word sets — O(n²) but n is small (topK ≤ 50).
   */
  private deduplicateResults(
    results: { id?: string; content?: string; score?: number }[]
  ): typeof results {
    const dominated = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      if (dominated.has(i)) continue;
      const wordsA = new Set((results[i].content || '').toLowerCase().split(/\s+/));

      for (let j = i + 1; j < results.length; j++) {
        if (dominated.has(j)) continue;
        const wordsB = new Set((results[j].content || '').toLowerCase().split(/\s+/));

        // Jaccard similarity
        let intersection = 0;
        for (const w of wordsA) if (wordsB.has(w)) intersection++;
        const union = wordsA.size + wordsB.size - intersection;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard > 0.7) {
          // Keep the one with higher score (lower index = higher score from DB)
          dominated.add(j);
        }
      }
    }

    return results.filter((_, idx) => !dominated.has(idx));
  }
}
