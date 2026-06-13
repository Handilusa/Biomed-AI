// ─── Edge MedTech Copilot — Model Lifecycle Manager ───
// Handles loading, unloading, and tracking QVAC models.
// Wraps @qvac/sdk loadModel/unloadModel with lifecycle events and logging.

import { loadModel, unloadModel, translate } from '@qvac/sdk';
import { createRequire } from 'node:module';
// Bergamot NMT model assets exist at runtime but not in TS declarations
const _require = createRequire(import.meta.url);
const { BERGAMOT_EN_ES, BERGAMOT_ES_EN } = _require('@qvac/sdk');
import type { AppConfig } from '../config.js';
import type { LoadedModel, ModelManagerStatus, ModelRole } from '../types.js';

// ────────────────────────────────────────────
// Model Manager
// ────────────────────────────────────────────

export class ModelManager {
  private models: Map<ModelRole, LoadedModel> = new Map();
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Load the primary LLM model (MedPsy-4B Q4_K_M).
   * Used by both Technical and Medical agents with different system prompts.
   */
  async loadLLM(): Promise<string> {
    if (this.models.has('llm')) {
      console.log('ℹ LLM model already loaded, skipping.');
      return this.models.get('llm')!.modelId;
    }

    console.log(`🔄 Loading LLM model: ${this.config.models.llmFile}...`);
    console.log(`   (This may take 30-90 seconds on first run while the QVAC worker initializes)`);
    const startTime = Date.now();

    // Retry logic: the bare runtime RPC worker can take extra time on first cold start
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const waitSec = attempt * 5;
          console.log(`🔄 Retry ${attempt}/${MAX_RETRIES} — waiting ${waitSec}s before retrying...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
        }

        const modelId = await loadModel({
          modelSrc: this.config.models.llmPath,
          modelType: 'llm',
          modelConfig: { ctx_size: 4096 },
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ LLM loaded in ${elapsed}s (modelId: ${modelId})`);

        this.models.set('llm', {
          role: 'llm',
          modelId,
          filename: this.config.models.llmFile,
          loadedAt: new Date().toISOString(),
        });

        return modelId;
      } catch (err) {
        lastError = err as Error;
        console.warn(`⚠ LLM load attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('LLM model loading failed after all retries');
  }

  /**
   * Load the embedding model for RAG.
   */
  async loadEmbeddings(): Promise<string> {
    if (this.models.has('embeddings')) {
      console.log('ℹ Embedding model already loaded, skipping.');
      return this.models.get('embeddings')!.modelId;
    }

    console.log(`🔄 Loading embedding model: ${this.config.models.embedFile}...`);
    const startTime = Date.now();

    const modelId = await loadModel({
      modelSrc: this.config.models.embedPath,
      modelType: 'embeddings',
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Embeddings loaded in ${elapsed}s (modelId: ${modelId})`);

    this.models.set('embeddings', {
      role: 'embeddings',
      modelId,
      filename: this.config.models.embedFile,
      loadedAt: new Date().toISOString(),
    });

    return modelId;
  }

  /**
   * Load NMT (Translation) model on demand.
   */
  async loadNMT(langPair: 'en_es' | 'es_en'): Promise<string> {
    const role: ModelRole = `nmt_${langPair}`;
    if (this.models.has(role)) {
      return this.models.get(role)!.modelId;
    }

    const modelSrc = langPair === 'en_es' ? BERGAMOT_EN_ES : BERGAMOT_ES_EN;
    
    console.log(`🔄 Loading NMT model: ${langPair}...`);
    const startTime = Date.now();

    const modelId = await loadModel({
      modelSrc: modelSrc as any, // QVAC SDK expects the asset object
      modelType: 'nmt',
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ NMT loaded in ${elapsed}s (modelId: ${modelId})`);

    this.models.set(role, {
      role,
      modelId,
      filename: `bergamot_${langPair}`,
      loadedAt: new Date().toISOString(),
    });

    return modelId;
  }

  /**
   * Translate text using local NMT models.
   */
  async translateText(text: string, langPair: 'en_es' | 'es_en'): Promise<string> {
    try {
      if (!text || text.trim() === '') return text;
      const modelId = await this.loadNMT(langPair);
      const result = await translate({ text, modelId });
      return (result as any).translatedText || text;
    } catch (err) {
      console.error(`❌ Translation error (${langPair}):`, err);
      return text;
    }
  }

  /**
   * Load all required base models.
   */
  async loadAll(): Promise<void> {
    console.log('\n═══ Loading QVAC Base Models ═══');
    await this.loadLLM();
    await this.loadEmbeddings();
    console.log('═══ Base models loaded ═══\n');
  }

  /**
   * Unload a specific model by role.
   */
  async unload(role: ModelRole): Promise<void> {
    const model = this.models.get(role);
    if (!model) {
      console.warn(`⚠ No ${role} model loaded to unload.`);
      return;
    }

    console.log(`🔄 Unloading ${role} model: ${model.filename}...`);
    await unloadModel({ modelId: model.modelId });
    this.models.delete(role);
    console.log(`✅ ${role} model unloaded.`);
  }

  /**
   * Unload all models for clean shutdown.
   */
  async unloadAll(): Promise<void> {
    console.log('\n═══ Unloading all models ═══');
    for (const role of this.models.keys()) {
      await this.unload(role);
    }
    console.log('═══ All models unloaded ═══\n');
  }

  /**
   * Get the modelId for a given role.
   * @throws if the model is not loaded.
   */
  getModelId(role: ModelRole): string {
    const model = this.models.get(role);
    if (!model) {
      throw new Error(`Model for role "${role}" is not loaded. Call loadAll() first.`);
    }
    return model.modelId;
  }

  /**
   * Get the filename for a given role.
   */
  getModelFilename(role: ModelRole): string {
    const model = this.models.get(role);
    return model?.filename ?? 'unknown';
  }

  /**
   * Check if a model is loaded for a given role.
   */
  isLoaded(role: ModelRole): boolean {
    return this.models.has(role);
  }

  /**
   * Get overall status of the model manager.
   */
  getStatus(): ModelManagerStatus {
    return {
      models: Array.from(this.models.values()),
      totalModelsLoaded: this.models.size,
    };
  }
}
