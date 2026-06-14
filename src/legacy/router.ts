// ─── Edge MedTech Copilot - Deterministic Intent Router ───
// Keyword/regex-based classifier. No model inference.
// Bilingual EN/ES keyword support.

import type { ClassificationResult, IntentType } from '../types.js';

// ────────────────────────────────────────────
// Keyword Dictionaries
// ────────────────────────────────────────────

/** Keywords strongly associated with technical/device issues */
const TECHNICAL_KEYWORDS: string[] = [
  // Equipment types (EN)
  'ventilator', 'monitor', 'infusion pump', 'pump', 'defibrillator', 'defib',
  'x-ray', 'xray', 'ct scan', 'ct scanner', 'mri', 'ultrasound', 'ecg', 'ekg',
  'patient monitor', 'anesthesia machine', 'autoclave', 'sterilizer',
  'electrosurgical', 'esu', 'cautery', 'incubator', 'cpap', 'bipap',
  'dialysis', 'hemodialysis', 'centrifuge', 'microscope', 'endoscope',
  'telemetry', 'vital signs', 'blood gas analyzer', 'glucometer',
  // Equipment types (ES)
  'ventilador', 'bomba de infusión', 'bomba infusión', 'desfibrilador',
  'monitor de paciente', 'máquina de anestesia', 'esterilizador',
  'electrobisturí', 'incubadora', 'diálisis', 'hemodiálisis',
  'centrífuga', 'microscopio', 'endoscopio', 'telemetría',
  'signos vitales', 'gasómetro', 'glucómetro',
  // Technical actions (EN)
  'troubleshoot', 'troubleshooting', 'calibrate', 'calibration',
  'maintenance', 'repair', 'fix', 'replace', 'inspect', 'check',
  'alarm', 'error', 'error code', 'fault', 'failure', 'malfunction',
  'self-test', 'selftest', 'diagnostic', 'reset', 'reboot',
  'battery', 'power supply', 'sensor', 'probe', 'transducer',
  'cable', 'connector', 'display', 'screen', 'led', 'beep',
  'firmware', 'software update', 'configuration', 'settings',
  // Technical actions (ES)
  'calibrar', 'calibración', 'mantenimiento', 'reparar', 'reparación',
  'reemplazar', 'inspeccionar', 'verificar', 'alarma', 'fallo',
  'avería', 'prueba automática', 'autotest', 'diagnóstico',
  'reiniciar', 'batería', 'fuente de alimentación', 'sonda',
  'transductor', 'pantalla', 'actualización',
  // Measurement parameters
  'spo2', 'nibp', 'ibp', 'etco2', 'co2', 'fio2', 'peep',
  'tidal volume', 'minute volume', 'respiratory rate', 'heart rate',
  'blood pressure', 'temperature', 'waveform',
  // Common failure phrases (EN & ES)
  'won\'t turn on', 'wont turn on', 'does not turn on', 'doesn\'t turn on',
  'doesn\'t work', 'does not work', 'broken', 'not working', 'won\'t start',
  'no prende', 'no enciende', 'no arranca', 'no funciona', 'roto', 'rota',
  'se apaga', 'se apaga solo', 'no marca', 'pantalla negra', 'falla',
  // Measurement parameters (ES)
  'volumen tidal', 'volumen minuto', 'frecuencia respiratoria',
  'frecuencia cardíaca', 'presión arterial', 'temperatura',
  // Common alarm terms
  'probe off', 'lead off', 'occlusion', 'air in line', 'air-in-line',
  'over pressure', 'overpressure', 'low battery', 'no signal',
  'motion artifact', 'artifact', 'noise', 'interference',
  'high pressure', 'low pressure', 'apnea', 'disconnect',
  // Common alarm terms (ES)
  'sonda desconectada', 'oclusión', 'aire en línea', 'sobrepresión',
  'batería baja', 'sin señal', 'artefacto de movimiento', 'artefacto',
  'ruido', 'interferencia', 'presión alta', 'presión baja', 'desconexión',
];

