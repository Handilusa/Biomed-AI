// ─── Biomed Field Copilot — Shared Type Definitions ───
// All core interfaces used across the multi-agent system, RAG pipeline, logging, and API.

// ────────────────────────────────────────────
// Agent & Triage Classification
// ────────────────────────────────────────────

/** The possible problem categories classified by the Triage Agent. */
export type TriageCategory =
  | 'accessory_consumable'
  | 'wiring_connector'
  | 'power_source'
  | 'internal_module'
  | 'configuration_use'
  | 'error_code'
  | 'calibration'
  | 'false_clinical_problem';

export interface TriageResult {
  category: TriageCategory;
  confidence: number;
  extractedSignals: string[];
  reasoning: string;
}

// ────────────────────────────────────────────
// Agent Responses
// ────────────────────────────────────────────

export type AgentRole = 'triage' | 'manual_evidence' | 'service_logic' | 'compliance' | 'orchestrator';

export type FinalDisposition = 'replace_accessory' | 'swap_test' | 'escalate' | 'clinical_referral' | 'recalibrate' | 'follow_error_tree';

/** Structured output from the Service Logic Agent — always LLM-generated. */
export interface ServiceLogicOutput {
  /** Direct, actionable troubleshooting steps for the technician */
  instructions: string;
  /** Which manual sections/pages informed the answer */
  evidence_used: string[];
  /** Brief technical rationale explaining why this action is recommended */
  reasoning_summary: string;
  /** How well the manual evidence supports the recommendation (0-1) */
  confidence: number;
}

/** Unified response from any agent in the pipeline. */
export interface AgentResponse {
  /** The generated text content */
  content: string;
  /** Which agent produced this response */
  agent: AgentRole;
  /** RAG source citations (Manual Evidence Agent) */
  sources?: RAGSource[];
  /** Medical disclaimers (Compliance Agent) */
  disclaimers?: string[];
  /** Performance statistics from the completion */
  stats?: CompletionStats;
  /** The classified intent/triage category */
  triageCategory?: TriageCategory;
  /** ISO timestamp of when the response was generated */
  timestamp: string;
  /** Tools called during this step */
  toolsCalled?: string[];
  /** Final recommended disposition (Compliance Agent) */
  finalDisposition?: FinalDisposition;
  /** Which manual sections informed the answer (Service Logic Agent) */
  evidenceUsed?: string[];
  /** Technical rationale for the recommended action */
  reasoningSummary?: string;
}

/** A single RAG source citation. */
export interface RAGSource {
  document: string;
  chunk: string;
  translatedChunk?: string;
  similarity: number;
}

// ────────────────────────────────────────────
// Tool Calling Schemas
// ────────────────────────────────────────────

export interface IdentifyAccessoryFailureTool {
  name: 'identify_accessory_failure';
  parameters: {
    accessory_type: string;
    failure_symptoms: string[];
  };
}

export interface RunSwapTestLogicTool {
  name: 'run_swap_test_logic';
  parameters: {
    component_to_swap: string;
    expected_outcome: string;
  };
}

export interface ExtractAlarmReferenceTool {
  name: 'extract_alarm_reference';
  parameters: {
    alarm_code: string;
    alarm_text: string;
  };
}

export interface EstimateReplaceVsEscalateTool {
  name: 'estimate_replace_vs_escalate';
  parameters: {
    failed_component: string;
    confidence_in_failure: number;
    recommended_action: 'replace' | 'escalate';
  };
}

export type CopilotTool = 
  | IdentifyAccessoryFailureTool
  | RunSwapTestLogicTool
  | ExtractAlarmReferenceTool
  | EstimateReplaceVsEscalateTool;

// ────────────────────────────────────────────
// Completion & Performance Metrics
// ────────────────────────────────────────────

export interface CompletionStats {
  ttft_ms: number;
  tokens_per_second: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_time_ms: number;
  model: string;
}

// ────────────────────────────────────────────
// Logging
// ────────────────────────────────────────────

/** A single structured log entry for the evidence bundle. */
export interface LogEntry {
  timestamp: string;
  request_id: string;
  agent: AgentRole;
  model: string;
  query: string;
  prompt_tokens: number;
  completion_tokens: number;
  ttft_ms: number;
  tokens_per_second: number;
  total_time_ms: number;
  rag_chunks_used: number;
  memory_mb?: number;
  has_disclaimers: boolean;
  
  // New Biomed Field Copilot fields
  selected_document?: string;
  triage_category?: TriageCategory;
  tools_called?: string[];
  image_input_present?: boolean;
  final_disposition?: FinalDisposition;
  assistant_response?: string;
}

// ────────────────────────────────────────────
// Demo Runner
// ────────────────────────────────────────────

export interface DemoQuery {
  id: string;
  query: string;
  expectedCategory: TriageCategory;
  description: string;
  documentId?: string;
  imageBase64?: string;
}

// ────────────────────────────────────────────
// Model Management
// ────────────────────────────────────────────

export type ModelRole = 'llm' | 'embeddings' | 'vision' | 'nmt_en_es' | 'nmt_es_en';

export interface LoadedModel {
  role: ModelRole;
  modelId: string;
  filename: string;
  loadedAt: string;
}

export interface ModelManagerStatus {
  models: LoadedModel[];
  totalModelsLoaded: number;
}

// ────────────────────────────────────────────
// RAG
// ────────────────────────────────────────────

export interface LoadedDocument {
  filename: string;
  content: string;
  type: 'pdf' | 'txt' | 'md';
  sizeBytes: number;
}

export interface DocumentChunk {
  document: string;
  text: string;
  index: number;
  offset: number;
}

export interface SearchResult {
  text: string;
  document: string;
  similarity: number;
  translatedText?: string;
}

// ────────────────────────────────────────────
// Server / API
// ────────────────────────────────────────────

export interface ChatRequest {
  query: string;
  sessionId?: string;
  uiLanguage?: 'en' | 'es';
  responseLanguage?: 'auto' | 'en' | 'es';
  evidenceMode?: 'original' | 'translated' | 'both';
  documentId?: string;
  imageBase64?: string; // New field for OCR / Vision
  peerPublicKey?: string; // New field for P2P swarm delegated inference
}

export type SSEEventType =
  | 'triage'
  | 'rag_sources'
  | 'content_delta'
  | 'thinking_delta'
  | 'stats'
  | 'disclaimers'
  | 'tool_call'
  | 'done'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime_seconds: number;
  memory_rss_bytes?: number;
  models: ModelManagerStatus;
  rag: {
    indexed_documents: number;
    total_chunks: number;
  };
  version: string;
}
