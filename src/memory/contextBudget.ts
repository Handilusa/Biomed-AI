// ─── Biomed Field Copilot - Context Budget Manager ───
// Dynamically calculates how much conversation history can fit
// within the model's context window after system prompt + RAG.
// Uses a character-based token estimation heuristic for GGUF models.

import type { ConversationTurn } from './sessionStore.js';

// ────────────────────────────────────────────
// Token Estimation
// ────────────────────────────────────────────

/**
 * Estimate token count for a string using the standard heuristic
 * for Llama-family GGUF tokenizers: ~3.5 characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

// ────────────────────────────────────────────
// Memory Context Builder
// ────────────────────────────────────────────

export interface MemoryContext {
  /** Compressed summary of older turns (deterministic, from metadata) */
  compressedSummary: string | null;
  /** Recent turns to include as chat history (sliding window) */
  slidingWindow: { role: 'user' | 'assistant'; content: string }[];
  /** Total estimated tokens consumed by memory context */
  totalTokensUsed: number;
  /** Whether any history was included */
  hasHistory: boolean;
}

/**
 * Build the memory context that fits within the remaining token budget.
 * 
 * Priority order:
 * 1. Compressed summary (small, always fits — ~80-150 tokens)
 * 2. Last 1 turn pair (user + assistant)
 * 3. Last 2 turn pairs (if budget allows)
 * 
 * @param compressedSummary - The deterministic summary from SessionStore
 * @param slidingWindowTurns - Recent turns from SessionStore (up to 4 entries = 2 pairs)
 * @param systemPromptTokens - Estimated tokens in the system prompt
 * @param ragContextTokens - Estimated tokens in the RAG context
 * @param maxContextTokens - Total context window size (default 4096 for 4B model)
 * @param generationHeadroom - Minimum tokens to reserve for generation (default 800)
 */
export function buildMemoryContext(
  compressedSummary: string | null,
  slidingWindowTurns: ConversationTurn[],
  systemPromptTokens: number,
  ragContextTokens: number,
  maxContextTokens: number = 4096,
  generationHeadroom: number = 800
): MemoryContext {
  // Calculate available budget for memory
  const fixedCost = systemPromptTokens + ragContextTokens + generationHeadroom;
  let availableBudget = maxContextTokens - fixedCost;

  if (availableBudget <= 0) {
    // No room for any history
    console.log(`[ContextBudget] ⚠️ No room for history. Fixed cost: ${fixedCost}, max: ${maxContextTokens}`);
    return {
      compressedSummary: null,
      slidingWindow: [],
      totalTokensUsed: 0,
      hasHistory: false,
    };
  }

  let totalTokensUsed = 0;
  let includedSummary: string | null = null;
  const includedWindow: { role: 'user' | 'assistant'; content: string }[] = [];

  // Step 1: Try to fit the compressed summary
  if (compressedSummary) {
    const summaryTokens = estimateTokens(compressedSummary);
    if (summaryTokens <= availableBudget) {
      includedSummary = compressedSummary;
      totalTokensUsed += summaryTokens;
      availableBudget -= summaryTokens;
    }
  }

  // Step 2: Try to fit sliding window turns (most recent first)
  if (slidingWindowTurns.length > 0 && availableBudget > 0) {
    // Estimate total cost of all sliding window turns
    const turnCosts = slidingWindowTurns.map(t => ({
      turn: t,
      tokens: estimateTokens(t.content) + 4, // +4 for role/formatting overhead
    }));

    const totalWindowCost = turnCosts.reduce((sum, tc) => sum + tc.tokens, 0);

    if (totalWindowCost <= availableBudget) {
      // All turns fit — include them all
      for (const tc of turnCosts) {
        includedWindow.push({ role: tc.turn.role, content: tc.turn.content });
        totalTokensUsed += tc.tokens;
      }
    } else {
      // Try to fit just the most recent pair (last 2 turns)
      const recentPair = turnCosts.slice(-2);
      const recentCost = recentPair.reduce((sum, tc) => sum + tc.tokens, 0);

      if (recentCost <= availableBudget) {
        for (const tc of recentPair) {
          includedWindow.push({ role: tc.turn.role, content: tc.turn.content });
          totalTokensUsed += tc.tokens;
        }
      } else {
        // Can't even fit 1 pair — try just the last assistant response (truncated if needed)
        const lastAssistant = turnCosts.filter(tc => tc.turn.role === 'assistant').pop();
        if (lastAssistant && lastAssistant.tokens <= availableBudget) {
          includedWindow.push({ role: 'assistant', content: lastAssistant.turn.content });
          totalTokensUsed += lastAssistant.tokens;
        }
      }
    }
  }

  const hasHistory = includedSummary !== null || includedWindow.length > 0;

  if (hasHistory) {
    console.log(
      `[ContextBudget] 📊 Memory context: summary=${includedSummary ? 'yes' : 'no'}, ` +
      `window=${includedWindow.length} turns, tokens=${totalTokensUsed}, ` +
      `budget_remaining=${maxContextTokens - fixedCost - totalTokensUsed}`
    );
  }

  return {
    compressedSummary: includedSummary,
    slidingWindow: includedWindow,
    totalTokensUsed,
    hasHistory,
  };
}