/** Keywords strongly associated with medical/educational context */
const MEDICAL_KEYWORDS: string[] = [
  // Clinical concepts (EN)
  'clinical risk', 'clinical risks', 'patient safety', 'patient harm',
  'pathophysiology', 'pathology', 'physiology', 'anatomy',
  'pharmacology', 'drug', 'medication', 'dosage', 'dose',
  'symptom', 'symptoms', 'diagnosis', 'prognosis',
  'disease', 'condition', 'disorder', 'syndrome',
  'treatment', 'therapy', 'intervention', 'procedure',
  'complication', 'complications', 'side effect', 'adverse event',
  'infection', 'sepsis', 'hemorrhage', 'bleeding',
  'cardiac arrest', 'arrhythmia', 'hypoxia', 'hypoxemia',
  'hypertension', 'hypotension', 'tachycardia', 'bradycardia',
  'respiratory failure', 'pneumothorax', 'edema', 'shock',
  'barotrauma', 'volutrauma', 'atelectasis',
  'ischemia', 'embolism', 'thrombosis', 'anaphylaxis',
  'burn', 'electrical injury', 'radiation exposure',
  // Medical roles and escalation
  'doctor', 'physician', 'nurse', 'specialist', 'escalate',
  'refer', 'referral', 'consult', 'consultation',
  'emergency', 'urgent', 'critical', 'life-threatening',
  // Clinical concepts (ES)
  'riesgo clínico', 'riesgos clínicos', 'seguridad del paciente',
  'fisiopatología', 'patología', 'fisiología', 'anatomía',
  'farmacología', 'fármaco', 'medicamento', 'medicación', 'dosis',
  'síntoma', 'síntomas', 'diagnóstico', 'pronóstico',
  'enfermedad', 'condición', 'trastorno', 'síndrome',
  'tratamiento', 'terapia', 'intervención', 'procedimiento',
  'complicación', 'complicaciones', 'efecto secundario', 'evento adverso',
  'infección', 'hemorragia', 'sangrado',
  'paro cardíaco', 'arritmia', 'hipoxia', 'hipoxemia',
  'hipertensión', 'hipotensión', 'taquicardia', 'bradicardia',
  'insuficiencia respiratoria', 'neumotórax', 'edema',
  'barotrauma', 'atelectasia', 'isquemia', 'embolia', 'trombosis',
  'anafilaxia', 'quemadura', 'lesión eléctrica',
  // Escalation (ES)
  'médico', 'enfermero', 'especialista', 'escalar',
  'derivar', 'derivación', 'consulta',
  'emergencia', 'urgente', 'crítico',
  // Educational triggers (EN + ES)
  'what is', 'what are', 'explain', 'why is', 'how does',
  'what happens', 'what causes', 'risk of', 'risks of',
  'importance of', 'impact of', 'effect of', 'effects of',
  'qué es', 'qué son', 'explicar', 'explica', 'por qué',
  'qué pasa', 'qué causa', 'riesgo de', 'riesgos de',
  'importancia de', 'impacto de', 'efecto de', 'efectos de',
];

/** Patterns indicating greetings or off-topic content */
const OTHER_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|hola|buenos días|buenas tardes|buenas noches)\s*[!.?]*$/i,
  /^(thanks|thank you|gracias|thx)\s*[!.]*$/i,
  /^(bye|goodbye|adiós|nos vemos)\s*[!.]*$/i,
  /^(who are you|what are you|quién eres|qué eres)/i,
  /^(tell me a joke|cuéntame un chiste)/i,
  /^(what time|qué hora|weather|clima)/i,
];

// ────────────────────────────────────────────
// Classification Logic
// ────────────────────────────────────────────

/**
 * Classify user intent using deterministic keyword/regex matching.
 * No model inference involved - fast and reliable.
 */
export function classifyIntent(query: string): ClassificationResult {
  const normalizedQuery = query.toLowerCase().trim();

  // 1. Check for greetings/off-topic first
  for (const pattern of OTHER_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        intent: 'other',
        confidence: 1.0,
        matchedKeywords: [],
        reasoning: 'Matched greeting/off-topic pattern',
      };
    }
  }

  // 2. Count keyword matches for each category
  const techMatches = findMatches(normalizedQuery, TECHNICAL_KEYWORDS);
  const medMatches = findMatches(normalizedQuery, MEDICAL_KEYWORDS);

  const techScore = techMatches.length;
  const medScore = medMatches.length;

  // 3. Determine intent based on scores
  if (techScore === 0 && medScore === 0) {
    // No keyword matches - check for question patterns
    if (/\?/.test(query) || /^(how|what|why|when|where|can|could|should|is|are|do|does|cómo|qué|por qué|cuándo|dónde|puede|debería)/i.test(normalizedQuery)) {
      // Ambiguous question - default to technical (RAG can help more)
      return {
        intent: 'technical_device_issue',
        confidence: 0.4,
        matchedKeywords: [],
        reasoning: 'No specific keywords matched; defaulting to technical for RAG support',
      };
    }
    return {
      intent: 'other',
      confidence: 0.6,
      matchedKeywords: [],
      reasoning: 'No relevant keywords detected',
    };
  }

  if (techScore > medScore) {
    return {
      intent: 'technical_device_issue',
      confidence: techScore >= 3 ? 1.0 : techScore >= 2 ? 0.85 : 0.7,
      matchedKeywords: techMatches,
      reasoning: `Technical keywords (${techScore}) outweigh medical (${medScore})`,
    };
  }

  if (medScore > techScore) {
    return {
      intent: 'medical_educational_context',
      confidence: medScore >= 3 ? 1.0 : medScore >= 2 ? 0.85 : 0.7,
      matchedKeywords: medMatches,
      reasoning: `Medical keywords (${medScore}) outweigh technical (${techScore})`,
    };
  }

  // Tie - prefer technical (RAG context helps more)
  return {
    intent: 'technical_device_issue',
    confidence: 0.6,
    matchedKeywords: [...techMatches, ...medMatches],
    reasoning: `Tie between technical (${techScore}) and medical (${medScore}); defaulting to technical for RAG support`,
  };
}

/**
 * Find which keywords from the list appear in the query.
 */
function findMatches(query: string, keywords: string[]): string[] {
  const matches: string[] = [];
  for (const keyword of keywords) {
    // Use word boundary for single words, simple includes for multi-word phrases
    if (keyword.includes(' ')) {
      if (query.includes(keyword)) {
        matches.push(keyword);
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(query)) {
        matches.push(keyword);
      }
    }
  }
  return matches;
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
