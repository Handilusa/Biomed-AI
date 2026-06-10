// ─── Edge MedTech Copilot — Medical Education Agent ───
// Uses MedPsy-4B with medical education system prompt.
// ALWAYS includes disclaimers.

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { AgentResponse, CompletionStats } from '../types.js';
import { getMedicalSystemPrompt } from '../prompts/medical.js';
import { DISCLAIMERS } from '../config.js';

export class MedicalAgent {
  private modelManager: ModelManager;
  private config: AppConfig;

  constructor(modelManager: ModelManager, config: AppConfig) {
    this.modelManager = modelManager;
    this.config = config;
  }

  /**
   * Generate a medical educational response.
   * @param query - User's medical/educational question
   * @param lang - Response language
   */
  async generateResponse(
    query: string,
    lang: 'en' | 'es'
  ): Promise<AgentResponse> {
    const modelId = this.modelManager.getModelId('llm');
    const modelName = this.modelManager.getModelFilename('llm');
    const systemPrompt = getMedicalSystemPrompt(lang);

    const startTime = performance.now();
    let ttftMs = 0;
    let firstTokenReceived = false;
    let contentText = '';
    let thinkingText = '';
    let completionTokens = 0;
    let promptTokens = 0;
    let tokensPerSecond = 0;

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
      agent: 'medical',
      intent: 'medical_educational_context',
      disclaimers: DISCLAIMERS[lang] as unknown as string[],
      stats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Stream response as async generator for SSE.
   */
  async *streamResponse(
    query: string,
    lang: 'en' | 'es'
  ): AsyncGenerator<{ type: string; data: unknown }> {
    const modelId = this.modelManager.getModelId('llm');
    const modelName = this.modelManager.getModelFilename('llm');
    const systemPrompt = getMedicalSystemPrompt(lang);

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

    // Always yield disclaimers at the end
    yield {
      type: 'disclaimers',
      data: { disclaimers: [...DISCLAIMERS[lang]] },
    };
  }
}
