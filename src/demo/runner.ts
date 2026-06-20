// ─── Biomed Field Copilot - Demo Run Orchestrator ───
// Runs the standard demo query battery and generates evidence logs.
// Usage: npm run demo:log

import { randomUUID } from 'node:crypto';
import { loadConfig, validateConfig } from '../config.js';
import type { LogEntry, TriageCategory, FinalDisposition } from '../types.js';
import { ModelManager } from '../models/manager.js';
import { RAGRetriever } from '../rag/retriever.js';
import { StructuredLogger } from '../logging/logger.js';
import { MetricsCollector } from '../logging/metrics.js';
import { DEMO_QUERIES } from './queries.js';
import { Orchestrator } from '../agents/orchestrator.js';
import { RAG, HyperDBAdapter } from '@qvac/rag';
import Corestore from 'corestore';
import path from 'node:path';
import { embed } from '@qvac/sdk';

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║      Biomed Field Copilot - Demo Run             ║');
  console.log('║      Generating evidence bundle logs              ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const config = loadConfig();
  validateConfig(config);

  const modelManager = new ModelManager(config);
  const logger = new StructuredLogger(config.logging.dir);
  const metrics = new MetricsCollector();

  const logFile = logger.startSession('demo_run');

  try {
    console.log('\n═══ Loading QVAC Base Models ═══');
    const llmStartTime = Date.now();
    await modelManager.loadLLM();
    logger.logEvent('model_load', {
      model: modelManager.getModelFilename('llm'),
      duration_ms: Date.now() - llmStartTime,
      status: 'success'
    });

    const embedStartTime = Date.now();
    await modelManager.loadEmbeddings();
    logger.logEvent('model_load', {
      model: modelManager.getModelFilename('embeddings'),
      duration_ms: Date.now() - embedStartTime,
      status: 'success'
    });
    console.log('═══ Base models loaded ═══\n');

    const storePath = path.resolve(config.rag.dataDir, 'hyperdb');
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

    const retriever = new RAGRetriever(modelManager, config, rag);
    const orchestrator = new Orchestrator(modelManager, config, retriever);

    for (const query of DEMO_QUERIES) {
      const requestId = randomUUID();
      console.log(`\n📋 [${query.id}] ${query.description}`);
      console.log(`   Query: "${query.query.substring(0, 80)}..."`);
      
      metrics.startRequest(requestId);
      
      const gen = orchestrator.processQuery(query.query, { uiLanguage: 'en', responseLanguage: 'en', evidenceMode: 'original' }, query.documentId);
      
      let triageCategory: TriageCategory | undefined;
      let finalDisposition: FinalDisposition | undefined;
      let promptTokens = 0;
      let completionTokens = 0;
      let ttftMs = 0;
      let ragChunksUsed = 0;
      let hasDisclaimers = false;
      const toolsCalled: string[] = [];
      let assistantResponse = '';
      
      const startTime = performance.now();
      let firstTokenReceived = false;
      
      for await (const event of gen) {
        if (event.type === 'triage') {
          triageCategory = (event.data as any).category;
          console.log(`   Triage: ${triageCategory} (Expected: ${query.expectedCategory})`);
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
          console.log(`   Final Disposition: ${finalDisposition}`);
        }
      }
      
      const totalTimeMs = Math.round(performance.now() - startTime);
      const tokensPerSecond = completionTokens > 0 ? parseFloat((completionTokens / (totalTimeMs / 1000)).toFixed(1)) : 0;

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        agent: 'orchestrator',
        model: modelManager.getModelFilename('llm'),
        query: query.query,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        ttft_ms: ttftMs,
        tokens_per_second: tokensPerSecond,
        total_time_ms: totalTimeMs,
        rag_chunks_used: ragChunksUsed,
        has_disclaimers: hasDisclaimers,
        selected_document: query.documentId,
        triage_category: triageCategory,
        tools_called: toolsCalled,
        image_input_present: false,
        final_disposition: finalDisposition,
        assistant_response: assistantResponse,
      };
      
      logger.logEntry(logEntry);
      
      console.log('─'.repeat(80));
    }

  } catch (err) {
    console.error('\n❌ Demo run failed:', err);
    process.exit(1);
  } finally {
    try {
      if (modelManager.isLoaded('embeddings')) {
        const embedModelFile = modelManager.getModelFilename('embeddings');
        const unloadStartTime = Date.now();
        await modelManager.unload('embeddings');
        logger.logEvent('model_unload', {
          model: embedModelFile,
          duration_ms: Date.now() - unloadStartTime,
          status: 'success'
        });
      }
      if (modelManager.isLoaded('llm')) {
        const llmModelFile = modelManager.getModelFilename('llm');
        const unloadStartTime = Date.now();
        await modelManager.unload('llm');
        logger.logEvent('model_unload', {
          model: llmModelFile,
          duration_ms: Date.now() - unloadStartTime,
          status: 'success'
        });
      }
    } catch (unloadErr) {
      console.error('Failed to unload models cleanly:', unloadErr);
    }

    // End session AFTER unloads so all lifecycle events are in the same file
    const session = logger.endSession();
    const csvPath = logger.exportCSV(session.filepath);

    console.log(`\n📁 Logs: ${session.filepath}`);
    console.log(`📁 CSV:  ${csvPath}`);
  }

  console.log('\n🎉 Demo run complete!');
  process.exit(0);
}

main();
