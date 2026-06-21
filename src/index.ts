// ─── Biomed Field Copilot - Main Entry Point ───
// Initializes all systems and starts the web server.

import { loadConfig, validateConfig } from './config.js';
import { ModelManager } from './models/manager.js';
import { RAGRetriever } from './rag/retriever.js';
import { RAGIngester } from './rag/ingester.js';
import { loadDocuments } from './rag/loader.js';
import { StructuredLogger } from './logging/logger.js';
import { MetricsCollector } from './logging/metrics.js';
import { createApp, startServer } from './server/app.js';
import { Orchestrator } from './agents/orchestrator.js';
import { SessionStore } from './memory/sessionStore.js';
import { SwarmManager } from './server/swarm.js';
import { FinetuneManager } from './server/finetune.js';
import { OCRManager } from './server/ocr.js';
import { RAG, HyperDBAdapter } from '@qvac/rag';
import Corestore from 'corestore';
import path from 'node:path';
import { embed } from '@qvac/sdk';
import { randomUUID } from 'node:crypto';
import type { LogEntry, TriageCategory, FinalDisposition } from './types.js';

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║       Biomed Field Copilot v1.4.0                ║');
  console.log('║       100% Local AI • Powered by QVAC            ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // ─── 1. Load & validate configuration ───
  const config = loadConfig();
  const warnings = validateConfig(config);

  if (warnings.length > 0) {
    console.log('⚠ Configuration warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
    console.log('  (The server will start, but some features may not work until resolved.)\n');
  }

  // ─── 2. Initialize model manager ───
  const modelManager = new ModelManager(config);

  // ─── 3. Initialize logging ───
  const logger = new StructuredLogger(config.logging.dir);
  const metrics = new MetricsCollector();
  logger.startSession('server');

  // ─── 4. Initialize RAG components ───
  const storePath = path.resolve(config.rag.dataDir, 'hyperdb');
  console.log(`📁 Initializing Corestore at ${storePath}...`);
  const store = new Corestore(storePath);
  await store.ready();

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

  const rag = new RAG({
    embeddingFunction,
    dbAdapter,
  });

  await rag.ready();
  console.log('✅ HyperDB RAG Engine ready!');

  const retriever = new RAGRetriever(modelManager, config, rag);
  const ingester = new RAGIngester(modelManager, config, rag);

  // ─── Swarm, Finetuning, OCR Managers ───
  const swarmManager = new SwarmManager();
  const finetuneManager = new FinetuneManager(config.rag.dataDir);
  const ocrManager = new OCRManager();

  // ─── 5. Initialize Session Store & Orchestrator pipeline ───
  const sessionStore = new SessionStore({ maxTurns: 10, ttlMs: 60 * 60 * 1000 });
  console.log('✅ Session Store initialized (in-memory, TTL: 1h)');
  const orchestrator = new Orchestrator(modelManager, config, retriever, sessionStore);

  // ─── 6. Try to load models (non-blocking on failure) ───
  let modelsLoaded = false;
  try {
    await modelManager.loadAll();
    modelsLoaded = true;

    // Auto-ingest documents if available
    try {
      console.log('📚 Checking for documents to ingest...');
      const docs = await loadDocuments(config.rag.dataDir);
      if (docs.length > 0) {
        await ingester.ingest(docs);
      } else {
        console.log('  No documents found in data/ directory.\n');
      }
    } catch (err) {
      console.warn('⚠ RAG ingestion skipped:', (err as Error).message);
    }
  } catch (err) {
    console.error('⚠ Model loading failed:', (err as Error).message);
    console.log('  The server will start without AI capabilities.');
    console.log('  Place GGUF models in the models/ directory and restart.\n');
  }

  // ─── 7. Define the query processor (used by API routes) ───
  async function* processQuery(
    query: string,
    options: { 
      uiLanguage?: 'en' | 'es'; 
      responseLanguage?: 'auto' | 'en' | 'es'; 
      evidenceMode?: 'original' | 'translated' | 'both'; 
      peerPublicKey?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      sessionId?: string;
    },
    documentId?: string,
    imageBase64?: string
  ): AsyncGenerator<{ type: string; data: unknown }> {
    const requestId = randomUUID();
    metrics.startRequest(requestId);

    const uiLang = options.uiLanguage || 'en';

    if (!modelsLoaded) {
      yield {
        type: 'content_delta',
        data: {
          text: uiLang === 'es'
            ? '⚠️ Los modelos de IA no están cargados. Por favor, coloca los archivos GGUF en la carpeta models/ y reinicia el servidor.'
            : '⚠️ AI models are not loaded. Please place GGUF files in the models/ directory and restart the server.',
        },
      };
      return;
    }

    let finalQuery = query;

    // If an image is provided, extract OCR text first
    if (imageBase64) {
      const ocrText = await ocrManager.extractText(imageBase64);
      if (ocrText) {
        finalQuery += `\n[EXTRACTED OCR TEXT]: ${ocrText}`;
      }
    }

    let triageCategory: TriageCategory | undefined;
    let finalDisposition: FinalDisposition | undefined;
    let promptTokens = 0;
    let completionTokens = 0;
    let ttftMs = 0;
    let ragChunksUsed = 0;
    let hasDisclaimers = false;
    const toolsCalled: string[] = [];

    const startTime = performance.now();
    let firstTokenReceived = false;

    let assistantResponse = '';

    // Run the multi-agent orchestrator pipeline
    for await (const event of orchestrator.processQuery(finalQuery, options, documentId, imageBase64)) {
      if (event.type === 'triage') {
        triageCategory = (event.data as any).category;
      } else if (event.type === 'rag_sources') {
        const sources = (event.data as any).sources || [];
        ragChunksUsed = sources.length;
      } else if (event.type === 'disclaimers') {
        hasDisclaimers = true;
      } else if (event.type === 'tool_call') {
        const toolName = (event.data as any).name;
        if (toolName) toolsCalled.push(toolName);
      } else if (event.type === 'content_delta') {
        if (!firstTokenReceived) {
          ttftMs = Math.round(performance.now() - startTime);
          firstTokenReceived = true;
        }
        const text = (event.data as any).text || '';
        assistantResponse += text;
      } else if (event.type === 'agent_stats') {
        const agentStats = event.data as any;
        promptTokens += agentStats.prompt_tokens || 0;
        completionTokens += agentStats.completion_tokens || 0;
      } else if (event.type === 'done') {
        finalDisposition = (event.data as any).finalDisposition;
      }

      yield event;
    }

    const totalTimeMs = Math.round(performance.now() - startTime);
    const tokensPerSecond = completionTokens > 0 ? parseFloat((completionTokens / (totalTimeMs / 1000)).toFixed(1)) : 0;

    // Yield aggregated stats event for the UI
    const finalStats = {
      ttft_ms: ttftMs,
      tokens_per_second: tokensPerSecond,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_time_ms: totalTimeMs,
      model: modelManager.getModelFilename('llm'),
    };
    yield { type: 'stats', data: finalStats };

    // Log the entry!
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      request_id: requestId,
      agent: 'orchestrator',
      model: modelManager.getModelFilename('llm'),
      query,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      ttft_ms: ttftMs,
      tokens_per_second: tokensPerSecond,
      total_time_ms: totalTimeMs,
      rag_chunks_used: ragChunksUsed,
      has_disclaimers: hasDisclaimers,
      selected_document: documentId,
      triage_category: triageCategory,
      tools_called: toolsCalled,
      image_input_present: !!imageBase64,
      final_disposition: finalDisposition,
      assistant_response: assistantResponse,
      session_turn_count: options.sessionId ? sessionStore.getTurnCount(options.sessionId) : undefined,
    };
    logger.logEntry(logEntry);
  }

  // ─── 8. Create and start the server ───
  const serverDeps = {
    config,
    modelManager,
    logger,
    processQuery,
    getRagStatus: () => ingester.getStatus(),
    rag,
    swarmManager,
    finetuneManager,
    ocrManager,
  };

  const app = createApp(serverDeps);

  await startServer(app, config, serverDeps);

  console.log('💡 Tips:');
  console.log('   - Open the URL above in your browser to use the chat interface');
  console.log('   - Run "npm run demo:log" in another terminal to execute the benchmark demo');
  console.log('   - Press Ctrl+C to stop the server\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
