// ─── Edge MedTech Copilot - Document File Loader ───
// Loads TXT, MD, and PDF files from the data directory.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { createRequire } from 'node:module';
import type { LoadedDocument } from '../types.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Recursively scan a directory and load all supported documents.
 * Supports: .txt, .md, .pdf
 */
export async function loadDocuments(dataDir: string): Promise<LoadedDocument[]> {
  const documents: LoadedDocument[] = [];
  await scanDirectory(dataDir, dataDir, documents);
  return documents;
}

async function scanDirectory(
  baseDir: string,
  currentDir: string,
  documents: LoadedDocument[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (err) {
    console.warn(`⚠ Could not read directory: ${currentDir}`, (err as Error).message);
    return;
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(baseDir, fullPath, documents);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!['.txt', '.md', '.pdf'].includes(ext)) continue;

    try {
      const fileStat = await stat(fullPath);
      const relPath = relative(baseDir, fullPath);

      if (ext === '.pdf') {
        const doc = await loadPDF(fullPath, relPath, fileStat.size);
        if (doc) documents.push(doc);
      } else {
        const content = await readFile(fullPath, 'utf-8');
        documents.push({
          filename: relPath,
          content,
          type: ext === '.md' ? 'md' : 'txt',
          sizeBytes: fileStat.size,
        });
        console.log(`  📄 Loaded: ${relPath} (${formatSize(fileStat.size)})`);
      }
    } catch (err) {
      console.warn(`  ⚠ Skipping ${entry.name}: ${(err as Error).message}`);
    }
  }
}

/**
 * Load and extract text from a PDF file.
 */
async function loadPDF(
  fullPath: string,
  relPath: string,
  sizeBytes: number
): Promise<LoadedDocument | null> {
  try {
    const buffer = await readFile(fullPath);
    const data = await pdfParse(buffer);

    console.log(`  📄 Loaded PDF: ${relPath} (${formatSize(sizeBytes)}, ${data.numpages} pages)`);

    return {
      filename: relPath,
      content: data.text,
      type: 'pdf',
      sizeBytes,
    };
  } catch (err) {
    console.warn(`  ⚠ Could not parse PDF ${relPath}: ${(err as Error).message}`);
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
