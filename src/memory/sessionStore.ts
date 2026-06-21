// ─── Biomed Field Copilot - Conversation Session Store ───
// In-memory session store for conversation memory.
// Each session tracks turns (user + assistant) with pipeline metadata.
// Sessions auto-expire after TTL to prevent unbounded memory growth.

import type { TriageCategory, FinalDisposition } from '../types.js';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface TurnMeta {
  triageCategory?: TriageCategory;
  extractedSignals?: string[];
  finalDisposition?: FinalDisposition;
  documentId?: string;
  ragChunksUsed?: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  meta?: TurnMeta;
  timestamp: number;
}

export interface Session {
  id: string;
  documentId?: string;
  turns: ConversationTurn[];
  createdAt: number;
  lastActiveAt: number;
}

// ────────────────────────────────────────────
// Session Store
// ────────────────────────────────────────────

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class SessionStore {
  private sessions = new Map<string, Session>();
  private maxTurns: number;
  private ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { maxTurns?: number; ttlMs?: number }) {
    this.maxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is pending
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Get an existing session or create a new one.
   */
  getOrCreate(sessionId: string, documentId?: string): Session {
    let session = this.sessions.get(sessionId);

    if (session) {
      session.lastActiveAt = Date.now();
      // If the documentId changed, reset the session (new equipment context)
      if (documentId && session.documentId && session.documentId !== documentId) {
        console.log(`[SessionStore] 🔄 Document changed for session ${sessionId}: ${session.documentId} → ${documentId}. Resetting session.`);
        session = this.createSession(sessionId, documentId);
        this.sessions.set(sessionId, session);
      }
      return session;
    }

    session = this.createSession(sessionId, documentId);
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add a turn to a session. Auto-trims to maxTurns.
   */
  addTurn(sessionId: string, turn: ConversationTurn): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.turns.push(turn);
    session.lastActiveAt = Date.now();

    // Trim: keep only the most recent maxTurns turns
    if (session.turns.length > this.maxTurns) {
      session.turns = session.turns.slice(-this.maxTurns);
    }
  }

  /**
   * Get the last N turn pairs (user + assistant = 2 entries per pair).
   * Returns them in chronological order.
   */
  getSlidingWindow(sessionId: string, pairs: number = 2): ConversationTurn[] {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length === 0) return [];

    // Take the last `pairs * 2` turns to get N complete pairs
    const sliceCount = pairs * 2;
    return session.turns.slice(-sliceCount);
  }

  /**
   * Generate a compressed context summary from pipeline metadata.
   * This is DETERMINISTIC — no LLM call needed.
   * 
   * Produces a concise 1-3 line summary like:
   * "Previous session: diagnosing SpO2 probe off alarm on [manual]. 
   *  Triage: wiring_connector. Last action: swap_test recommended. 
   *  Signals: SpO2, probe off, cable."
   */
  getCompressedContext(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length === 0) return null;

    // Collect metadata from assistant turns (they have pipeline results)
    const assistantTurns = session.turns.filter(t => t.role === 'assistant' && t.meta);
    if (assistantTurns.length === 0) return null;

    // Use the most recent assistant turn's metadata as the primary context
    const latest = assistantTurns[assistantTurns.length - 1];
    const meta = latest.meta!;

    // Collect all unique signals across the session
    const allSignals = new Set<string>();
    for (const turn of assistantTurns) {
      if (turn.meta?.extractedSignals) {
        for (const sig of turn.meta.extractedSignals) {
          allSignals.add(sig);
        }
      }
    }

    // Collect all unique categories seen
    const categories = new Set<string>();
    for (const turn of assistantTurns) {
      if (turn.meta?.triageCategory) {
        categories.add(turn.meta.triageCategory);
      }
    }

    // Build the compressed summary
    const parts: string[] = [];

    // Line 1: What we're diagnosing
    const docContext = session.documentId ? ` on manual "${session.documentId}"` : '';
    const categoryStr = meta.triageCategory || [...categories][0] || 'unknown';
    parts.push(`Ongoing diagnostic session${docContext}. Category: ${categoryStr}.`);

    // Line 2: Last disposition
    if (meta.finalDisposition) {
      const dispositionMap: Record<string, string> = {
        swap_test: 'swap-test was recommended',
        replace_accessory: 'accessory replacement was recommended',
        escalate: 'escalation was recommended',
        recalibrate: 'recalibration was recommended',
        follow_error_tree: 'error tree follow-up was recommended',
        clinical_referral: 'clinical referral was issued',
      };
      parts.push(`Last action: ${dispositionMap[meta.finalDisposition] || meta.finalDisposition}.`);
    }

    // Line 3: Key signals
    if (allSignals.size > 0) {
      const signalList = [...allSignals].slice(0, 6).join(', ');
      parts.push(`Key signals: ${signalList}.`);
    }

    // Line 4: Turn count
    const userTurnCount = session.turns.filter(t => t.role === 'user').length;
    if (userTurnCount > 1) {
      parts.push(`This is follow-up question #${userTurnCount} in the session.`);
    }

    return parts.join(' ');
  }

  /**
   * Get the number of turns in a session.
   */
  getTurnCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.turns.length ?? 0;
  }

  /**
   * Check if a session exists and has any turns.
   */
  hasHistory(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return !!session && session.turns.length > 0;
  }

  /**
   * Remove expired sessions (older than TTL).
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > this.ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[SessionStore] 🧹 Cleaned up ${cleaned} expired session(s). Active: ${this.sessions.size}`);
    }
  }

  /**
   * Create a fresh session.
   */
  private createSession(id: string, documentId?: string): Session {
    return {
      id,
      documentId,
      turns: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
  }

  /**
   * Stop the cleanup timer (for graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
