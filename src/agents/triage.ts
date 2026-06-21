// ─── Biomed Field Copilot - Triage Agent ───

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { TriageResult } from '../types.js';
import { getTriageSystemPrompt } from '../prompts/triage.js';

// ─── Deterministic Routing Layer ───
// Applies validated field heuristics to instantly classify high-risk
// operational patterns, ensuring immediate technical compliance.
const KEYWORD_RULES: Array<{ patterns: RegExp[]; category: TriageResult['category']; signals: string[] }> = [
  {
    patterns: [
      /probe.?off/i, /spo2.*(probe|sensor|cable)/i, /probe.*(error|fault|disconnect)/i, /(finger|clip).*(sensor|probe)/i,
      /sonda.?desconectada/i, /sonda.*(error|falla|desconect)/i, /sensor.*(spo2|dedo)/i, /cable.*(spo2|roto)/i
    ],
    category: 'wiring_connector',
    signals: ['SpO2', 'probe off', 'sonda', 'sensor', 'cable'],
  },
  {
    patterns: [
      /ecg.*(lead|cable|wire)/i, /lead.*(off|disconnect|fault)/i, /patient.?cable/i, /trunk.?cable/i,
      /ecg.*(cable|latiguillo|derivaci[óo]n)/i, /cable.?paciente/i, /cable.?troncal/i
    ],
    category: 'wiring_connector',
    signals: ['ECG', 'lead', 'cable', 'latiguillo'],
  },
  {
    // Defibrillator electrode/pad/cable issues — impedance errors, shock delivery failures.
    // Field-service data: >85% of defibrillator impedance errors trace to external cable/electrode faults.
    patterns: [
      /(?:defib|aed|dea|desfib).*(?:electrode|pad|parche|cable|lead)/i,
      /(?:electrode|pad|parche).*(?:impedance|impedancia|error|fault|fail)/i,
      /(?:impedance|impedancia).*(?:electrode|pad|parche|cable|defib|aed)/i,
      /(?:shock|descarga).*(?:error|fail|abort|no.*deliver)/i,
      /(?:no|failed|abort).*(?:shock|discharge|descarga|deliver)/i,
      /(?:high|low|out.of.range).*impedance/i,
      /impedance.*(?:high|low|out.of.range|check|error)/i,
      /(?:electrode|pad|parche).*(?:expired|dry|vencid|sec[oa])/i,
    ],
    category: 'wiring_connector',
    signals: ['defibrillator', 'electrode', 'impedance', 'pad', 'shock error'],
  },
  {
    patterns: [
      /power.?cord/i, /power.?cable/i, /no.?power/i, /turns off/i, /intermittent.*power/i,
      /cable.*(corriente|alimentaci[óo]n)/i, /no.*enciende/i, /bater[ií]a/i, /battery/i,
      /power.?cycling/i, /apaga.*prende/i, /enciende.*apaga/i, /se.*apaga/i
    ],
    category: 'power_source',
    signals: ['power', 'battery', 'turns off', 'intermittent power', 'apaga y prende', 'bateria'],
  },
  {
    patterns: [/cuff/i, /disposable.*(sensor|pad|electrode)/i, /single.?use/i, /replace.*(pad|electrode|sensor)/i],
    category: 'accessory_consumable',
    signals: ['consumable', 'disposable'],
  },
  {
    patterns: [
      /error\s*(code|#|number)?\s*\d+/i, /alarm\s*(code)?\s*#?\d+/i, /E-?\d{2,}/i,
      /fault\s*(code)?\s*\d+/i, /c[óo]digo\s*(de\s*)?(error|alarma|falla)\s*#?\d+/i,
      /error\s+\d{2,}/i, /alarma?\s+\d{2,}/i
    ],
    category: 'error_code',
    signals: ['error code', 'alarm code', 'fault code'],
  },
  {
    patterns: [
      /calibrat/i, /verificaci[óo]n/i, /out.?of.?tolerance/i,
      /preventive\s*maintenance/i, /PM\s*(fail|check|result)/i,
      /sensor\s*drift/i, /reference\s*standard/i, /mantenimiento\s*preventivo/i,
      /ajuste/i, /calibraci[óo]n/i
    ],
    category: 'calibration',
    signals: ['calibration', 'verification', 'PM', 'tolerance'],
  },
  {
    patterns: [/what (drug|medication|dose)/i, /heart rate.*(dropping|falling)/i, /clinical.*(risk|danger)/i, /what.*(administer|prescribe|give)/i],
    category: 'false_clinical_problem',
    signals: ['clinical question'],
  },
];

function keywordPreClassify(query: string): TriageResult | null {
  const q = query.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(q)) {
        console.log(`[Triage] ⚡ Keyword match: "${pattern}" → ${rule.category}`);
        return {
          category: rule.category,
          confidence: 0.95,
          extractedSignals: rule.signals,
          reasoning: `Keyword match: ${pattern}`,
        };
      }
    }
  }
  return null;
}

