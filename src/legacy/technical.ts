// ─── Edge MedTech Copilot — Technical Troubleshooting Agent ───
// Uses MedPsy-4B with technical system prompt + RAG context.

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { AgentResponse, CompletionStats, SearchResult } from '../types.js';
import { getTechnicalSystemPrompt } from '../prompts/technical.js';

export class TechnicalAgent {
  private modelManager: ModelManager;
  private config: AppConfig;

  constructor(modelManager: ModelManager, config: AppConfig) {
    this.modelManager = modelManager;
    this.config = config;
  }

  /**
   * Generate a technical troubleshooting response.
   * @param query - User's technical question
   * @param ragResults - Relevant document chunks from RAG search
   * @param lang - Response language
   */
  async generateResponse(
    query: string,
    ragResults: SearchResult[],
    lang: 'en' | 'es'
  ): Promise<AgentResponse> {
    const modelId = this.modelManager.getModelId('llm');
    const modelName = this.modelManager.getModelFilename('llm');

    // Format RAG context for the system prompt
    const ragContext = this.formatRAGContext(ragResults);
    const systemPrompt = getTechnicalSystemPrompt(ragContext, lang);

    // Track timing
    const startTime = performance.now();
    let ttftMs = 0;
    let firstTokenReceived = false;
    let contentText = '';
    let thinkingText = '';
    let completionTokens = 0;
    let promptTokens = 0;
    let tokensPerSecond = 0;

    // Run completion with event streaming
    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      stream: true,
      captureThinking: true,
    });

    for await (const event of run.events) {
      switch (event.type) {
        case 'contentDelta':
          if (!firstTokenReceived) {
            ttftMs = performance.now() - startTime;
            firstTokenReceived = true;
          }
          contentText += (event as { type: string; text: string }).text;
          break;

        case 'thinkingDelta':
          thinkingText += (event as { type: string; text: string }).text;
          break;

        case 'completionStats': {
          const stats = event as unknown as {
            prompt_tokens?: number;
            completion_tokens?: number;
            tokens_per_second?: number;
          };
          promptTokens = stats.prompt_tokens ?? 0;
          completionTokens = stats.completion_tokens ?? 0;
          tokensPerSecond = stats.tokens_per_second ?? 0;
          break;
        }
      }
    }

    const totalTimeMs = performance.now() - startTime;

    // Build stats
    const stats: CompletionStats = {
      ttft_ms: Math.round(ttftMs),
      tokens_per_second: tokensPerSecond || (completionTokens / (totalTimeMs / 1000)),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_time_ms: Math.round(totalTimeMs),
      model: modelName,
    };

    return {
      content: contentText.trim(),
      agent: 'technical',
      intent: 'technical_device_issue',
      sources: ragResults.map((r) => ({
        document: r.document,
        chunk: r.text.substring(0, 200) + (r.text.length > 200 ? '...' : ''),
        similarity: r.similarity,
      })),
      stats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Stream response as async generator for SSE.
   */
  async *streamResponse(
    query: string,
    ragResults: SearchResult[],
    lang: 'en' | 'es'
  ): AsyncGenerator<{ type: string; data: unknown }> {
    const modelId = this.modelManager.getModelId('llm');
    const modelName = this.modelManager.getModelFilename('llm');

    const ragContext = this.formatRAGContext(ragResults);
    const systemPrompt = getTechnicalSystemPrompt(ragContext, lang);

    // Yield RAG sources upfront
    if (ragResults.length > 0) {
      yield {
        type: 'rag_sources',
        data: {
          sources: ragResults.map((r) => ({
            document: r.document,
            similarity: r.similarity,
          })),
        },
      };
    }

    const startTime = performance.now();
    let firstTokenReceived = false;
    let ttftMs = 0;

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      stream: true,
      captureThinking: true,
    });

    for await (const event of run.events) {
      switch (event.type) {
        case 'contentDelta': {
          if (!firstTokenReceived) {
            ttftMs = performance.now() - startTime;
            firstTokenReceived = true;
          }
          const text = (event as { type: string; text: string }).text;
          yield { type: 'content_delta', data: { text } };
          break;
        }

        case 'thinkingDelta': {
          const text = (event as { type: string; text: string }).text;
          yield { type: 'thinking_delta', data: { text } };
          break;
        }

        case 'completionStats': {
          const s = event as unknown as {
            prompt_tokens?: number;
            completion_tokens?: number;
            tokens_per_second?: number;
          };
          const totalTimeMs = performance.now() - startTime;
          yield {
            type: 'stats',
            data: {
              ttft_ms: Math.round(ttftMs),
              tokens_per_second: s.tokens_per_second ?? 0,
              prompt_tokens: s.prompt_tokens ?? 0,
              completion_tokens: s.completion_tokens ?? 0,
              total_time_ms: Math.round(totalTimeMs),
              model: modelName,
            },
          };
          break;
        }
      }
    }
  }

  /**
   * Format RAG search results into a context string for the system prompt.
   */
  private formatRAGContext(results: SearchResult[]): string {
    if (!results || results.length === 0) return '';

    return results
      .map((r, i) => {
        return `--- [Source ${i + 1}: ${r.document}] (Relevance: ${(r.similarity * 100).toFixed(0)}%) ---\n${r.text}\n`;
      })
      .join('\n');
  }
}
