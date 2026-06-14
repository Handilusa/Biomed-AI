// ─── Biomed Field Copilot - Global Safety Rules ───

export interface SafetyRule {
  id: string;
  name: string;
  // A rule matches if we find at least one word from group A AND at least one word from group B
  // in either the user query or the generated instructions.
  groupA: RegExp[];
  groupB: RegExp[];
  // If the rule is triggered, these warnings must be injected
  warning: {
    en: string;
    es: string;
  };
  // The correct safe action that must be present/enforced
  correctiveAction: {
    en: string;
    es: string;
  };
  // The conceptual correction of common myths
  conceptualCorrection?: {
    en: string;
    es: string;
  };
  // The disposition to force programmatically
  forcedDisposition: 'escalate' | 'clinical_referral' | 'replace_accessory' | 'swap_test';
}

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: 'defibrillator_direct_discharge',
    name: 'Defibrillator High Voltage Current Measurement & Impedance',
    groupA: [
      /\b(defibrillator|defib|desfibrilador|desfib|aed|dea)\b/i,
      /\b(parche|pad|electrode)\b/i  // pads alone can trigger groupA if groupB also has defibrillator context
    ],
    groupB: [
      // Direct measurement attempts (dangerous)
      /\b(medir|medici[oó]n|medida|measure|measuring)\b.*\b(corriente|current|amperaje|potencia|power|discharge|descarga|energ[ií]a|energy|voltaje|voltage)\b/i,
      /\b(mult[ií]metro|multimeter|tester|amper[ií]metro|amp\s*meter|volt[ií]metro|voltmeter|osciloscopio|oscilloscope)\b/i,
      // Power/energy delivery language (conceptual misunderstanding - pads are passive)
      /\b(suficiente|enough|insuficiente|insufficient|poca|baja|low|falta)\b.*\b(potencia|power|energ[ií]a|energy|descarga|discharge)\b/i,
      /\b(potencia|power|energ[ií]a|energy|descarga|discharge)\b.*\b(suficiente|enough|insuficiente|insufficient|poca|baja|low|falta)\b/i,
      /\b(no\s+(entrega|da|deliver|genera|produce|transmit))\b.*\b(potencia|power|energ[ií]a|energy)\b/i,
      /\b(potencia|power|energ[ií]a|energy)\b.*\b(no\s+(entrega|da|deliver|genera|produce|llega))\b/i,
      // Verification of discharge output
      /\b(verificar|verify|comprobar|check|confirmar|confirm|test)\b.*\b(descarga|discharge|energ[ií]a\s+(entregada|delivered)|potencia\s+(de\s+salida|output))\b/i
    ],
    warning: {
      en: '⚠️ ARC FLASH AND ELECTROCUTION HAZARD: A defibrillator discharges up to 200 J or 360 J at voltages exceeding 2,000 V. Attempting to measure discharge current directly with a conventional multimeter/tester will cause an arc flash, destroy the instrument, and result in fatal electrocution of the technician.',
      es: '⚠️ RIESGO DE ARCO ELÉCTRICO Y MUERTE: Un desfibrilador descarga energía acumulada de hasta 200 J o 360 J a voltajes que superan los 2,000 V. Intentar medir la corriente de descarga de manera directa (por ejemplo, con un multímetro convencional) provocará un arco eléctrico, destruirá el instrumento de medición y puede causar electrocución fatal al técnico.'
    },
    correctiveAction: {
      en: '💡 REQUIREMENT FOR DEFIBRILLATOR ANALYZER: To verify energy delivery, the discharge must only be performed onto a specialized Defibrillator Analyzer (a calibrated 50 Ω dummy load). Always verify energy delivery using an approved defibrillator analyzer.',
      es: '💡 FALTA DEL ANALIZADOR DE DESFIBRILADORES: Para realizar una verificación de entrega de energía (energy delivery test), es obligatorio descargar el equipo sobre un Analizador de Desfibriladores (una carga fantasma calibrada, típicamente de 50 Ω). Realice descargas de prueba únicamente sobre un analizador de desfibriladores homologado.'
    },
    conceptualCorrection: {
      en: '🔬 PASSIVE ACCESSORY IMPEDANCE: Defibrillator pads do not generate power; they are passive conductors. Worn, dry, or expired pads increase contact impedance, which causes the defibrillator to abort or limit the high-voltage discharge to prevent patient burns, reporting a delivery failure.',
      es: '🔬 CONCEPTO FÍSICO IMPRECISO: La afirmación "los parches no entregan potencia" es incorrecta. Los parches son conductores pasivos. Un parche vencido o seco aumenta la impedancia de contacto, obligando al desfibrilador a limitar o abortar la descarga de alta tensión para evitar quemaduras graves, lo que reporta un fallo de transferencia.'
    },
    forcedDisposition: 'escalate'
  },
  {
    id: 'oxygen_line_lubrication',
    name: 'Oxygen Line Hydrocarbon Lubrication Hazard',
    groupA: [
      /\b(oxygen|oxigeno|ox[ií]geno|o2|o₂)\b/i,
      /\b(flowmeter|fluj[oó]metro|caudalímetro|regulador\s+de\s+ox[ií]geno|oxygen\s+regulator)\b/i
    ],
    groupB: [
      /\b(lubricante|lubricant|lubricar|lubricate|lubricating)\b/i,
      /\b(grasa|grease|greasing)\b/i,
      /\b(aceite|oil|oiling)\b/i,
      /\b(engrasar|engrasante|engrasado)\b/i,
      /\b(lubricaci[oó]n|lubrication)\b/i,
      /\b(vaselina|vaseline|petroleum\s+jelly|petrolatum)\b/i,
      /\b(wd[\s-]?40|silicona|silicone)\b/i,
      /\b(untar|aplicar\s+(grasa|aceite|lubricante))\b/i
    ],
    warning: {
      en: '⚠️ OXYGEN COMBUSTION AND EXPLOSION HAZARD: High-pressure oxygen reacts spontaneously and violently with hydrocarbons (common greases, oils, or lubricants), creating a severe risk of spontaneous fire or explosion.',
      es: '⚠️ RIESGO DE COMBUSTIÓN Y EXPLOSIÓN: El oxígeno a alta presión reacciona de forma espontánea y extremadamente violenta con hidrocarburos (grasas, aceites o lubricantes comunes), lo que puede causar un incendio espontáneo o una explosión.'
    },
    correctiveAction: {
      en: '💡 OXYGEN-SAFE LUBRICANT REQUIREMENT: Use only certified perfluorinated synthetic lubricants approved for oxygen service (such as Krytox). Ensure all tools, hands, and parts are completely free from conventional grease or oil.',
      es: '💡 USO DE LUBRICANTES ESPECIALIZADOS: Use exclusivamente lubricantes sintéticos perfluorados aprobados para servicio de oxígeno (como Krytox). Asegúrese de que las manos, herramientas y piezas estén completamente libres de aceites o grasas convencionales.'
    },
    forcedDisposition: 'escalate'
  },
  {
    id: 'crt_residual_high_voltage',
    name: 'CRT Monitor Residual High-Voltage Discharge',
    groupA: [
      /\b(crt|trc|cathode\s+ray|rayos\s+cat[oó]dicos|cinescopio|flyback)\b/i,
      /\b(tubo\s+de\s+imagen|picture\s+tube|tubo\s+cat[oó]dico)\b/i
    ],
    groupB: [
      /\b(abrir|manipular|desarmar|disassemble|destapar|open|repair|reparar|reemplazar|replace)\b/i,
      /\b(descarga|discharge|tocar|touch|limpiar|clean|service|servicio|mantenimiento|maintenance)\b/i,
      /\b([aá]nodo|anode|chupón|suction\s+cup|ventosa)\b/i
    ],
    warning: {
      en: '⚠️ RESIDUAL HIGH-VOLTAGE DISCHARGE HAZARD: Cathode ray tubes (CRTs) and flyback transformers can store lethal electrical charges (up to 25 kV) for weeks after power is disconnected.',
      es: '⚠️ RIESGO DE DESCARGA ELÉCTRICA RESIDUAL: Los tubos de rayos catódicos (CRT) y transformadores flyback pueden almacenar cargas eléctricas letales (de hasta 25 kV) durante semanas, incluso después de desconectar el equipo de la red.'
    },
    correctiveAction: {
      en: '💡 ANODE DISCHARGE REQUIREMENT: Always discharge the CRT anode to ground safely using a well-insulated high-voltage discharge probe before handling or performing internal service.',
      es: '💡 DESCARGA DEL ÁNODO OBLIGATORIA: Es obligatorio descargar el ánodo del tubo CRT a tierra de manera segura utilizando una sonda de descarga de alto voltaje aislada antes de manipularlo o realizar mantenimiento interno.'
    },
    forcedDisposition: 'escalate'
  },
  {
    id: 'laser_radiation_hazard',
    name: 'Laser Radiation Retinal Burn & Eye Safety',
    groupA: [
      /\b(laser|l[aá]ser)\b/i
    ],
    groupB: [
      /\b(calibrar|calibracion|calibraci[oó]n|calibrate|calibration)\b/i,
      /\b(disparar|disparo|fire|firing|emitir|emit)\b/i,
      /\b(probar|prueba|test|testing|verificar|verificaci[oó]n|verify)\b/i,
      /\b(activar|activate|encender|turn\s+on|operar|operate|operating)\b/i,
      /\b(alinear|alineaci[oó]n|align|alignment)\b/i,
      /\b(sin\s+(gafas|protecci[oó]n|lentes|goggles|eyewear|glasses))\b/i,
      /\b(sin\s+protecci[oó]n\s+ocular|without\s+(eye|ocular)\s+protection)\b/i
    ],
    warning: {
      en: '⚠️ PERMANENT RETINAL BURN AND BLINDNESS HAZARD: Direct or scattered radiation from surgical, therapeutic, or ophthalmic lasers (e.g., CO2, Nd:YAG) can cause immediate, irreversible blindness or skin burns.',
      es: '⚠️ RIESGO DE LESIÓN OCULAR PERMANENTE Y CEGUERA: La radiación directa o difusa de láseres quirúrgicos, terapéuticos u oftálmicos (como CO2 o Nd:YAG) puede causar ceguera instantánea e irreversible o quemaduras.'
    },
    correctiveAction: {
      en: '💡 WAVELENGTH-SPECIFIC PROTECTION REQUIRED: Always wear certified safety goggles matching the specific laser wavelength and optical density (OD). Set up physical barriers, safety screens, and active warning signs outside the testing area.',
      es: '💡 PROTECCIÓN OCULAR ESPECÍFICA REQUERIDA: Utilice siempre gafas de seguridad (protective eyewear/goggles) homologadas con la densidad óptica (OD) adecuada para la longitud de onda específica del láser. Instale pantallas de seguridad y carteles de advertencia de láser activo.'
    },
    forcedDisposition: 'escalate'
  }
];