// ─── Post-LLM Consistency Validator ───
// Catches contradictions where the LLM assigns a category that conflicts
// with the actual symptoms described in the query. This runs AFTER the LLM
// classification and BEFORE the result reaches the orchestrator.
function validateTriageConsistency(result: TriageResult, query: string): TriageResult {
  const q = query.toLowerCase();

  // ── Override 1: internal_module → wiring_connector ──
  // If the LLM said "internal_module" but the query clearly describes
  // external cable/connector/electrode symptoms, reclassify.
  if (result.category === 'internal_module') {
    const externalSignals = [
      /\b(cable|connector|electrode|pad|parche|lead|probe|sonda|wire)\b/i,
      /\b(impedance|impedancia)\b/i,
      /\b(plug|unplug|disconnect|loose|suelto|desconect)\b/i,
    ];
    const matchedExternal = externalSignals.filter(r => r.test(q));
    if (matchedExternal.length >= 2) {
      console.log(`[Triage] 🔄 Consistency override: internal_module → wiring_connector (${matchedExternal.length} external signals detected)`);
      return {
        ...result,
        category: 'wiring_connector',
        confidence: Math.max(result.confidence - 0.1, 0.5),
        reasoning: `Consistency override: query mentions external components (${matchedExternal.length} signals) but was classified as internal_module. Reclassified to wiring_connector for external-first diagnosis.`,
      };
    }
  }

  // ── Override 2: general_inquiry → specific category ──
  // If the LLM said "general_inquiry" but the query describes a specific
  // fault/error (not a general question), reclassify to the most likely category.
  if (result.category === 'general_inquiry') {
    const faultIndicators = [
      /\b(error|fault|fail|alarm|falla|alarma|fallo)\b/i,
      /\b(not working|no funciona|doesn't work|won't|broken|roto|da[ñn]ado)\b/i,
      /\b(impedance|impedancia|shock|descarga|abort)\b/i,
    ];
    const hasFault = faultIndicators.some(r => r.test(q));
    if (hasFault) {
      const hasElectrodeContext = /\b(electrode|pad|parche|cable|lead|probe|connector|sonda)\b/i.test(q);
      const hasPowerContext = /\b(power|battery|bater[ií]a|enciende|turns?\s*on|apaga|shut)\b/i.test(q);

      if (hasElectrodeContext) {
        console.log(`[Triage] 🔄 Consistency override: general_inquiry → wiring_connector (fault + external component references)`);
        return {
          ...result,
          category: 'wiring_connector',
          confidence: 0.7,
          reasoning: 'Consistency override: classified as general_inquiry but contains specific fault indicators with external component references.',
        };
      }
      if (hasPowerContext) {
        console.log(`[Triage] 🔄 Consistency override: general_inquiry → power_source (fault + power references)`);
        return {
          ...result,
          category: 'power_source',
          confidence: 0.7,
          reasoning: 'Consistency override: classified as general_inquiry but contains specific fault indicators with power references.',
        };
      }
      // Fault present but no clear external/power context → internal_module as safe default
      console.log(`[Triage] 🔄 Consistency override: general_inquiry → internal_module (fault indicators present, no specific external context)`);
      return {
        ...result,
        category: 'internal_module',
        confidence: 0.6,
        reasoning: 'Consistency override: classified as general_inquiry but contains specific fault indicators. Reclassified to internal_module.',
      };
    }
  }

  return result; // No override needed — original classification is consistent
}

