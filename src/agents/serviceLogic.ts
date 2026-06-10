// ─── Biomed Field Copilot — Service Logic Agent ───
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
    userQuery: string
  ): AsyncGenerator<{ type: string; data: unknown }> {
    
    const modelId = this.modelManager.getModelId('llm');
    const ragContext = this.formatRAGContext(ragResults);
    const systemPrompt = getServiceLogicSystemPrompt(category, ragContext, lang, userQuery);

    console.log(`[ServiceLogic] 🔧 Running LLM reasoning for category: ${category}`);
    console.log(`[ServiceLogic] 📚 RAG context: ${ragResults.length} chunks, ${ragContext.length} chars`);

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this fault report and provide troubleshooting instructions following the diagnostic protocol. Fault: "${userQuery}"` }
      ],
      stream: true,
      captureThinking: false,
    });

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

    console.log(`[ServiceLogic] 📝 Raw LLM output (${fullOutput.length} chars)`);

    // ─── Parse Structured Output ───
    const parsed = this.parseServiceOutput(fullOutput, category, lang);

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
    lang: 'en' | 'es'
  ): ServiceLogicOutput {

    // Strategy 1: Parse from markdown-fenced JSON block
    const jsonBlockMatch = fullOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
    if (jsonBlockMatch && jsonBlockMatch.length > 0) {
      for (let i = jsonBlockMatch.length - 1; i >= 0; i--) {
        try {
          const block = jsonBlockMatch[i].replace(/```(?:json)?\s*/, '').replace(/\s*```/, '');
          const parsed = JSON.parse(block) as Partial<ServiceLogicOutput>;
          if (parsed.instructions) {
            return this.normalizeOutput(parsed);
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
          return this.normalizeOutput(parsed);
        }
      } catch (e) {}
    }

    // Strategy 3: Strip chain-of-thought and use raw text as instructions
    console.warn(`[ServiceLogic] ⚠️ Could not parse JSON output, using cleaned text as instructions`);
    const cleanedText = this.stripChainOfThought(fullOutput).replace(/\\n/g, '\n');
    
    return {
      instructions: cleanedText || (lang === 'es' 
        ? `Consulte el manual del equipo para la categoría: ${category}.` 
        : `Refer to the equipment manual for category: ${category}.`),
      evidence_used: [],
      reasoning_summary: 'LLM output could not be parsed as structured JSON. Raw text used as fallback.',
      confidence: 0.3,
    };
  }

  private normalizeOutput(parsed: Partial<ServiceLogicOutput>): ServiceLogicOutput {
    let instructions = (parsed.instructions || '').replace(/\\n/g, '\n');

    // Defense: If the LLM returned steps separated by commas (without newlines/numbers)
    // e.g. "Inspect the cable,Swap the probe,If error persists..."
    if (instructions && !/^\s*\d+\./m.test(instructions)) {
      let parts: string[] = [];
      if (instructions.includes('.,')) {
        parts = instructions.split(/\.,\s*/);
      } else {
        // Look for comma followed by common action verbs or conditions in English/Spanish
        const actionVerbPattern = /,\s*(?=(?:Swap|Inspect|Replace|Verify|If|Check|Run|Escalate|Compare|Refer|Ensure|Pruebe|Verifique|Inspeccione|Reemplace|Si|En caso)\b)/i;
        parts = instructions.split(actionVerbPattern);
      }

      if (parts.length > 1) {
        instructions = parts
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .map((part, index) => {
            const withPeriod = part.endsWith('.') ? part : part + '.';
            return `${index + 1}. ${withPeriod}`;
          })
          .join('\n');
      }
    }

    return {
      instructions,
      evidence_used: Array.isArray(parsed.evidence_used) ? parsed.evidence_used : [],
      reasoning_summary: parsed.reasoning_summary || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
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