export interface TriggeredSafetyWarning {
  id: string;
  name: string;
  warningText: string;
  correctiveText: string;
  conceptualText?: string;
  forcedDisposition: 'escalate' | 'clinical_referral' | 'replace_accessory' | 'swap_test';
}

/**
 * Checks query, evidence, and instructions for safety violations.
 * Context-aware check: both Group A and Group B must match in the combined text.
 */
export function checkSafetyRules(query: string, instructions: string, lang: 'en' | 'es', evidenceText: string = ''): TriggeredSafetyWarning[] {
  const triggered: TriggeredSafetyWarning[] = [];
  const textToCheck = `${query}\n${evidenceText}\n${instructions}`;

  for (const rule of SAFETY_RULES) {
    const hasGroupA = rule.groupA.some(regex => regex.test(textToCheck));
    const hasGroupB = rule.groupB.some(regex => regex.test(textToCheck));

    if (hasGroupA && hasGroupB) {
      triggered.push({
        id: rule.id,
        name: rule.name,
        warningText: rule.warning[lang],
        correctiveText: rule.correctiveAction[lang],
        conceptualText: rule.conceptualCorrection ? rule.conceptualCorrection[lang] : undefined,
        forcedDisposition: rule.forcedDisposition
      });
    }
  }

  return triggered;
}