export class TriageAgent {
  constructor(private modelManager: ModelManager, private config: AppConfig) {}

  async run(
    query: string,
    lang: 'en' | 'es',
    imageBase64?: string,
    peerPublicKey?: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
    contextSummary?: string
  ): Promise<{
    result: TriageResult;
    stats?: { prompt_tokens: number; completion_tokens: number };
  }> {
    // 1. Try deterministic keyword pre-classification first
    // NOTE: keyword match runs ONLY on the raw query, not on context summary,
    // to avoid false matches from historical context
    const keywordResult = keywordPreClassify(query);
    if (keywordResult) {
      return {
        result: keywordResult,
        stats: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }

    // 2. Fall back to LLM classification
    const modelId = this.modelManager.getModelId('llm');
    const systemPrompt = getTriageSystemPrompt(lang);
    
    // Build content: prepend context summary for follow-up awareness
    let content = '';
    if (contextSummary) {
      content += `[Previous context]: ${contextSummary}\n\nCurrent query: `;
    }
    content += query;

    if (imageBase64) {
       content += `\n[IMAGE DATA PROVIDED]`;
    }

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        ...(history || []),
        { role: 'user', content }
      ],
      stream: false,
      captureThinking: false,
      delegate: peerPublicKey ? {
        providerPublicKey: peerPublicKey,
        fallbackToLocal: true,
        timeout: 30000,
      } : undefined,
    });

    // Wait for full completion to parse JSON
    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    for await (const event of run.events) {
      if (event.type === 'contentDelta') {
        fullText += (event as any).text;
      } else if (event.type === 'completionStats') {
        const s = (event as any).stats || {};
        promptTokens = s.promptTokens ?? 0;
        completionTokens = s.generatedTokens ?? 0;
      }
    }

    console.log(`[Triage] 🤖 Raw LLM output (${fullText.length} chars):\n${fullText.substring(0, 500)}`);

    try {
      // Find JSON block - prefer markdown-fenced blocks
      const jsonBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
      let jsonStr = '';
      if (jsonBlockMatch && jsonBlockMatch.length > 0) {
        const lastBlock = jsonBlockMatch[jsonBlockMatch.length - 1];
        jsonStr = lastBlock.replace(/```(?:json)?\s*/, '').replace(/\s*```/, '');
      } else {
        // Fallback: find outermost braces
        const firstBrace = fullText.indexOf('{');
        const lastBrace = fullText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = fullText.substring(firstBrace, lastBrace + 1);
        }
      }

      if (!jsonStr) throw new Error('No JSON found in output');
      
      const parsed = JSON.parse(jsonStr) as TriageResult;
      
      // Validate category
      const validCategories = ['accessory_consumable', 'wiring_connector', 'power_source', 'internal_module', 'configuration_use', 'error_code', 'calibration', 'false_clinical_problem', 'general_inquiry'];
      if (!validCategories.includes(parsed.category)) {
        throw new Error(`Invalid category: ${parsed.category}`);
      }
      
      console.log(`[Triage] ✅ LLM classified as: ${parsed.category} (confidence: ${parsed.confidence})`);
      
      // Apply post-LLM consistency validation
      const validated = validateTriageConsistency(parsed, query);
      if (validated.category !== parsed.category) {
        console.log(`[Triage] 🔄 Final category after consistency check: ${validated.category}`);
      }
      
      return {
        result: validated,
        stats: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
      };
    } catch (e) {
      console.error(`[Triage] ❌ JSON parse failed: ${(e as Error).message}`);
      console.error(`[Triage] ❌ Raw text was: ${fullText.substring(0, 300)}`);
      
      // Fallback
      return {
        result: {
          category: 'internal_module',
          confidence: 0.3,
          extractedSignals: [query],
          reasoning: `Failed to parse LLM JSON: ${(e as Error).message}`
        },
        stats: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
      };
    }
  }
}

