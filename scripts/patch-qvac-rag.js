#!/usr/bin/env node

/**
 * Postinstall patch for @qvac/rag
 *
 * Node.js v24+ rejects "node:crypto" as a direct target in package "imports"
 * maps when resolved through CJS loader hooks (e.g. tsx).
 *
 * This script:
 *   1. Creates a thin shim file that re-exports the built-in crypto module.
 *   2. Patches @qvac/rag/package.json to point #crypto → the shim.
 *
 * Safe to run multiple times (idempotent).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ragPkgPath = path.resolve(__dirname, '..', 'node_modules', '@qvac', 'rag', 'package.json');
const shimPath = path.resolve(__dirname, '..', 'node_modules', '@qvac', 'rag', 'src', 'shims', 'crypto-node.js');

// ── 1. Create shim ──
const shimContent = `'use strict'

// Node.js crypto shim - re-exports the built-in crypto module.
// Avoids ERR_INVALID_PACKAGE_TARGET on Node.js v24+.

module.exports = require('crypto')
`;

try {
  const shimDir = path.dirname(shimPath);
  if (!fs.existsSync(shimDir)) {
    fs.mkdirSync(shimDir, { recursive: true });
  }
  fs.writeFileSync(shimPath, shimContent, 'utf8');
  console.log('[patch] Created crypto-node.js shim');
} catch (err) {
  console.warn('[patch] Could not create shim:', err.message);
  process.exit(0); // non-fatal
}

// ── 2. Patch package.json ──
try {
  const raw = fs.readFileSync(ragPkgPath, 'utf8');
  const pkg = JSON.parse(raw);

  if (pkg.imports?.['#crypto']?.node === 'node:crypto') {
    pkg.imports['#crypto'].node = './src/shims/crypto-node.js';
    fs.writeFileSync(ragPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('[patch] Patched @qvac/rag imports: #crypto -> ./src/shims/crypto-node.js');
  } else {
    console.log('[patch] @qvac/rag already patched or has different imports map - skipping.');
  }
} catch (err) {
  console.warn('[patch] Could not patch @qvac/rag package.json:', err.message);
  process.exit(0); // non-fatal
}

console.log('[patch] Done - @qvac/rag crypto shim applied.');

// ── 3. Patch RPC init timeout (30s → 120s for large model loading) ──
const rpcClientPath = path.resolve(__dirname, '..', 'node_modules', '@qvac', 'sdk', 'dist', 'client', 'rpc', 'node-rpc-client.js');
try {
  if (fs.existsSync(rpcClientPath)) {
    let rpcSrc = fs.readFileSync(rpcClientPath, 'utf8');
    if (rpcSrc.includes('RPC_INIT_TIMEOUT_MS = 30_000') || rpcSrc.includes('RPC_INIT_TIMEOUT_MS = 30000')) {
      rpcSrc = rpcSrc.replace(
        /RPC_INIT_TIMEOUT_MS\s*=\s*30[_]?000/,
        'RPC_INIT_TIMEOUT_MS = 120_000'
      );
      fs.writeFileSync(rpcClientPath, rpcSrc, 'utf8');
      console.log('[patch] Increased RPC_INIT_TIMEOUT_MS: 30s -> 120s');
    } else {
      console.log('[patch] RPC timeout already patched - skipping.');
    }
  }
} catch (err) {
  console.warn('[patch] Could not patch RPC timeout:', err.message);
}

console.log('[patch] All patches complete.');

