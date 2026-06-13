// ─── Edge MedTech Copilot — Express Server ───
// Serves the web UI and API endpoints on localhost.

import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import { PROJECT } from '../config.js';
import { createAPIRoutes } from './routes.js';
import { errorHandler, requestLogger } from './middleware.js';
import type { ModelManager } from '../models/manager.js';
import type { StructuredLogger } from '../logging/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

import type { RAG } from '@qvac/rag';
import type { SwarmManager } from './swarm.js';
import type { FinetuneManager } from './finetune.js';
import type { OCRManager } from './ocr.js';

export interface ServerDependencies {
  config: AppConfig;
  modelManager: ModelManager;
  logger?: StructuredLogger;
  // These will be injected once agents and RAG are initialized
  processQuery?: (
    query: string, 
    options: { uiLanguage?: 'en' | 'es', responseLanguage?: 'auto' | 'en' | 'es', evidenceMode?: 'original' | 'translated' | 'both', peerPublicKey?: string }, 
    documentId?: string, 
    imageBase64?: string
  ) => AsyncGenerator<{ type: string; data: unknown }>;
  getRagStatus?: () => { indexed_documents: number; total_chunks: number };
  rag?: RAG;
  swarmManager?: SwarmManager;
  finetuneManager?: FinetuneManager;
  ocrManager?: OCRManager;
}

/**
 * Create and configure the Express application.
 */
export function createApp(deps: ServerDependencies): express.Application {
  const app = express();

  // ── Middleware ──
  app.use(express.json({ limit: '10mb' })); // Increased for image uploads
  app.use(requestLogger);

  // ── Static files (Web UI) ──
  const publicDir = resolve(__dirname, '../ui/public');
  app.use(express.static(publicDir));

  // ── API Routes ──
  app.use('/api', createAPIRoutes(deps));

  // ── SPA fallback ──
  app.use((_req, res) => {
    res.sendFile(resolve(publicDir, 'index.html'));
  });

  // ── Error handler (must be last) ──
  app.use(errorHandler);

  return app;
}

/**
 * Start the HTTP server.
 */
export function startServer(
  app: express.Application,
  config: AppConfig,
  deps?: ServerDependencies
): Promise<void> {
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log(`\n🌐 ${PROJECT.name} is running!`);
      console.log(`   URL: http://${config.server.host}:${config.server.port}`);
      console.log(`   API: http://${config.server.host}:${config.server.port}/api/health\n`);
      resolve();
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down server...');
      if (deps?.swarmManager) {
        try {
          await deps.swarmManager.stopProvider();
        } catch (e) {
          console.error('Error stopping swarm provider:', e);
        }
      }
      if (deps?.rag) {
        try {
          await deps.rag.close();
          console.log('✅ RAG database closed.');
        } catch (e) {
          console.error('Error closing RAG:', e);
        }
      }
      server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
