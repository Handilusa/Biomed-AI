// ─── Edge MedTech Copilot — Structured Logger ───
// JSON Lines (.jsonl) logger for the evidence bundle.

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry } from '../types.js';

export class StructuredLogger {
  private logDir: string;
  private currentFile: string | null = null;
  private entryCount: number = 0;

  constructor(logDir: string) {
    this.logDir = logDir;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Start a new logging session with a named file.
   */
  startSession(sessionName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sessionName}_${timestamp}.jsonl`;
    this.currentFile = join(this.logDir, filename);
    this.entryCount = 0;
    console.log(`📊 Logging to: ${this.currentFile}`);
    return this.currentFile;
  }

  /**
   * Log a single entry to the current session file.
   */
  logEntry(entry: LogEntry): void {
    if (!this.currentFile) {
      this.startSession('auto');
    }

    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.currentFile!, line, 'utf-8');
    this.entryCount++;
  }

  /**
   * Log a system event (e.g., model load/unload).
   */
  logEvent(eventType: 'model_load' | 'model_unload', details: Record<string, unknown>): void {
    if (!this.currentFile) {
      this.startSession('auto');
    }

    const entry = {
      timestamp: new Date().toISOString(),
      type: 'system_event',
      event: eventType,
      ...details
    };

    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.currentFile!, line, 'utf-8');
  }

  /**
   * End the current session and return summary.
   */
  endSession(): { filepath: string; entries: number } {
    const result = {
      filepath: this.currentFile ?? '',
      entries: this.entryCount,
    };

    console.log(`📊 Session ended: ${this.entryCount} entries logged to ${this.currentFile}`);
    this.currentFile = null;
    this.entryCount = 0;
    return result;
  }

  /**
   * Convert a JSONL log file to CSV format.
   */
  exportCSV(jsonlPath: string): string {
    const csvPath = jsonlPath.replace(/\.jsonl$/, '.csv');

    const content = readFileSync(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      writeFileSync(csvPath, '', 'utf-8');
      return csvPath;
    }

    // Parse all entries
    const entries: LogEntry[] = lines.map((line) => JSON.parse(line));

    // CSV headers
    const headers = [
      'timestamp', 'request_id', 'agent', 'model', 'query', 'prompt_hash', 'intent',
      'prompt_tokens', 'completion_tokens', 'ttft_ms', 'tokens_per_second',
      'total_time_ms', 'rag_chunks_used', 'memory_mb', 'has_disclaimers', 'documentId'
    ];

    // Build CSV
    const csvLines = [headers.join(',')];

    for (const entry of entries) {
      const row = headers.map((h) => {
        const value = entry[h as keyof LogEntry];
        if (value === undefined || value === null) return '';
        if (typeof value === 'string') {
          // Escape quotes and wrap in quotes
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvLines.push(row.join(','));
    }

    writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
    console.log(`📊 CSV exported: ${csvPath}`);
    return csvPath;
  }

  /**
   * Get the current log file path.
   */
  getCurrentFile(): string | null {
    return this.currentFile;
  }

  /**
   * Get the log directory path.
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Read all entries from a specific JSONL log file.
   */
  getLogEntries(filePath: string): LogEntry[] {
    try {
      if (!existsSync(filePath)) return [];
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map(line => {
        try { return JSON.parse(line) as LogEntry; }
        catch { return null; }
      }).filter((e): e is LogEntry => e !== null);
    } catch {
      return [];
    }
  }

  /**
   * Get all session log files and their entries.
   * Returns sessions sorted by most recent first.
   */
  getAllSessions(): Array<{ filename: string; entries: LogEntry[] }> {
    try {
      const { readdirSync, statSync } = require('node:fs');
      const files: string[] = readdirSync(this.logDir)
        .filter((f: string) => f.endsWith('.jsonl'))
        .sort((a: string, b: string) => {
          try {
            const statA = statSync(join(this.logDir, a));
            const statB = statSync(join(this.logDir, b));
            return statB.mtimeMs - statA.mtimeMs;
          } catch {
            return 0;
          }
        });

      return files.map((f: string) => ({
        filename: f,
        entries: this.getLogEntries(join(this.logDir, f)),
      }));
    } catch {
      return [];
    }
  }
}
