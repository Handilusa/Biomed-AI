// ─── Edge MedTech Copilot - Model Download Helper ───
// Downloads MedPsy GGUF models from HuggingFace.
// Usage: npm run download:models

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig } from '../src/config.js';

interface ModelDownload {
  name: string;
  filename: string;
  url: string;
  sizeApprox: string;
}

const MODELS: ModelDownload[] = [
  {
    name: 'MedPsy-4B Q4_K_M (imatrix calibrated Main LLM)',
    filename: 'medpsy-4b-q4_k_m-imat.gguf',
    url: 'https://huggingface.co/qvac/MedPsy-4B-GGUF/resolve/main/medpsy-4b-q4_k_m-imat.gguf',
    sizeApprox: '~2.7 GB',
  },
  {
    name: 'Nomic Embed Text v1.5 Q4_K_M (Embeddings model for RAG)',
    filename: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    sizeApprox: '~80 MB',
  },
];

async function main() {
  console.log('═══ Edge MedTech Copilot - Model Downloader ═══\n');

  const config = loadConfig();
  const modelDir = config.models.dir;

  // Create models directory
  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true });
    console.log(`📁 Created model directory: ${modelDir}`);
  }

  console.log(`📁 Model directory: ${modelDir}\n`);

  for (const model of MODELS) {
    const filePath = resolve(modelDir, model.filename);

    if (existsSync(filePath)) {
      console.log(`✅ ${model.name} - already downloaded`);
      continue;
    }

    console.log(`⬇️  Downloading ${model.name} (${model.sizeApprox})...`);
    console.log(`   URL: ${model.url}`);
    console.log(`   Destination: ${filePath}`);

    try {
      // Use curl or wget - they're commonly available
      // Try curl first (available on Windows 10+, macOS, Linux)
      execSync(`curl -L -o "${filePath}" "${model.url}" --progress-bar`, {
        stdio: 'inherit',
      });
      console.log(`✅ ${model.name} - downloaded successfully\n`);
    } catch {
      console.error(`❌ Failed to download ${model.name}.`);
      console.log('   You can download it manually from:');
      console.log(`   ${model.url}`);
      console.log(`   Place it in: ${filePath}\n`);
    }
  }

  console.log('\n═══ Download complete ═══');
  console.log('Next steps:');
  console.log('  1. npm run dev    - Start the development server');
  console.log('  2. npm run ingest - Index documents for RAG');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
