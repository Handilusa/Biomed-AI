// ─── Biomed Field Copilot — Local Fine-Tuning Manager ───
// Real LoRA fine-tuning using @qvac/sdk finetune() API.
// Stores technician corrections in JSONL, trains on accumulated data,
// and streams real loss/accuracy metrics via callbacks for SSE.

import { finetune } from '@qvac/sdk';
import type { FinetuneProgress, FinetuneResult, FinetuneHandle } from '@qvac/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface CorrectionEntry {
  id: string;
  timestamp: string;
  originalQuery: string;
  originalResponse: string;
  correctedResponse: string;
  technician: string;
  documentId?: string;
}

export interface FinetuneStatus {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  totalCorrections: number;
  minimumRequired: number;
  canTrain: boolean;
  lastTrainedAt: string | null;
  currentEpoch?: number;
  currentBatch?: number;
  totalBatches?: number;
  latestLoss?: number | null;
  latestAccuracy?: number | null;
  elapsedMs?: number;
  etaMs?: number;
}

export type FinetuneEventCallback = (event: FinetuneEvent) => void;

export interface FinetuneEvent {
  type: 'progress' | 'completed' | 'error' | 'correction_saved';
  data: Record<string, unknown>;
  timestamp: string;
}

// ────────────────────────────────────────────
// Fine-Tune Manager
// ────────────────────────────────────────────

export class FinetuneManager {
  private correctionsPath: string;
  private datasetDir: string;
  private outputDir: string;
  private corrections: CorrectionEntry[] = [];
  private status: FinetuneStatus['status'] = 'idle';
  private lastTrainedAt: string | null = null;
  private currentHandle: FinetuneHandle | null = null;
  private latestProgress: FinetuneProgress | null = null;
  private listeners: FinetuneEventCallback[] = [];
  private minimumCorrections: number;

  constructor(dataDir: string, minimumCorrections = 5) {
    this.correctionsPath = path.join(dataDir, 'corrections.jsonl');
    this.datasetDir = path.join(dataDir, 'finetune_dataset');
    this.outputDir = path.join(dataDir, 'lora_output');
    this.minimumCorrections = minimumCorrections;

    // Ensure directories exist
    fs.mkdirSync(this.datasetDir, { recursive: true });
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Load existing corrections
    this.loadCorrections();
  }

  /**
   * Load corrections from the JSONL file on disk.
   */
  private loadCorrections(): void {
    if (!fs.existsSync(this.correctionsPath)) return;

    try {
      const content = fs.readFileSync(this.correctionsPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      this.corrections = lines.map((line) => {
        try {
          return JSON.parse(line) as CorrectionEntry;
        } catch {
          return null;
        }
      }).filter((e): e is CorrectionEntry => e !== null);

      console.log(`  📝 Loaded ${this.corrections.length} existing corrections from disk.`);
    } catch (err) {
      console.warn(`  ⚠ Could not load corrections: ${(err as Error).message}`);
    }
  }

  /**
   * Save a technician correction to disk.
   */
  saveCorrection(correction: Omit<CorrectionEntry, 'id' | 'timestamp'>): CorrectionEntry {
    const entry: CorrectionEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...correction,
    };

    // Append to JSONL file
    fs.appendFileSync(this.correctionsPath, JSON.stringify(entry) + '\n', 'utf-8');
    this.corrections.push(entry);

    console.log(`  📝 Correction saved (total: ${this.corrections.length})`);

    this.emit({
      type: 'correction_saved',
      data: {
        correctionId: entry.id,
        totalCorrections: this.corrections.length,
        canTrain: this.corrections.length >= this.minimumCorrections,
      },
      timestamp: entry.timestamp,
    });

    return entry;
  }

  /**
   * Convert corrections to a chat-format JSONL dataset for LoRA training.
   * Each entry becomes a user/assistant conversation pair.
   */
  private prepareDataset(): string {
    const datasetPath = path.join(this.datasetDir, 'train.jsonl');
    const lines: string[] = [];

    for (const correction of this.corrections) {
      const entry = {
        messages: [
          {
            role: 'user',
            content: correction.originalQuery,
          },
          {
            role: 'assistant',
            content: correction.correctedResponse,
          },
        ],
      };
      lines.push(JSON.stringify(entry));
    }

    fs.writeFileSync(datasetPath, lines.join('\n'), 'utf-8');
    console.log(`  📦 Prepared training dataset: ${lines.length} examples -> ${datasetPath}`);

    return this.datasetDir;
  }

