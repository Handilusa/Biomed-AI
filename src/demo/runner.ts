// ─── Biomed Field Copilot — Demo Run Orchestrator ───
// Runs the standard demo query battery and generates evidence logs.
// Usage: npm run demo:log

import { randomUUID } from 'node:crypto';
import { loadConfig, validateConfig } from '../config.js';
import { ModelManager } from '../models/manager.js';
import { RAGRetriever } from '../rag/retriever.js';
import { StructuredLogger } from '../logging/logger.js';
import { MetricsCollector } from '../logging/metrics.js';
import { DEMO_QUERIES } from './queries.js';
import { Orchestrator } from '../agents/orchestrator.js';

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║      Biomed Field Copilot — Demo Run             ║');
  console.log('║      Generating evidence bundle logs              ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const config = loadConfig();
  validateConfig(config);

  const modelManager = new ModelManager(config);
  const logger = new StructuredLogger(config.logging.dir);
  const metrics = new MetricsCollector();

  try {
    await modelManager.loadAll();
    const retriever = new RAGRetriever(modelManager, config);
    const orchestrator = new Orchestrator(modelManager, config, retriever);

    const logFile = logger.startSession('demo_run');

    for (const query of DEMO_QUERIES) {
      const requestId = randomUUID();
      console.log(`\n📋 [${query.id}] ${query.description}`);
      console.log(`   Query: "${query.query.substring(0, 80)}..."`);
      
      metrics.startRequest(requestId);
      
      const gen = orchestrator.processQuery(query.query, { uiLanguage: 'en', responseLanguage: 'en', evidenceMode: 'original' }, query.documentId);
      
      let triageCategory = '';
      let finalDisposition = '';
      
      for await (const event of gen) {
        if (event.type === 'triage') {
          triageCategory = (event.data as any).category;
          console.log(`   Triage: ${triageCategory} (Expected: ${query.expectedCategory})`);
        } else if (event.type === 'done') {
          finalDisposition = (event.data as any).finalDisposition || '';
          console.log(`   Final Disposition: ${finalDisposition}`);
        }
      }
      
      console.log('─'.repeat(80));
    }

    const session = logger.endSession();
    const csvPath = logger.exportCSV(session.filepath);

    console.log(`\n📁 Logs: ${session.filepath}`);
    console.log(`📁 CSV:  ${csvPath}`);
    
  } catch (err) {
    console.error('\n❌ Demo run failed:', err);
    process.exit(1);
  } finally {
    try {
      await modelManager.unloadAll();
    } catch { /* ignore */ }
  }

  console.log('\n🎉 Demo run complete!');
  process.exit(0);
}

main();
