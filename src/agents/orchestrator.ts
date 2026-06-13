// ─── Biomed Field Copilot — Orchestrator ───

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
    const esWords = ['el', 'la', 'los', 'las', 'de', 'que', 'en', 'un', 'una', 'es', 'falla', 'error', 'pantalla', 'equipo'];
    const words = text.toLowerCase().split(/\W+/);
    const esCount = words.filter(w => esWords.includes(w)).length;
    return esCount > 0 ? 'es' : 'en';
  }

  async *processQuery(
    query: string,
    options: {
      uiLanguage?: 'en' | 'es';
      responseLanguage?: 'auto' | 'en' | 'es';
      evidenceMode?: 'original' | 'translated' | 'both';
      peerPublicKey?: string;
    },
    documentId?: string,
    imageBase64?: string
  ): AsyncGenerator<{ type: string; data: unknown }> {
    
    const uiLang = options.uiLanguage || 'en';
    const targetLang = (!options.responseLanguage || options.responseLanguage === 'auto') 
      ? this.detectLang(query) 
      : options.responseLanguage;

    // 1. Triage Phase
    const triageInfo = await this.triageAgent.run(query, targetLang, imageBase64, options.peerPublicKey);
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
    // Provide both the original query and the extracted signals for a richer semantic search
    const searchQuery = triageResult.extractedSignals && triageResult.extractedSignals.length > 0 
      ? `${query} ${triageResult.extractedSignals.join(' ')}` 
      : query;
    const evidence = await this.evidenceAgent.run(searchQuery, documentId);
    
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
    const serviceGen = this.serviceAgent.streamRun(triageResult.category, evidence, targetLang, query, options.peerPublicKey);
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
