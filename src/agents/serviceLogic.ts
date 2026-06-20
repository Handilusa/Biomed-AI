// ─── Biomed Field Copilot - Service Logic Agent ───
// Every category flows through the LLM with RAG evidence.
// Deterministic routing is applied as prompt-level guardrails, not as hardcoded responses.

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';
import type { AppConfig } from '../config.js';
import type { SearchResult, TriageCategory, ServiceLogicOutput } from '../types.js';
import { getServiceLogicSystemPrompt } from '../prompts/serviceLogic.js';

export class ServiceLogicAgent {
  constructor(private modelManager: ModelManager, private config: AppConfig) {}

  async *streamRun(
    category: TriageCategory,
    ragResults: SearchResult[],
    lang: 'en' | 'es',
    userQuery: string,
    peerPublicKey?: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
    isDeficient: boolean = false
  ): AsyncGenerator<{ type: string; data: unknown }> {
    
    const modelId = this.modelManager.getModelId('llm');
    const ragContext = this.formatRAGContext(ragResults);
    const systemPrompt = getServiceLogicSystemPrompt(category, ragContext, lang, userQuery, isDeficient);

    console.log(`[ServiceLogic] 🔧 Running LLM reasoning for category: ${category}`);
    console.log(`[ServiceLogic] 📚 RAG context: ${ragResults.length} chunks, ${ragContext.length} chars`);

    const completionHistory = [
      { role: 'system', content: systemPrompt }
    ];

    if (history && history.length > 0) {
      const recentHistory = history.slice(-4);
      for (const msg of recentHistory) {
        if (msg.content && msg.content.trim()) {
          completionHistory.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    completionHistory.push({
      role: 'user',
      content: `Analyze this fault report and provide troubleshooting instructions following the diagnostic protocol. Fault: "${userQuery}"`
    });

    const run = completion({
      modelId,
      history: completionHistory,
      stream: true,
      captureThinking: false,
      delegate: peerPublicKey ? {
        providerPublicKey: peerPublicKey,
        fallbackToLocal: true,
        timeout: 30000,
      } : undefined,
    });

    let fullOutput = '';
    let insideThink = false;
    let thinkBuffer = '';

    for await (const event of run.events) {
      if (event.type === 'contentDelta') {
        const text = (event as any).text || '';
        fullOutput += text;

        // Track <think> open/close to only stream thinking tokens live
        let remaining = text;
        while (remaining.length > 0) {
          if (!insideThink) {
            const openIdx = remaining.indexOf('<think>');
            if (openIdx !== -1) {
              // Skip any pre-think text (part of JSON output, don't stream it)
              insideThink = true;
              remaining = remaining.substring(openIdx + 7);
            } else {
              // Not inside think, not opening a think tag – this is JSON output, don't stream
              break;
            }
          } else {
            const closeIdx = remaining.indexOf('</think>');
            if (closeIdx !== -1) {
              // Stream the thinking content up to close tag
              const thinkChunk = remaining.substring(0, closeIdx);
              if (thinkChunk) {
                yield { type: 'thinking_delta', data: { text: thinkChunk } };
              }
              insideThink = false;
              remaining = remaining.substring(closeIdx + 8);
            } else {
              // Still inside think, stream entire chunk
              yield { type: 'thinking_delta', data: { text: remaining } };
              break;
            }
          }
        }
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

    console.log(`[ServiceLogic] 📝 Raw LLM output (${fullOutput.length} chars)`);

    // ─── Parse Structured Output ───
    const parsed = this.parseServiceOutput(fullOutput, category, lang, isDeficient);

    // Stream the instructions as content
    if (parsed.instructions) {
      yield { type: 'content_delta', data: { text: parsed.instructions } };
    }

    // Stream the reasoning summary and evidence as metadata
    yield { 
      type: 'service_logic_meta', 
      data: { 
        evidence_used: parsed.evidence_used,
        reasoning_summary: parsed.reasoning_summary,
        confidence: parsed.confidence,
      } 
    };
  }

  /**
   * Parse the LLM's JSON output into a ServiceLogicOutput.
   * Multiple fallback strategies to handle inconsistent model formatting.
   */
  private parseServiceOutput(
    fullOutput: string,
    category: TriageCategory,
    lang: 'en' | 'es',
    isDeficient: boolean = false
  ): ServiceLogicOutput {

    // Strategy 1: Parse from markdown-fenced JSON block
    const jsonBlockMatch = fullOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
    if (jsonBlockMatch && jsonBlockMatch.length > 0) {
      for (let i = jsonBlockMatch.length - 1; i >= 0; i--) {
        try {
          const block = jsonBlockMatch[i].replace(/```(?:json)?\s*/, '').replace(/\s*```/, '');
          const parsed = JSON.parse(block) as Partial<ServiceLogicOutput>;
          if (parsed.instructions) {
            return this.normalizeOutput(parsed, lang, isDeficient);
          }
        } catch (e) {}
      }
    }

    // Strategy 2: Find raw JSON braces
    let braceBlocks: string[] = [];
    let depth = 0;
    let startIdx = -1;
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
        const parsed = JSON.parse(braceBlocks[i]) as Partial<ServiceLogicOutput>;
        if (parsed.instructions) {
          return this.normalizeOutput(parsed, lang, isDeficient);
        }
      } catch (e) {}
    }

    // Strategy 2.5: Try parsing as pseudo-YAML / key-value blocks
    const kvPairs: Partial<ServiceLogicOutput> = {};
    
    // Extract instructions / instrucciones / instrucción
    const instRegex = /(?:instructions|instrucciones|instruccion|action|accion|código de acción):\s*(?:["']([\s\S]*?)["']|([\s\S]*?))(?=\s*(?:evidence_used|citas_usadas|evidencia|reasoning_summary|resumen_razonamiento|razonamiento|confidence|confianza|flagDisposition|disposición|disposicion|$))/i;
    const instMatch = fullOutput.match(instRegex);
    if (instMatch) {
      kvPairs.instructions = (instMatch[1] || instMatch[2] || '').trim();
    }

    // Extract evidence_used / citas_usadas / evidencia
    const evidRegex = /(?:evidence_used|citas_usadas|evidencia):\s*\[?([\s\S]*?)\]?(?=\s*(?:instructions|instrucciones|instruccion|reasoning_summary|resumen_razonamiento|razonamiento|confidence|confianza|action|accion|flagDisposition|disposición|disposicion|$))/i;
    const evidMatch = fullOutput.match(evidRegex);
    if (evidMatch) {
      const rawEv = (evidMatch[1] || '').trim();
      if (rawEv) {
        if (rawEv.startsWith('[') || rawEv.includes('"') || rawEv.includes("'")) {
          try {
            const parsedArray = JSON.parse(rawEv.startsWith('[') ? rawEv : `[${rawEv}]`);
            if (Array.isArray(parsedArray)) {
              kvPairs.evidence_used = parsedArray;
            }
          } catch (e) {
            kvPairs.evidence_used = rawEv.split(',').map(s => s.replace(/['"\[\]]/g, '').trim()).filter(s => s.length > 0);
          }
        } else {
          kvPairs.evidence_used = rawEv.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
      }
    }

    // Extract reasoning_summary / resumen_razonamiento / razonamiento
    const reasonRegex = /(?:reasoning_summary|resumen_razonamiento|razonamiento):\s*(?:["']([\s\S]*?)["']|([\s\S]*?))(?=\s*(?:instructions|instrucciones|instruccion|evidence_used|citas_usadas|evidencia|confidence|confianza|action|accion|flagDisposition|disposición|disposicion|$))/i;
    const reasonMatch = fullOutput.match(reasonRegex);
    if (reasonMatch) {
      kvPairs.reasoning_summary = (reasonMatch[1] || reasonMatch[2] || '').trim();
    }

    // Extract confidence / confianza
    const confRegex = /(?:confidence|confianza):\s*([0-9\.]+)/i;
    const confMatch = fullOutput.match(confRegex);
    if (confMatch) {
      kvPairs.confidence = parseFloat(confMatch[1]);
    }

    if (kvPairs.instructions) {
      console.log('[ServiceLogic] 🛠 Successfully extracted fields using key-value regex parser.');
      return this.normalizeOutput(kvPairs, lang, isDeficient);
    }

    // Strategy 3: Strip chain-of-thought and use raw text as instructions
    console.warn(`[ServiceLogic] ⚠️ Could not parse JSON output, using cleaned text as instructions`);
    const cleanedText = this.stripChainOfThought(fullOutput).replace(/\\n/g, '\n');
    
    return this.normalizeOutput({
      instructions: cleanedText || (lang === 'es' 
        ? `Consulte el manual del equipo para la categoría: ${category}.` 
        : `Refer to the equipment manual for category: ${category}.`),
      evidence_used: [],
      reasoning_summary: 'LLM output could not be parsed as structured JSON. Raw text used as fallback.',
      confidence: 0.3,
    }, lang, isDeficient);
  }

  private normalizeOutput(
    parsed: Partial<ServiceLogicOutput>,
    lang: 'en' | 'es' = 'en',
    isDeficient: boolean = false
  ): ServiceLogicOutput {
    let instructions = (parsed.instructions || '').replace(/\\n/g, '\n').trim();

    const actionVerbs = [
      'Swap', 'Inspect', 'Replace', 'Verify', 'If', 'Check', 'Run', 'Escalate', 'Compare', 'Refer', 'Ensure',
      'Trace', 'Measure', 'Disconnect', 'Connect', 'Test', 'Update', 'Configure', 'Clean', 'Reset', 'Perform',
      'Pruebe', 'Verifique', 'Inspeccione', 'Reemplace', 'Si', 'En caso', 'Desconecte', 'Conecte', 'Actualice',
      'Configure', 'Limpie', 'Reinicie', 'Realice', 'Establezca', 'Compruebe', 'Comprobar', 'Consulte', 'Lea'
    ];
    const verbPattern = actionVerbs.join('|');
    const verbRegex = new RegExp(`^(?:\\d+\\.|[-*•]\\s*)?(?:${verbPattern})\\b`, 'i');

    // 1. Extract mismatch warning prefixes (e.g. starting with `⚠️` or warning keywords)
    //    Capture the entire first line(s) that form the warning, not just the emoji.
    let warningPrefix = '';
    const lines = instructions.split('\n');
    const warningLines: string[] = [];
    while (lines.length > 0) {
      const line = lines[0].trim();
      if (warningLines.length === 0) {
        // First line must start with a warning indicator
        if (/^(?:⚠️|warning|advertencia)/i.test(line)) {
          warningLines.push(line);
          lines.shift();
        } else {
          break;
        }
      } else {
        // Continuation lines that are still part of the warning (not a numbered step or action)
        if (line && !/^\d+\./.test(line) && !verbRegex.test(line)) {
          warningLines.push(line);
          lines.shift();
        } else {
          break;
        }
      }
    }
    if (warningLines.length > 0) {
      warningPrefix = warningLines.join(' ') + '\n';
      instructions = lines.join('\n').trim();
    }

    // If isDeficient is true, ensure we have a deficient warning prefix.
    if (isDeficient) {
      const stdWarning = lang === 'es'
        ? '⚠️ Advertencia: Los fragmentos del manual proporcionados no contienen procedimientos de diagnóstico específicos para esta falla. Verifique la selección del manual.'
        : '⚠️ Warning: The provided manual excerpts lack specific troubleshooting procedures for this fault. Verify manual selection.';
      
      const hasDeficiencyKeywords = /lack|deficient|no contienen|insuficiente|mismatch/i.test(warningPrefix);
      if (!warningPrefix || !hasDeficiencyKeywords) {
        warningPrefix = stdWarning + '\n';
      }
    }

    // 2. Format the remaining instructions as a numbered list if it isn't already
    if (instructions && !/^\s*(?:\d+\.|[-*•])/.test(instructions)) {
      let parts = instructions.split(/(?:\.|;)\s+/).map(p => p.trim()).filter(p => p.length > 0);
      
      // If we only got 1 part, but there are commas followed by action verbs, try comma-splitting
      if (parts.length <= 1) {
        const actionVerbPattern = new RegExp(`,\\s*(?=(?:${verbPattern})\\b)`, 'i');
        parts = instructions.split(actionVerbPattern).map(p => p.trim()).filter(p => p.length > 0);
      }

      if (parts.length > 0) {
        const cleanedParts = parts
          .map((part) => {
            // Clean up leading numbers or bullet characters
            let cleanPart = part.replace(/^[-*•\d\.\s]+/, '').trim();
            // Capitalize first letter
            if (cleanPart.length > 0) {
              cleanPart = cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1);
            }
            return cleanPart;
          })
          .filter(p => p.length > 0); // Remove empty fragments that would become orphan dots

        if (cleanedParts.length > 0) {
          instructions = cleanedParts
            .map((part, index) => {
              const withPeriod = (part.endsWith('.') || part.endsWith(';') || part.endsWith('!')) 
                ? part 
                : part + '.';
              return `${index + 1}. ${withPeriod}`;
            })
            .join('\n');
        }
      }
    }

    // 3. Re-combine warning prefix and formatted instructions
    if (warningPrefix) {
      instructions = warningPrefix.trim() + '\n' + instructions;
    }

    return {
      instructions,
      evidence_used: isDeficient ? [] : (Array.isArray(parsed.evidence_used) ? parsed.evidence_used : []),
      reasoning_summary: parsed.reasoning_summary || '',
      confidence: isDeficient ? Math.min(typeof parsed.confidence === 'number' ? parsed.confidence : 0.3, 0.3) : (typeof parsed.confidence === 'number' ? parsed.confidence : 0.5),
    };
  }

  /**
   * Remove chain-of-thought, internal reasoning, and meta-commentary
   * that the model injects despite prompt instructions (used as a fallback).
   */
  private stripChainOfThought(text: string): string {
    const lines = text.split('\n');
    const cleanLines: string[] = [];
    let skipBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip lines that start with known chain-of-thought patterns
      if (/^(we are given|according to|the (user|rules|system|critical|key|situation)|thus,|so |but |hmm|okay,|i recall|also noting|however,|looking at|let me|now,|wait)/i.test(trimmed)) {
        skipBlock = true;
        continue;
      }

      // Skip lines referencing internal rules/heuristics
      if (/\b(heuristic|chain.of.thought|the rules (say|state|override)|strict compliance|my only option|triage category|disposition should be|finalDisposition)/i.test(trimmed)) {
        continue;
      }

      // Once we hit an actionable line after a skip block, resume
      if (skipBlock && trimmed.length > 0 && !/^(we|the|but|so|i |according|thus|however|hmm|okay|looking|let|now|wait)/i.test(trimmed)) {
        skipBlock = false;
      }

      if (!skipBlock && trimmed.length > 0) {
        cleanLines.push(line);
      }
    }

    return cleanLines.join('\n').trim();
  }

  private formatRAGContext(results: SearchResult[]): string {
    if (!results || results.length === 0) return '';
    return results
      .map((r, i) => `--- [Source ${i + 1}: ${r.document}${r.translatedText ? ' (translated)' : ''}] ---\n${r.translatedText || r.text}\n`)
      .join('\n');
  }
}
