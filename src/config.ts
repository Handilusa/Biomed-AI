// ─── Edge MedTech Copilot - Centralized Configuration ───
// Reads from environment variables with sensible defaults.
// All config values are validated at startup.

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Load .env file manually into process.env if it exists
function loadEnv() {
  const envPath = resolve('.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // Remove surrounding quotes if present
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn(`⚠ Failed to parse .env file: ${(err as Error).message}`);
    }
  }
}

// ────────────────────────────────────────────
// Config Interface
// ────────────────────────────────────────────

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  models: {
    dir: string;
    llmFile: string;
    llmPath: string;
    embedFile: string;
    embedPath: string;
  };
  rag: {
    dbPath: string;
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    dataDir: string;
  };
  logging: {
    dir: string;
    level: string;
  };
  ui: {
    lang: 'en' | 'es';
  };
}

// ────────────────────────────────────────────
// Environment reader helpers
// ────────────────────────────────────────────

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    console.warn(`⚠ Invalid integer for ${key}="${val}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

// ────────────────────────────────────────────
// Build Config
// ────────────────────────────────────────────

export function loadConfig(): AppConfig {
  loadEnv();
  const modelDir = resolve(env('MODEL_DIR', './models'));
  const llmFile = env('LLM_MODEL_FILE', 'MedPsy-4B-Q4_K_M.gguf');
  const embedFile = env('EMBED_MODEL_FILE', 'nomic-embed-text-v1.5.Q4_K_M.gguf');

  const config: AppConfig = {
    server: {
      port: envInt('PORT', 3000),
      host: env('HOST', 'localhost'),
    },
    models: {
      dir: modelDir,
      llmFile,
      llmPath: resolve(modelDir, llmFile),
      embedFile,
      embedPath: resolve(modelDir, embedFile),
    },
    rag: {
      dbPath: resolve(env('RAG_DB_PATH', './rag_index.sqlite')),
      chunkSize: envInt('RAG_CHUNK_SIZE', 512),
      chunkOverlap: envInt('RAG_CHUNK_OVERLAP', 50),
      topK: envInt('RAG_TOP_K', 5),
      dataDir: resolve('./data'),
    },
    logging: {
      dir: resolve(env('LOG_DIR', './logs')),
      level: env('LOG_LEVEL', 'info'),
    },
    ui: {
      lang: env('UI_LANG', 'en') as 'en' | 'es',
    },
  };

  return config;
}

// ────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────

export function validateConfig(config: AppConfig): string[] {
  const warnings: string[] = [];

  if (!existsSync(config.models.dir)) {
    warnings.push(`Model directory not found: ${config.models.dir}. Create it and place GGUF files inside.`);
  }

  if (!existsSync(config.models.llmPath)) {
    warnings.push(`LLM model not found: ${config.models.llmPath}. Run 'npm run download:models' to fetch it.`);
  }

  if (!existsSync(config.models.embedPath)) {
    warnings.push(`Embedding model not found: ${config.models.embedPath}. Run 'npm run download:models' to fetch it.`);
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    warnings.push(`Invalid port: ${config.server.port}`);
  }

  if (config.rag.chunkSize < 100 || config.rag.chunkSize > 2048) {
    warnings.push(`Chunk size ${config.rag.chunkSize} is outside recommended range (100–2048)`);
  }

  return warnings;
}

// ────────────────────────────────────────────
// Singleton
// ────────────────────────────────────────────

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

/** Project metadata */
export const PROJECT = {
  name: 'Biomed Field Copilot',
  version: '0.1.0',
  description: 'Local multi-agent AI assistant for biomedical equipment technicians',
  license: 'Apache-2.0',
} as const;

/** Medical disclaimer texts - bilingual */
export const DISCLAIMERS = {
  en: [
    '⚕️ This tool is for educational and support purposes only - not for clinical diagnosis or treatment.',
    '🏥 Final clinical decisions must be made by qualified healthcare professionals.',
    '⚠️ This tool is not a regulated medical device. Any commercial use requires independent legal/regulatory analysis.',
  ],
  es: [
    '⚕️ Esta herramienta es solo para fines educativos y de soporte - no para diagnóstico ni tratamiento clínico.',
    '🏥 Las decisiones clínicas finales deben ser tomadas por profesionales sanitarios cualificados.',
    '⚠️ Esta herramienta no es un dispositivo médico regulado. Cualquier uso comercial requiere análisis legal/regulatorio independiente.',
  ],
} as const;
