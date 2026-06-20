import { loadConfig } from '../config.js';
import { ModelManager } from '../models/manager.js';
import { RAGRetriever } from '../rag/retriever.js';
import { RAG, HyperDBAdapter } from '@qvac/rag';
import Corestore from 'corestore';
import path from 'node:path';
import { embed } from '@qvac/sdk';

async function main() {
  const config = loadConfig();
  const modelManager = new ModelManager(config);
  await modelManager.loadEmbeddings();

  const storePath = path.resolve(config.rag.dataDir, 'hyperdb');
  const store = new Corestore(storePath);
  await store.ready();

  const dbAdapter = new HyperDBAdapter({
    store,
    dbName: 'biomed-rag-vectors',
  });

  const embeddingFunction = async (text: string | string[]) => {
    const result = await embed({
      modelId: modelManager.getModelId('embeddings'),
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

  const docId = 'manuals\\MT cardioline-2100.pdf';
  console.log(`=== Querying for doc: ${docId} ===`);

  const results = await retriever.search(
    'What are the most common error codes and troubleshooting steps',
    docId,
    5
  );

  console.log(`Found ${results.length} results:`);
  results.forEach((r, idx) => {
    console.log(`\n--- Result ${idx + 1} (Relevance: ${(r.similarity * 100).toFixed(1)}%) ---`);
    console.log(r.text);
  });

  await modelManager.unloadAll();
  process.exit(0);
}

main().catch(console.error);
