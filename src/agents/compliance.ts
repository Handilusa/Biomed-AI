// ─── Biomed Field Copilot — Compliance Agent ───
// Every category flows through LLM-based compliance validation.
// No hardcoded fast-paths — disposition is determined by analyzing the actual service output.

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import { getComplianceSystemPrompt } from '../prompts/compliance.js';
import { DISCLAIMERS } from '../config.js';
import { checkSafetyRules } from './safetyRules.js';
import type { SearchResult } from '../types.js';

export class ComplianceAgent {
  constructor(private modelManager: ModelManager, private config: AppConfig) {}

  async enforceClinicalBoundary(lang: 'en' | 'es', peerPublicKey?: string): Promise<{ content: string }> {
    const msg = lang === 'es' 
      ? 'Se sospecha un problema clínico; verifica con el personal clínico y no continúes con suposiciones técnicas.' 
      : 'Clinical issue suspected; verify with clinical staff and do not continue technical assumptions.';
    return { content: msg };
  }

  async *streamRun(
    serviceLogicOutput: string,
    lang: 'en' | 'es',
    category?: string,
    userQuery: string = '',
    evidence: SearchResult[] = [],
    peerPublicKey?: string
  ): AsyncGenerator<{ type: string; data: unknown }> {
    
    // Extract text from RAG evidence
    const evidenceText = evidence.map(e => e.text + (e.translatedText ? '\n' + e.translatedText : '')).join('\n');

    // ─── Programmatic Safety Rules Check ───
    const safetyWarnings = checkSafetyRules(userQuery, serviceLogicOutput, lang, evidenceText);

    // Combine standard disclaimers with safety rule warnings/actions/corrections
    const disclaimersList: string[] = [...DISCLAIMERS[lang]];
    if (safetyWarnings.length > 0) {
      // Add safety warnings at the top of the disclaimers
      for (const warning of safetyWarnings) {
        if (warning.conceptualText) {
          disclaimersList.unshift(warning.conceptualText);
        }
        disclaimersList.unshift(warning.correctiveText);
        disclaimersList.unshift(warning.warningText);
      }
    }

    // Send disclaimers (sending both texts and disclaimers keys for UI compatibility)
    yield { type: 'disclaimers', data: { texts: disclaimersList, disclaimers: disclaimersList } };

    // ─── LLM-Based Compliance Validation ───
    // The compliance agent reads the actual service logic output to determine disposition,
    // rather than blindly mapping from category name.
    const modelId = this.modelManager.getModelId('llm');
    let systemPrompt = getComplianceSystemPrompt(lang);

    if (safetyWarnings.length > 0) {
      systemPrompt += `\n\n⚠️ CRITICAL SAFETY RULES TRIGGERED:\n` + 
        safetyWarnings.map(w => `- RULE: ${w.name}\n  WARNING: ${w.warningText}\n  CORRECTIVE: ${w.correctiveText}`).join('\n');
      systemPrompt += `\n\nYou MUST incorporate these safety rules into your evaluation, prioritize safety, and set finalDisposition to escalate or the forced safe state.`;
    }

    console.log(`[Compliance] 🛡️ Validating service output for category: ${category}`);

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Validate and determine disposition for these service instructions:\n\nCategory: ${category}\n\nInstructions:\n${serviceLogicOutput}` }
      ],
      stream: true,
      captureThinking: false,
      delegate: peerPublicKey ? {
        providerPublicKey: peerPublicKey,
        fallbackToLocal: true,
        timeout: 30000,
      } : undefined,
    });

    // Collect full output — compliance agent should only produce a JSON block
    let fullOutput = '';
    for await (const event of run.events) {
      if (event.type === 'contentDelta') {
        fullOutput += (event as any).text;
      } else if (event.type === 'completionStats') {
        const s = (event as any).stats || {};
        yield {
          type: 'agent_stats',
          data: {
            prompt_tokens: s.promptTokens ?? 0,
            completion_tokens: s.generatedTokens ?? 0
          }
        };
      }
    }

    // Parse final disposition and safety note
    let finalDisposition = '';
    let safetyNote = '';

    // Strategy 1: Markdown-fenced JSON
    const jsonBlockMatch = fullOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
    if (jsonBlockMatch && jsonBlockMatch.length > 0) {
      for (let i = jsonBlockMatch.length - 1; i >= 0; i--) {
        try {
          const block = jsonBlockMatch[i].replace(/```(?:json)?\s*/, '').replace(/\s*```/, '');
          const parsed = JSON.parse(block);
          if (parsed.finalDisposition) {
            finalDisposition = parsed.finalDisposition;
            safetyNote = parsed.safety_note || '';
            break;
          }
        } catch (e) {}
      }
    }

    // Strategy 2: Raw brace extraction with proper depth tracking
    if (!finalDisposition) {
      let depth = 0;
      let startIdx = -1;
      const braceBlocks: string[] = [];
      for (let i = 0; i < fullOutput.length; i++) {
        if (fullOutput[i] === '{') {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (fullOutput[i] === '}') {
          depth--;
          if (depth === 0 && startIdx !== -1) {
            braceBlocks.push(fullOutput.substring(startIdx, i + 1));
            startIdx = -1;
          }
        }
      }
      for (let i = braceBlocks.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(braceBlocks[i]);
          if (parsed.finalDisposition) {
            finalDisposition = parsed.finalDisposition;
            safetyNote = parsed.safety_note || '';
            break;
          }
        } catch (e) {}
      }
    }

    // Strategy 3: Deterministic fallback based on category
    if (!finalDisposition) {
      console.warn(`[Compliance] ⚠️ Could not parse LLM output, using category-based fallback`);
      finalDisposition = this.getFallbackDisposition(category);
    }

    // ─── Force Safe Disposition and Safety Note Overrides ───
    if (safetyWarnings.length > 0) {
      console.log(`[Compliance] 🚨 Overriding disposition and safety note due to triggered safety rules.`);
      finalDisposition = safetyWarnings[0].forcedDisposition;
      
      // The warning, corrective action, and conceptual correction are already rendered as separate disclaimers.
      // The safetyNote should only contain the LLM's additional compliance evaluation notes.
      safetyNote = safetyNote 
        ? `[Additional Compliance Notes]: ${safetyNote}`
        : '';
    }

    // Validate disposition value
    const validDispositions = ['replace_accessory', 'swap_test', 'escalate', 'clinical_referral', 'recalibrate', 'follow_error_tree'];
    if (!validDispositions.includes(finalDisposition)) {
      console.warn(`[Compliance] ⚠️ Invalid disposition "${finalDisposition}", defaulting to escalate`);
      finalDisposition = 'escalate';
    }

    console.log(`[Compliance] ✅ Disposition: ${finalDisposition}${safetyNote ? ` | Safety: ${safetyNote}` : ''}`);

    yield { 
      type: 'done', 
      data: { 
        finalDisposition,
        ...(safetyNote ? { safetyNote } : {})
      } 
    };
  }

  /**
   * Deterministic fallback when LLM compliance output can't be parsed.
   * This is the LAST resort, not the primary path.
   */
  private getFallbackDisposition(category?: string): string {
    switch (category) {
      case 'wiring_connector': return 'swap_test';
      case 'accessory_consumable': return 'replace_accessory';
      case 'calibration': return 'recalibrate';
      case 'error_code': return 'follow_error_tree';
      case 'false_clinical_problem': return 'clinical_referral';
      default: return 'escalate';
    }
  }
}
