// ─── Biomed Field Copilot - Manual Evidence Agent ───

import type { RAGRetriever } from '../rag/retriever.js';
import type { SearchResult } from '../types.js';

export class ManualEvidenceAgent {
  constructor(private retriever: RAGRetriever) {}

  async run(query: string, documentId: string): Promise<SearchResult[]> {
    try {
      // Use RAG to fetch relevant manual chunks
      const results = await this.retriever.search(query, documentId);
      return results;
    } catch (e) {
      console.warn('ManualEvidenceAgent: RAG search failed', e);
      return [];
    }
  }
}
