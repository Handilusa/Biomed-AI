// ─── Edge MedTech Copilot - Document Ingestion CLI Script ───
// Usage: npm run ingest

import { loadConfig, validateConfig } from '../src/config.js';
import { ModelManager } from '../src/models/manager.js';
import { loadDocuments } from '../src/rag/loader.js';
import { RAGIngester } from '../src/rag/ingester.js';

async function main() {
  console.log('═══ Edge MedTech Copilot - Document Ingestion ═══\n');

  const config = loadConfig();
  const warnings = validateConfig(config);
  if (warnings.length > 0) {
    console.log('⚠ Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
    console.log();
  }

  // Load models
  const modelManager = new ModelManager(config);

  console.log('📦 Loading embedding model...');
  await modelManager.loadEmbeddings();

  // Scan documents
  console.log(`\n📂 Scanning data directory: ${config.rag.dataDir}`);
  const documents = await loadDocuments(config.rag.dataDir);

  if (documents.length === 0) {
    console.log('❌ No documents found. Add files to the data/ directory.');
    process.exit(1);
  }

  console.log(`\n📄 Found ${documents.length} documents:`);
  for (const doc of documents) {
    console.log(`   - ${doc.filename} (${doc.type}, ${(doc.sizeBytes / 1024).toFixed(1)} KB)`);
  }

  // Ingest
  const ingester = new RAGIngester(modelManager, config);
  const result = await ingester.ingest(documents);

  console.log('\n✅ Ingestion complete!');
  console.log(`   Documents processed: ${result.documentsProcessed}`);
  console.log(`   Chunks created: ${result.chunksCreated}`);
  console.log(`   Time: ${(result.timeMs / 1000).toFixed(1)}s`);

  // Cleanup
  await modelManager.unloadAll();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});
