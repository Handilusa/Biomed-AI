// ─── Biomed Field Copilot - Orchestrator ───

import type { AppConfig } from '../config.js';
import type { ModelManager } from '../models/manager.js';
import type { RAGRetriever } from '../rag/retriever.js';
import { TriageAgent } from './triage.js';
import { ManualEvidenceAgent } from './manualEvidence.js';
import { ServiceLogicAgent } from './serviceLogic.js';
import { ComplianceAgent } from './compliance.js';

export class Orchestrator {
  private modelManager: ModelManager;
  private triageAgent: TriageAgent;
  private evidenceAgent: ManualEvidenceAgent;
  private serviceAgent: ServiceLogicAgent;
  private complianceAgent: ComplianceAgent;

  constructor(modelManager: ModelManager, config: AppConfig, retriever: RAGRetriever) {
    this.modelManager = modelManager;
    this.triageAgent = new TriageAgent(modelManager, config);
    this.evidenceAgent = new ManualEvidenceAgent(retriever);
    this.serviceAgent = new ServiceLogicAgent(modelManager, config);
    this.complianceAgent = new ComplianceAgent(modelManager, config);
  }

  private detectLang(text: string): 'en' | 'es' {
    const esWords = ['el', 'la', 'los', 'las', 'de', 'que', 'en', 'un', 'una', 'es', 'falla', 'pantalla', 'equipo', 'como', 'cómo', 'para', 'por', 'con', 'del', 'al', 'se'];
    const enWords = ['the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'it', 'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see'];
    const words = text.toLowerCase().split(/\W+/);
    const esCount = words.filter(w => esWords.includes(w)).length;
    const enCount = words.filter(w => enWords.includes(w)).length;
    
    if (esCount === 0 && enCount === 0) {
      return 'en'; // default to English
    }
    return esCount > enCount ? 'es' : 'en';
  }

  private cleanSearchQuery(query: string): string {
    let cleaned = query.replace(/manuals[\/\\][^\s]+/gi, '');
    cleaned = cleaned.replace(/\b[\w\-\.]+\.(pdf|md|txt)\b/gi, '');
    cleaned = cleaned.replace(/\.{2,}/g, '');
    return cleaned.trim();
  }

  private checkEvidenceSufficiency(query: string, signals: string[], evidence: any[]): boolean {
    if (evidence.length === 0) return false;

    // Check if the top result has very low relevance
    const topScore = evidence[0].similarity;
    if (topScore < 0.25) return false;

    const combinedText = evidence.map((e) => (e.text || '').toLowerCase()).join(' ');

    const keywords = new Set<string>();
    for (const sig of signals) {
      const parts = sig.toLowerCase().split(/\s+/);
      for (const part of parts) {
        if (part.length > 2) keywords.add(part);
      }
    }

    const queryWords = query.toLowerCase().split(/\W+/);
    // Remove troubleshoot, intermittent, error, reading from the stopWords
    const stopWords = new Set([
      'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'it', 'for', 'on', 'are', 'as', 'with', 'at', 'be', 'this', 'have',
      'from', 'or', 'by', 'but', 'not', 'what', 'how', 'why', 'who', 'where', 'when', 'i', 'we', 'you', 'he', 'she', 'they',
      'manuals', 'manual', 'pdf', 'document', 'device', 'equipment', 'monitors', 'monitor', 'patient', 'hospital', 'copilot'
    ]);

    for (const word of queryWords) {
      if (word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word)) {
        keywords.add(word);
      }
    }

    const errorCodeMatch = query.match(/e-?\d+/i);
    if (errorCodeMatch) {
      keywords.add(errorCodeMatch[0].toLowerCase());
      keywords.add(errorCodeMatch[0].replace('-', '').toLowerCase());
    }

    if (keywords.size === 0) return true;

    let matchCount = 0;
    for (const kw of keywords) {
      if (combinedText.includes(kw)) {
        matchCount++;
      }
    }

    const spanishTranslations: Record<string, string[]> = {
      'probe': ['sonda', 'sensor', 'electrodo', 'cable'],
      'sensor': ['sonda', 'electrodo', 'cable'],
      'cable': ['cable', 'latiguillo', 'hilo', 'conductor'],
      'occlusion': ['oclusión', 'obstrucción', 'bloqueo'],
      'power': ['corriente', 'alimentación', 'encendido', 'batería', 'bateria'],
      'battery': ['batería', 'bateria', 'pila'],
      'calibration': ['calibración', 'ajuste', 'PM'],
      'impedance': ['impedancia', 'resistencia'],
      'intermittent': ['intermitente', 'inestable', 'contacto'],
      'readings': ['lecturas', 'medición', 'mediciones'],
      'reading': ['lectura', 'medición', 'medicion'],
      'error': ['error', 'código', 'codigo', 'alarma', 'fallo'],
      'errors': ['errores', 'códigos', 'codigos', 'alarmas', 'fallos']
    };

    for (const kw of keywords) {
      if (spanishTranslations[kw]) {
        for (const syn of spanishTranslations[kw]) {
          if (combinedText.includes(syn)) {
            matchCount++;
          }
        }
      }
    }

    // Enforce matching specific symptom/fault keywords if they are present in the query.
    const specificSymptomKeywords = [
      'intermittent', 'impedance', 'shock', 'shocks', 'calibration', 'calibrate',
      'occlusion', 'occlusions', 'leakage', 'noise', 'drift', 'off', 'leak',
      'leaks', 'short', 'shorts', 'open', 'opens', 'ground', 'grounds'
    ];

    const specificSymptomSynonyms: Record<string, string[]> = {
      'intermittent': ['intermitente', 'inestable', 'fluctuante', 'contacto'],
      'impedance': ['impedancia', 'resistencia', 'contacto', 'ohm', 'ohms'],
      'shock': ['choque', 'descarga', 'energía', 'energia', 'julio', 'julios', 'discharge', 'discharges'],
      'shocks': ['choque', 'descarga', 'energía', 'energia', 'julio', 'julios', 'discharge', 'discharges'],
      'calibration': ['calibración', 'ajuste', 'pm', 'calibrar'],
      'calibrate': ['calibración', 'ajuste', 'pm', 'calibrar'],
      'occlusion': ['oclusión', 'obstrucción', 'bloqueo', 'block', 'blocked', 'blockage', 'clog', 'clogged'],
      'occlusions': ['oclusión', 'obstrucción', 'bloqueo', 'block', 'blocked', 'blockage', 'clog', 'clogged'],
      'leakage': ['fuga', 'fugas', 'earth', 'ground', 'leak', 'leaks'],
      'noise': ['ruido', 'ruidoso', 'interferencia', 'artifact', 'artifacts'],
      'drift': ['desviación', 'desviacion', 'inestable', 'drift', 'drifting'],
      'off': ['desconectado', 'desconexion', 'suelto', 'abierto', 'disconnected', 'unplugged', 'loose', 'open'],
      'leak': ['fuga', 'fugas', 'earth', 'ground', 'leak', 'leaks'],
      'leaks': ['fuga', 'fugas', 'earth', 'ground', 'leak', 'leaks'],
      'short': ['corto', 'cortocircuito', 'shorted'],
      'shorts': ['corto', 'cortocircuito', 'shorted'],
      'open': ['abierto', 'open-circuit'],
      'opens': ['abierto', 'open-circuit'],
      'ground': ['tierra', 'grounding', 'chassis'],
      'grounds': ['tierra', 'grounding', 'chassis']
    };

    const querySymptoms = queryWords.filter(w => specificSymptomKeywords.includes(w));
    if (querySymptoms.length > 0) {
      let symptomMatched = false;
      for (const sym of querySymptoms) {
        if (combinedText.includes(sym)) {
          symptomMatched = true;
          break;
        }
        if (specificSymptomSynonyms[sym]) {
          for (const syn of specificSymptomSynonyms[sym]) {
            if (combinedText.includes(syn)) {
              symptomMatched = true;
              break;
            }
          }
        }
        if (symptomMatched) break;
      }
      if (!symptomMatched) {
        console.log(`[Orchestrator] ⚠️ Query contains specific symptoms (${querySymptoms.join(', ')}) but none matched the retrieved text. Marking as deficient.`);
        return false;
      }
    }

    return matchCount > 0;
  }

