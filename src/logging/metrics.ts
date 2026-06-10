// ─── Edge MedTech Copilot — Performance Metrics Collector ───
// High-resolution timing for TTFT, TPS, and per-request stats.

import type { CompletionStats } from '../types.js';

interface RequestMetrics {
  startTime: number;
  firstTokenTime: number | null;
  endTime: number | null;
  promptTokens: number;
  completionTokens: number;
  tokensPerSecond: number;
}

export class MetricsCollector {
  private requests: Map<string, RequestMetrics> = new Map();
  private sessionStats = {
    totalQueries: 0,
    ttftSum: 0,
    tpsSum: 0,
    totalTokens: 0,
  };

  /**
   * Mark the start of a new request.
   */
  startRequest(requestId: string): void {
    this.requests.set(requestId, {
      startTime: performance.now(),
      firstTokenTime: null,
      endTime: null,
      promptTokens: 0,
      completionTokens: 0,
      tokensPerSecond: 0,
    });
  }

  /**
   * Record when the first token is received.
   */
  recordFirstToken(requestId: string): void {
    const metrics = this.requests.get(requestId);
    if (metrics && !metrics.firstTokenTime) {
      metrics.firstTokenTime = performance.now();
    }
  }

  /**
   * Record completion stats and finalize the request metrics.
   */
  recordCompletion(
    requestId: string,
    stats: {
      prompt_tokens: number;
      completion_tokens: number;
      tokens_per_second: number;
    }
  ): CompletionStats {
    const metrics = this.requests.get(requestId);
    const now = performance.now();

    if (!metrics) {
      // Request not tracked — return best-effort stats
      return {
        ttft_ms: 0,
        tokens_per_second: stats.tokens_per_second,
        prompt_tokens: stats.prompt_tokens,
        completion_tokens: stats.completion_tokens,
        total_time_ms: 0,
        model: 'unknown',
      };
    }

    metrics.endTime = now;
    metrics.promptTokens = stats.prompt_tokens;
    metrics.completionTokens = stats.completion_tokens;
    metrics.tokensPerSecond = stats.tokens_per_second;

    const ttftMs = metrics.firstTokenTime
      ? metrics.firstTokenTime - metrics.startTime
      : now - metrics.startTime;

    const totalTimeMs = now - metrics.startTime;

    // Update session stats
    this.sessionStats.totalQueries++;
    this.sessionStats.ttftSum += ttftMs;
    this.sessionStats.tpsSum += stats.tokens_per_second;
    this.sessionStats.totalTokens += stats.prompt_tokens + stats.completion_tokens;

    return {
      ttft_ms: Math.round(ttftMs),
      tokens_per_second: stats.tokens_per_second || (stats.completion_tokens / (totalTimeMs / 1000)),
      prompt_tokens: stats.prompt_tokens,
      completion_tokens: stats.completion_tokens,
      total_time_ms: Math.round(totalTimeMs),
      model: '', // Filled by caller
    };
  }

  /**
   * Get aggregate session statistics.
   */
  getSessionSummary(): {
    totalQueries: number;
    avgTtft: number;
    avgTps: number;
    totalTokens: number;
  } {
    const { totalQueries, ttftSum, tpsSum, totalTokens } = this.sessionStats;
    return {
      totalQueries,
      avgTtft: totalQueries > 0 ? Math.round(ttftSum / totalQueries) : 0,
      avgTps: totalQueries > 0 ? parseFloat((tpsSum / totalQueries).toFixed(1)) : 0,
      totalTokens,
    };
  }

  /**
   * Reset session statistics.
   */
  reset(): void {
    this.requests.clear();
    this.sessionStats = { totalQueries: 0, ttftSum: 0, tpsSum: 0, totalTokens: 0 };
  }
}
