import { ServiceLogicAgent } from '../agents/serviceLogic.js';

// We cast ServiceLogicAgent prototype to any to access the private normalizeOutput method
const agent = new ServiceLogicAgent({} as any, {} as any);
const normalizeOutput = (agent as any).normalizeOutput.bind(agent);

interface TestCase {
  name: string;
  input: any;
  expectedInstructions: string;
  lang?: 'en' | 'es';
  isDeficient?: boolean;
  expectedConfidenceMax?: number;
  expectedEvidenceEmpty?: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Standard warning and steps',
    input: {
      instructions: '⚠️ Warning: The manual lacks sections on electrode impedance.\nVerify manual selection.\nVisually inspect cable.',
      evidence_used: [],
      reasoning_summary: '',
      confidence: 1.0
    },
    expectedInstructions: '⚠️ Warning: The manual lacks sections on electrode impedance.\n1. Verify manual selection.\n2. Visually inspect cable.'
  },
  {
    name: 'Multi-line warning and steps',
    input: {
      instructions: '⚠️ Warning: The D3D2 Service Manual_2.0_EN.pdf lacks sections.\nEnsure that the correct manual is selected.\n1. Check the cable.\n2. Check the connector.',
      evidence_used: [],
      reasoning_summary: '',
      confidence: 1.0
    },
    expectedInstructions: '⚠️ Warning: The D3D2 Service Manual_2.0_EN.pdf lacks sections.\n1. Ensure that the correct manual is selected.\n2. Check the cable.\n3. Check the connector.'
  },
  {
    name: 'Orphan dot prevention',
    input: {
      instructions: '⚠️ Warning: No sections found.\nVerify manual.\n.\nClean contacts.',
      evidence_used: [],
      reasoning_summary: '',
      confidence: 1.0
    },
    expectedInstructions: '⚠️ Warning: No sections found.\n1. Verify manual.\n2. Clean contacts.'
  },
  {
    name: 'Spanish warning and action verbs',
    input: {
      instructions: 'Advertencia: El manual no contiene información.\nCompruebe la conexión.\nLimpie los electrodos.',
      evidence_used: [],
      reasoning_summary: '',
      confidence: 1.0
    },
    expectedInstructions: 'Advertencia: El manual no contiene información.\n1. Compruebe la conexión.\n2. Limpie los electrodos.'
  },
  {
    name: 'Deficient warning injection (English)',
    input: {
      instructions: 'Verify cabling and swap probe with a known working unit.',
      evidence_used: ['Some irrelevant citation'],
      reasoning_summary: 'Irrelevant reasoning.',
      confidence: 0.8
    },
    expectedInstructions: '⚠️ Warning: The provided manual excerpts lack specific troubleshooting procedures for this fault. Verify manual selection.\n1. Verify cabling and swap probe with a known working unit.',
    lang: 'en',
    isDeficient: true,
    expectedConfidenceMax: 0.3,
    expectedEvidenceEmpty: true
  },
  {
    name: 'Deficient warning injection (Spanish)',
    input: {
      instructions: 'Inspeccione la conexión física del cable del sensor.',
      evidence_used: ['Alguna cita irrelevante'],
      reasoning_summary: 'Razonamiento irrelevante.',
      confidence: 0.9
    },
    expectedInstructions: '⚠️ Advertencia: Los fragmentos del manual proporcionados no contienen procedimientos de diagnóstico específicos para esta falla. Verifique la selección del manual.\n1. Inspeccione la conexión física del cable del sensor.',
    lang: 'es',
    isDeficient: true,
    expectedConfidenceMax: 0.3,
    expectedEvidenceEmpty: true
  },
  {
    name: 'Deficient warning preserved if prefix already matches',
    input: {
      instructions: '⚠️ Warning: The manual lacks sections on this specific sensor.\nVerify manual selection.\nInspect cable.',
      evidence_used: ['Alguna cita irrelevante'],
      reasoning_summary: 'Razonamiento.',
      confidence: 0.7
    },
    expectedInstructions: '⚠️ Warning: The manual lacks sections on this specific sensor.\n1. Verify manual selection.\n2. Inspect cable.',
    lang: 'en',
    isDeficient: true,
    expectedConfidenceMax: 0.3,
    expectedEvidenceEmpty: true
  }
];

let failed = false;
for (const tc of testCases) {
  console.log(`Running test: ${tc.name}`);
  const result = normalizeOutput(tc.input, tc.lang, tc.isDeficient);
  
  // Verify instructions
  if (result.instructions !== tc.expectedInstructions) {
    console.error(`❌ Test failed (Instructions mismatch)!`);
    console.error(`Expected:\n---`);
    console.error(tc.expectedInstructions);
    console.error(`---\nGot:\n---`);
    console.error(result.instructions);
    console.error(`---`);
    failed = true;
    continue;
  }
  
  // Verify confidence guardrail
  if (tc.expectedConfidenceMax !== undefined && result.confidence > tc.expectedConfidenceMax) {
    console.error(`❌ Test failed (Confidence: ${result.confidence} > ${tc.expectedConfidenceMax})!`);
    failed = true;
    continue;
  }
  
  // Verify evidence guardrail
  if (tc.expectedEvidenceEmpty && result.evidence_used.length > 0) {
    console.error(`❌ Test failed (Evidence not cleared: ${JSON.stringify(result.evidence_used)})!`);
    failed = true;
    continue;
  }
  
  console.log(`✅ Test passed!\n`);
}

if (failed) {
  process.exit(1);
} else {
  console.log('🎉 All normalizeOutput unit tests passed successfully!');
  process.exit(0);
}
