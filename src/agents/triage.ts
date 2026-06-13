// ─── Biomed Field Copilot — Triage Agent ───

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
      /fault\s*(code)?\s*\d+/i, /c[óo]digo\s*(de\s*)?(error|alarma|falla)\s*#?\d*/i,
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

export class TriageAgent {
  constructor(private modelManager: ModelManager, private config: AppConfig) {}

  async run(query: string, lang: 'en' | 'es', imageBase64?: string, peerPublicKey?: string): Promise<{
    result: TriageResult;
    stats?: { prompt_tokens: number; completion_tokens: number };
  }> {
    // 1. Try deterministic keyword pre-classification first
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
    
    let content = query;
    if (imageBase64) {
       content += `\n[IMAGE DATA PROVIDED]`;
    }

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
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
      // Find JSON block — prefer markdown-fenced blocks
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
      const validCategories = ['accessory_consumable', 'wiring_connector', 'power_source', 'internal_module', 'configuration_use', 'error_code', 'calibration', 'false_clinical_problem'];
      if (!validCategories.includes(parsed.category)) {
        throw new Error(`Invalid category: ${parsed.category}`);
      }
      
      console.log(`[Triage] ✅ LLM classified as: ${parsed.category} (confidence: ${parsed.confidence})`);
      return {
        result: parsed,
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