  async *processQuery(
    query: string,
    options: {
      uiLanguage?: 'en' | 'es';
      responseLanguage?: 'auto' | 'en' | 'es';
      evidenceMode?: 'original' | 'translated' | 'both';
      peerPublicKey?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    },
    documentId?: string,
    imageBase64?: string
  ): AsyncGenerator<{ type: string; data: unknown }> {
    
    const uiLang = options.uiLanguage || 'en';
    const targetLang = (!options.responseLanguage || options.responseLanguage === 'auto') 
      ? this.detectLang(query) 
      : options.responseLanguage;

    // 1. Triage Phase
    const triageInfo = await this.triageAgent.run(query, targetLang, imageBase64, options.peerPublicKey, options.history);
    const triageResult = triageInfo.result;
    yield { type: 'triage', data: triageResult };

    if (triageInfo.stats) {
      yield { type: 'agent_stats', data: triageInfo.stats };
    }

    if (triageResult.category === 'false_clinical_problem') {
      const complianceResult = await this.complianceAgent.enforceClinicalBoundary(targetLang, options.peerPublicKey);
      yield { type: 'content_delta', data: { text: complianceResult.content } };
      yield { type: 'done', data: {} };
      return;
    }

    if (!documentId) {
      yield { 
         type: 'content_delta', 
         data: { 
           text: uiLang === 'es' ? 'Selecciona un manual de equipo para continuar.' : 'Select an equipment manual to continue.' 
         } 
      };
      yield { type: 'done', data: {} };
      return;
    }

    // 2. Manual Evidence Phase
    // Clean the user query to remove file path noise and improve RAG embedding search quality
    const cleanedQuery = this.cleanSearchQuery(query);
    const searchQuery = triageResult.extractedSignals && triageResult.extractedSignals.length > 0 
      ? `${cleanedQuery} ${triageResult.extractedSignals.join(' ')}` 
      : cleanedQuery;
    const evidence = await this.evidenceAgent.run(searchQuery, documentId);
    
    const isDeficient = !this.checkEvidenceSufficiency(query, triageResult.extractedSignals || [], evidence);

    // NMT Translation for Evidence if requested
    const docLang = 'en'; // MVP assumption: manuals are indexed in English
    const evidenceMode = options.evidenceMode || 'original';
    
    if ((evidenceMode === 'translated' || evidenceMode === 'both') && docLang !== targetLang) {
      const langPair = docLang === 'en' ? 'en_es' : 'es_en';
      for (const ev of evidence) {
        ev.translatedText = await this.modelManager.translateText(ev.text, langPair);
      }
    }

    yield { type: 'rag_sources', data: { sources: evidence } };

    // 3. Service Logic Phase
    const serviceGen = this.serviceAgent.streamRun(triageResult.category, evidence, targetLang, query, options.peerPublicKey, options.history, isDeficient);
    let serviceContent = '';
    
    for await (const event of serviceGen) {
      if (event.type === 'content_delta') {
        serviceContent += (event.data as any).text;
      }
      yield event; // pass through
    }

    // 4. Compliance & Safety Phase
    const complianceGen = this.complianceAgent.streamRun(serviceContent, targetLang, triageResult.category, query, evidence, options.peerPublicKey);
    for await (const event of complianceGen) {
      yield event; // pass through
    }
  }
}
