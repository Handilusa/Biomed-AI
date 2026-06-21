// ─── Biomed Field Copilot - Conversation Memory Test ───
// Verifies SessionStore and ContextBudget functions:
// - Session creation, storage, and retrieval
// - Sliding window extraction
// - Deterministic context summary generation
// - Token budget dynamic context management and truncation
// Usage: npx tsx src/demo/test-memory.ts

import { SessionStore } from '../memory/sessionStore.js';
import { buildMemoryContext } from '../memory/contextBudget.js';

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ TEST PASSED: ${name}`);
  } catch (error) {
    console.error(`❌ TEST FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

console.log('=====================================================');
console.log('      Biomed Field Copilot - Memory Unit Tests      ');
console.log('=====================================================\n');

// --- Test 1: Session Creation & Retrieval ---
runTest('Session Store - Creation & Document ID Reset', () => {
  const store = new SessionStore({ maxTurns: 4 });
  const session1 = store.getOrCreate('session-123', 'manual-A.pdf');
  
  if (session1.id !== 'session-123') throw new Error('Incorrect session ID');
  if (session1.documentId !== 'manual-A.pdf') throw new Error('Incorrect document ID');

  // Verify same session is returned
  const session1_ref = store.getOrCreate('session-123');
  if (session1_ref !== session1) throw new Error('Session reference mismatch');

  // Verify session is reset if documentId changes (equipment shift)
  const session1_reset = store.getOrCreate('session-123', 'manual-B.pdf');
  if (session1_reset.documentId !== 'manual-B.pdf') throw new Error('Document ID did not update');
  if (session1_reset.turns.length !== 0) throw new Error('Session did not reset turns on doc change');

  store.destroy();
});

// --- Test 2: Turn Tracking & Sliding Window ---
runTest('Session Store - Turn Tracking & Sliding Window', () => {
  const store = new SessionStore({ maxTurns: 5 });
  const sessionId = 'session-456';
  store.getOrCreate(sessionId, 'manual-A.pdf');

  // Add 3 full turns (6 messages: 3 user, 3 assistant)
  store.addTurn(sessionId, { role: 'user', content: 'Turn 1 User', timestamp: Date.now() });
  store.addTurn(sessionId, { role: 'assistant', content: 'Turn 1 Assistant', timestamp: Date.now() });

  store.addTurn(sessionId, { role: 'user', content: 'Turn 2 User', timestamp: Date.now() });
  store.addTurn(sessionId, { role: 'assistant', content: 'Turn 2 Assistant', timestamp: Date.now() });

  store.addTurn(sessionId, { role: 'user', content: 'Turn 3 User', timestamp: Date.now() });
  store.addTurn(sessionId, { role: 'assistant', content: 'Turn 3 Assistant', timestamp: Date.now() });

  const turns = store.getSlidingWindow(sessionId, 2); // get last 2 turn pairs
  if (turns.length !== 4) {
    throw new Error(`Expected sliding window of 4 turns (2 pairs), got ${turns.length}`);
  }

  if (turns[0].content !== 'Turn 2 User') throw new Error('Unexpected first message in window');
  if (turns[3].content !== 'Turn 3 Assistant') throw new Error('Unexpected last message in window');

  store.destroy();
});

// --- Test 3: Deterministic Context Summary ---
runTest('Session Store - Deterministic Summary Generation', () => {
  const store = new SessionStore();
  const sessionId = 'session-789';
  store.getOrCreate(sessionId, 'InfusionPump_SM.pdf');

  store.addTurn(sessionId, { role: 'user', content: 'The pump won\'t charge', timestamp: Date.now() });
  store.addTurn(sessionId, { 
    role: 'assistant', 
    content: 'Check the power cable and battery connections.', 
    meta: {
      triageCategory: 'power_source',
      extractedSignals: ['battery', 'charge', 'power cable'],
      finalDisposition: 'swap_test',
    },
    timestamp: Date.now() 
  });

  const summary = store.getCompressedContext(sessionId);
  if (!summary) throw new Error('Summary should not be null');
  
  if (!summary.includes('InfusionPump_SM.pdf')) throw new Error('Missing document context');
  if (!summary.includes('power_source')) throw new Error('Missing triage category context');
  if (!summary.includes('swap-test was recommended')) throw new Error('Missing final disposition context');
  if (!summary.includes('battery, charge, power cable')) throw new Error('Missing key signals context');

  store.destroy();
});

// --- Test 4: Token Budget & Truncation ---
runTest('Context Budget - Token Budget & Truncation', () => {
  const summary = 'Ongoing diagnostics for infusion pump battery issues.';
  const windowTurns = [
    { role: 'user' as const, content: 'Battery gets very hot.', timestamp: Date.now() },
    { role: 'assistant' as const, content: 'Perform a battery calibration test.', timestamp: Date.now() },
    { role: 'user' as const, content: 'What if calibration fails?', timestamp: Date.now() },
    { role: 'assistant' as const, content: 'Replace the battery pack.', timestamp: Date.now() },
  ];

  // Test under normal budget
  const contextNormal = buildMemoryContext(summary, windowTurns, 500, 300, 4096, 1000);
  if (!contextNormal.hasHistory) throw new Error('Should have history');
  if (contextNormal.slidingWindow.length !== 4) throw new Error('Should keep all 4 turns');

  // Test under extremely tight memory context limit (e.g. 50 tokens max budget)
  // This should drop some history turns to stay under budget
  const contextTight = buildMemoryContext(summary, windowTurns, 500, 300, 940, 100);
  
  // Since limit is 100, and summary alone is ~15 tokens, it should only fit a small part of sliding window (or drop older turns)
  if (contextTight.slidingWindow.length >= 4) {
    throw new Error('Should have truncated sliding window under tight budget');
  }
  
  // Verify that if it has turns left, they are the most recent ones (end of the array)
  if (contextTight.slidingWindow.length > 0) {
    const lastTurn = contextTight.slidingWindow[contextTight.slidingWindow.length - 1];
    if (lastTurn.content !== 'Replace the battery pack.') {
      throw new Error('Most recent turn should be preserved');
    }
  }
});

console.log('\n🎉 All memory unit tests passed successfully!');
process.exit(0);
