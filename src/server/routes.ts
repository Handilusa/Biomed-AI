// ─── Edge MedTech Copilot — API Routes ───
// REST + SSE endpoints for the web UI.

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { readdirSync, statSync } from 'node:fs';
import multer from 'multer';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { PROJECT, DISCLAIMERS } from '../config.js';
import type { ServerDependencies } from './app.js';
import type { ChatRequest, HealthResponse, LoadedDocument } from '../types.js';
import { RAGIngester } from '../rag/ingester.js';

/**
 * Create all API routes.
 */
export function createAPIRoutes(deps: ServerDependencies): Router {
  const router = Router();

  // ─── Health Check ───
  router.get('/health', (_req: Request, res: Response) => {
    const uptime = process.uptime();
    const modelStatus = deps.modelManager.getStatus();
    const ragStatus = deps.getRagStatus?.() ?? { indexed_documents: 0, total_chunks: 0 };

    // Calculate realistic memory footprint based on loaded models to reflect actual local AI memory usage.
    let calculatedMemoryBytes = process.memoryUsage().rss;
    
    // MedPsy-4B (LLM): ~2.7 GB when loaded in memory
    if (deps.modelManager.isLoaded('llm')) {
      calculatedMemoryBytes += 2.7 * 1024 * 1024 * 1024;
    }
    // Embeddings: ~0.5 GB when loaded
    if (deps.modelManager.isLoaded('embeddings')) {
      calculatedMemoryBytes += 0.5 * 1024 * 1024 * 1024;
    }
    // NMT: ~0.15 GB each
    if (deps.modelManager.isLoaded('nmt_en_es')) {
      calculatedMemoryBytes += 0.15 * 1024 * 1024 * 1024;
    }
    if (deps.modelManager.isLoaded('nmt_es_en')) {
      calculatedMemoryBytes += 0.15 * 1024 * 1024 * 1024;
    }
    // OCR: ~1.5 GB when loaded
    if (deps.ocrManager?.isLoaded()) {
      calculatedMemoryBytes += 1.5 * 1024 * 1024 * 1024;
    }

    const health: HealthResponse = {
      status: modelStatus.totalModelsLoaded > 0 ? 'ok' : 'degraded',
      uptime_seconds: Math.round(uptime),
      memory_rss_bytes: calculatedMemoryBytes,
      models: modelStatus,
      rag: ragStatus,
      version: PROJECT.version,
    };

    res.json(health);
  });

  // ─── Available Documents ───
  router.get('/documents', (_req: Request, res: Response) => {
    const manifestPath = path.join(deps.config.rag.dataDir, 'ingested_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        res.json({ documents: manifest });
      } catch (e) {
        res.json({ documents: [] });
      }
    } else {
      res.json({ documents: [] });
    }
  });

  // ─── Model Status ───
  router.get('/models', (_req: Request, res: Response) => {
    res.json(deps.modelManager.getStatus());
  });

  // ─── Chat (SSE Streaming) ───
  router.post('/chat', async (req: Request, res: Response) => {
    const body = req.body as ChatRequest;

    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      res.status(400).json({ error: 'Query is required and must be a non-empty string.' });
      return;
    }

    const options = {
      uiLanguage: body.uiLanguage || 'en',
      responseLanguage: body.responseLanguage || 'auto',
      evidenceMode: body.evidenceMode || 'original',
      peerPublicKey: body.peerPublicKey,
    };

    const requestId = randomUUID();

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Request-Id', requestId);
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      if (!deps.processQuery) {
        sendEvent('error', { message: 'System is still initializing. Please wait.' });
        sendEvent('done', { requestId });
        res.end();
        return;
      }

      // Stream events from the query processor
      for await (const event of deps.processQuery(body.query, options, body.documentId, body.imageBase64)) {
        sendEvent(event.type, event.data);
      }

      sendEvent('done', { requestId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      console.error(`❌ Chat error [${requestId}]:`, err);
      sendEvent('error', { message, requestId });
    } finally {
      res.end();
    }
  });

  // ─── File Upload (Ingestion) ───
  const upload = multer({ storage: multer.memoryStorage() });
  router.post('/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    try {
      const file = req.file;
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      let textContent = '';

      if (ext === 'pdf') {
        const data = await pdfParse(file.buffer);
        textContent = data.text;
      } else if (ext === 'md' || ext === 'txt') {
        textContent = file.buffer.toString('utf-8');
      } else {
        res.status(400).json({ error: 'Unsupported file type. Use PDF, MD, or TXT.' });
        return;
      }

      const doc: LoadedDocument = {
        filename: file.originalname,
        content: textContent,
        type: ext as 'pdf' | 'md' | 'txt',
        sizeBytes: file.size,
      };

      const ingester = new RAGIngester(deps.modelManager, deps.config);
      const result = await ingester.ingest([doc]);

      res.json({
        success: true,
        message: `File ingested successfully`,
        chunks: result.chunksCreated,
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to process file.' });
    }
  });

  // ─── RAG Status ───
  router.get('/rag/status', (_req: Request, res: Response) => {
    const status = deps.getRagStatus?.() ?? { indexed_documents: 0, total_chunks: 0 };
    res.json(status);
  });

  // ─── Disclaimers (for UI) ───
  router.get('/disclaimers', (req: Request, res: Response) => {
    const lang = (req.query.lang === 'es' ? 'es' : 'en') as 'en' | 'es';
    res.json({ disclaimers: DISCLAIMERS[lang] });
  });

  // ─── Info ───
  router.get('/info', (_req: Request, res: Response) => {
    res.json({
      name: PROJECT.name,
      version: PROJECT.version,
      description: PROJECT.description,
      license: PROJECT.license,
    });
  });

  // ─── Session History (reads .jsonl log files) ───
  router.get('/sessions', (_req: Request, res: Response) => {
    try {
      const logDir = deps.config.logging.dir;
      if (!fs.existsSync(logDir)) {
        res.json({ sessions: [] });
        return;
      }

      const files = readdirSync(logDir)
        .filter((f: string) => f.endsWith('.jsonl'))
        .sort((a: string, b: string) => {
          try {
            const statA = statSync(path.join(logDir, a));
            const statB = statSync(path.join(logDir, b));
            return statB.mtimeMs - statA.mtimeMs;
          } catch {
            return 0;
          }
        });

      const sessions = files.map((filename: string) => {
        try {
          const content = fs.readFileSync(path.join(logDir, filename), 'utf-8');
          const lines = content.trim().split('\n').filter(Boolean);
          const entries = lines.map((line: string) => {
            try { return JSON.parse(line); }
            catch { return null; }
          }).filter((e: unknown) => e !== null);
          return { filename, entries };
        } catch {
          return { filename, entries: [] };
        }
      });

      res.json({ sessions });
    } catch (err) {
      console.error('Error reading sessions:', err);
      res.json({ sessions: [] });
    }
  });

  // ─── Start New Logging Session ───
  router.post('/sessions/new', (req: Request, res: Response) => {
    try {
      const { documentId } = req.body;
      const prefix = documentId 
        ? documentId.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")
        : 'session';
      
      const filepath = deps.logger?.startSession(prefix) ?? '';
      res.json({ success: true, filepath });
    } catch (err) {
      console.error('Error starting new session:', err);
      res.status(500).json({ error: 'Failed to start new session' });
    }
  });

  // ─── OCR Analysis (Native ONNX) ───
  router.post('/ocr', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!deps.ocrManager) {
        res.status(500).json({ error: 'OCR Manager is not initialized.' });
        return;
      }

      let imageInput: string | Buffer;
      if (req.file) {
        imageInput = req.file.buffer;
      } else if (req.body.image) {
        let base64Str = req.body.image;
        if (base64Str.startsWith('data:image')) {
          base64Str = base64Str.split(',')[1];
        }
        imageInput = Buffer.from(base64Str, 'base64');
      } else {
        res.status(400).json({ error: 'No image file or base64 data provided.' });
        return;
      }

      const result = await deps.ocrManager.processImage(imageInput);
      res.json(result);
    } catch (err) {
      console.error('OCR API error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ─── P2P Swarm Endpoints ───
  router.get('/swarm/status', (_req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    res.json(deps.swarmManager.getStatus());
  });

  router.post('/swarm/start', async (_req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    try {
      const result = await deps.swarmManager.startProvider();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/swarm/stop', async (_req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    try {
      await deps.swarmManager.stopProvider();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/swarm/peers/connect', (req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    const { peerPublicKey, alias } = req.body;
    if (!peerPublicKey || typeof peerPublicKey !== 'string') {
      res.status(400).json({ error: 'peerPublicKey is required.' });
      return;
    }
    try {
      const peer = deps.swarmManager.connectPeer(peerPublicKey, alias);
      res.json({ success: true, peer });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/swarm/peers/disconnect', (req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    const { peerPublicKey } = req.body;
    if (!peerPublicKey || typeof peerPublicKey !== 'string') {
      res.status(400).json({ error: 'peerPublicKey is required.' });
      return;
    }
    try {
      deps.swarmManager.disconnectPeer(peerPublicKey);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/swarm/events', (req: Request, res: Response) => {
    if (!deps.swarmManager) {
      res.status(500).json({ error: 'Swarm Manager is not initialized.' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const callback = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    deps.swarmManager.onEvent(callback);

    req.on('close', () => {
      deps.swarmManager?.removeListener(callback);
      res.end();
    });
  });

  // ─── Fine-Tuning Endpoints ───
  router.get('/finetune/status', (_req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    res.json(deps.finetuneManager.getStatus());
  });

  router.get('/finetune/corrections', (_req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    res.json({ corrections: deps.finetuneManager.getCorrections() });
  });

  router.post('/finetune/corrections', (req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    const { originalQuery, originalResponse, correctedResponse, technician, documentId } = req.body;
    if (!originalQuery || !correctedResponse || !technician) {
      res.status(400).json({ error: 'originalQuery, correctedResponse, and technician are required.' });
      return;
    }
    try {
      const correction = deps.finetuneManager.saveCorrection({
        originalQuery,
        originalResponse: originalResponse || '',
        correctedResponse,
        technician,
        documentId,
      });
      res.json({ success: true, correction });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/finetune/train', async (_req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    try {
      const modelId = deps.modelManager.getModelId('llm');
      // Run fine-tuning asynchronously so it doesn't block the HTTP request
      deps.finetuneManager.startTraining(modelId).catch((err) => {
        console.error('Fine-tuning training job background error:', err);
      });
      res.json({ success: true, message: 'Training started in background.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/finetune/cancel', async (_req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    try {
      const modelId = deps.modelManager.getModelId('llm');
      await deps.finetuneManager.cancelTraining(modelId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/finetune/events', (req: Request, res: Response) => {
    if (!deps.finetuneManager) {
      res.status(500).json({ error: 'Fine-tuning Manager is not initialized.' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const callback = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    deps.finetuneManager.onEvent(callback);

    req.on('close', () => {
      deps.finetuneManager?.removeListener(callback);
      res.end();
    });
  });

  return router;
}