  /**
   * Start a real LoRA fine-tuning run using the QVAC SDK.
   * Streams progress metrics back via registered callbacks.
   */
  async startTraining(modelId: string): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Fine-tuning is already running.');
    }

    if (this.corrections.length < this.minimumCorrections) {
      throw new Error(
        `Not enough corrections. Have ${this.corrections.length}, need at least ${this.minimumCorrections}.`
      );
    }

    this.status = 'running';
    this.latestProgress = null;

    try {
      // 1. Prepare the dataset from accumulated corrections
      const trainDir = this.prepareDataset();

      console.log(`\n🧪 Starting LoRA fine-tuning...`);
      console.log(`   Model: ${modelId}`);
      console.log(`   Dataset: ${this.corrections.length} corrections`);
      console.log(`   Output: ${this.outputDir}`);

      // 2. Launch the real finetune job via QVAC SDK
      const handle = finetune({
        modelId,
        options: {
          trainDatasetDir: trainDir,
          validation: { type: 'split', fraction: 0.1 },
          outputParametersDir: this.outputDir,
          numberOfEpochs: 3,
          learningRate: 2e-4,
          batchSize: 1,
          microBatchSize: 1,
          loraRank: 16,
          loraAlpha: 32,
          contextLength: 2048,
          assistantLossOnly: true,
          lrScheduler: 'cosine',
          warmupRatio: 0.1,
        },
      });

      this.currentHandle = handle;

      // 3. Stream progress events in real-time
      for await (const progress of handle.progressStream) {
        this.latestProgress = progress;

        this.emit({
          type: 'progress',
          data: {
            is_train: progress.is_train,
            loss: progress.loss,
            loss_uncertainty: progress.loss_uncertainty,
            accuracy: progress.accuracy,
            accuracy_uncertainty: progress.accuracy_uncertainty,
            global_steps: progress.global_steps,
            current_epoch: progress.current_epoch,
            current_batch: progress.current_batch,
            total_batches: progress.total_batches,
            elapsed_ms: progress.elapsed_ms,
            eta_ms: progress.eta_ms,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Wait for the final result
      const result: FinetuneResult = await handle.result;
      this.status = result.status === 'COMPLETED' ? 'completed' : 'idle';
      this.lastTrainedAt = new Date().toISOString();
      this.currentHandle = null;

      console.log(`\n✅ Fine-tuning ${result.status}`);
      if (result.stats) {
        console.log(`   Final train_loss: ${result.stats.train_loss}`);
        console.log(`   Epochs completed: ${result.stats.epochs_completed}`);
        console.log(`   Global steps: ${result.stats.global_steps}`);
      }

      this.emit({
        type: 'completed',
        data: {
          status: result.status,
          stats: result.stats,
          outputDir: this.outputDir,
        },
        timestamp: this.lastTrainedAt,
      });
    } catch (err) {
      this.status = 'error';
      this.currentHandle = null;
      const errorMsg = (err as Error).message;
      console.error(`  ❌ Fine-tuning error: ${errorMsg}`);

      this.emit({
        type: 'error',
        data: { message: errorMsg },
        timestamp: new Date().toISOString(),
      });

      throw err;
    }
  }

  /**
   * Cancel a running fine-tuning job.
   */
  async cancelTraining(modelId: string): Promise<void> {
    if (this.status !== 'running') {
      throw new Error('No fine-tuning job is currently running.');
    }

    console.log('  🛑 Cancelling fine-tuning...');
    await finetune({ modelId, operation: 'cancel' });
    this.status = 'cancelled';
    this.currentHandle = null;
  }

  /**
   * Get the current fine-tuning status.
   */
  getStatus(): FinetuneStatus {
    return {
      status: this.status,
      totalCorrections: this.corrections.length,
      minimumRequired: this.minimumCorrections,
      canTrain: this.corrections.length >= this.minimumCorrections,
      lastTrainedAt: this.lastTrainedAt,
      currentEpoch: this.latestProgress?.current_epoch,
      currentBatch: this.latestProgress?.current_batch,
      totalBatches: this.latestProgress?.total_batches,
      latestLoss: this.latestProgress?.loss,
      latestAccuracy: this.latestProgress?.accuracy,
      elapsedMs: this.latestProgress?.elapsed_ms,
      etaMs: this.latestProgress?.eta_ms,
    };
  }

  /**
   * Get all corrections.
   */
  getCorrections(): CorrectionEntry[] {
    return [...this.corrections];
  }

  /**
   * Register event listeners for SSE broadcasting.
   */
  onEvent(callback: FinetuneEventCallback): void {
    this.listeners.push(callback);
  }

  /**
   * Remove an event listener.
   */
  removeListener(callback: FinetuneEventCallback): void {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  private emit(event: FinetuneEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Finetune event listener error:', err);
      }
    }
  }
}
