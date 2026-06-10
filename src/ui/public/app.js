// ─── Edge MedTech Copilot — Client-Side Application ───
// Handles SSE streaming, message rendering, i18n, and UI state.

(() => {
  'use strict';

  // ────────────────────────────────────────────
  // i18n Translations
  // ────────────────────────────────────────────
  const I18N = {
    en: {
      disclaimer_banner: 'Field reference tool. Always verify service logic with official manufacturer specifications.',
      system_status: 'System Status',
      models: 'Models',
      knowledge_base: 'Knowledge Base',
      server: 'Server',
      session_stats: 'Session Stats',
      queries: 'Queries',
      avg_ttft: 'Avg TTFT',
      avg_tps: 'Avg TPS',
      total_tokens: 'Total Tokens',
      privacy_badge: 'All AI runs locally — zero cloud',
      chat_title: 'Biomed Field Copilot',
      chat_desc: 'Technical troubleshooting & field heuristics',
      clear_chat: 'Clear chat',
      welcome_title: 'Biomed Field Copilot',
      welcome_text: 'Local field troubleshooting for biomedical equipment. Select a manual, upload an alarm screen if needed, and get equipment-specific service guidance.',
      chip_spo2: 'SpO2 probe-off errors',
      chip_ventilator: 'Ventilator tidal volume risks',
      chip_infusion: 'Infusion pump occlusion',
      chip_defib: 'Defibrillator impedance',
      input_placeholder: 'Describe the failure or paste an alarm code...',
      input_hint: 'Press Enter to send • Shift+Enter for new line',
      agent_technical: 'Technical',
      agent_medical: 'Medical',
      thinking: 'Thinking...',
      sources_title: 'Sources',
      no_response: 'No response generated.',
      error_generic: 'An error occurred. Please try again.',
      error_init: 'System is still initializing. Please wait a moment.',
      select_equipment: 'Equipment Manual:',
      select_equipment_placeholder: 'Select an equipment manual...',
      upload_btn: 'Upload PDF',
      dropzone_prompt: 'Drag & drop an image of the error screen/alarm, or click to browse',
      processing_ocr: 'Processing OCR locally...',
      ui_language: 'UI Language',
      translation_settings: 'Translation Settings',
      response_language: 'Response Language',
      evidence_mode: 'Evidence Mode',
      dashboard_title: 'Local Edge System',
      dashboard_desc: 'All critical diagnostic models are loaded and functioning nominally.',
      session_detail_title: 'DIAGNOSTIC SESSION DETAIL',
      rerun_in_chat: 'Rerun in Chat',
      older_session_notice: 'Older session entry: The full chat response was not stored in this historical log. You can re-run this diagnostic query in the Chat window.',
      detail_query: 'Technician Query',
      detail_response: 'Chatbot Response',
      detail_metadata: 'Session Metadata',
      detail_tech: 'Technician',
      detail_date: 'Date & Time',
      detail_disposition: 'Recommended Disposition',
      detail_category: 'Triage Category',
      detail_document: 'Manual Document',
      detail_agent: 'Processing Agent',
      detail_metrics: 'Performance Metrics'
    },
    es: {
      disclaimer_banner: 'Herramienta de referencia de campo. Verifica siempre la lógica de servicio con especificaciones oficiales.',
      system_status: 'Estado del Sistema',
      models: 'Modelos',
      knowledge_base: 'Base de Conocimiento',
      server: 'Servidor',
      session_stats: 'Estadísticas de Sesión',
      queries: 'Consultas',
      avg_ttft: 'TTFT Medio',
      avg_tps: 'TPS Medio',
      total_tokens: 'Tokens Totales',
      privacy_badge: 'Toda la IA corre en local — cero nube',
      chat_title: 'Biomed Field Copilot',
      chat_desc: 'Troubleshooting técnico de campo',
      clear_chat: 'Limpiar chat',
      welcome_title: 'Biomed Field Copilot',
      welcome_text: 'Troubleshooting de campo para equipamiento biomédico. Selecciona un manual, sube una pantalla de alarma si es necesario, y recibe guía de servicio específica.',
      chip_spo2: 'Errores de SpO2 "probe off"',
      chip_ventilator: 'Riesgos de volumen tidal en ventilador',
      chip_infusion: 'Alarma de oclusión en bomba',
      chip_defib: 'Impedancia del desfibrilador',
      input_placeholder: 'Describe el fallo o pega un código de alarma...',
      input_hint: 'Enter para enviar • Shift+Enter para nueva línea',
      agent_technical: 'Técnico',
      agent_medical: 'Médico',
      thinking: 'Pensando...',
      sources_title: 'Fuentes',
      no_response: 'No se generó respuesta.',
      error_generic: 'Ocurrió un error. Inténtalo de nuevo.',
      error_init: 'El sistema se está inicializando. Espera un momento.',
      select_equipment: 'Manual de equipo:',
      select_equipment_placeholder: 'Selecciona un manual de equipo...',
      upload_btn: 'Subir PDF',
      dropzone_prompt: 'Arrastra una imagen de la pantalla de error/alarma, o haz clic',
      processing_ocr: 'Procesando OCR en local...',
      ui_language: 'Idioma de Interfaz',
      translation_settings: 'Ajustes de Traducción',
      response_language: 'Idioma de Respuesta',
      evidence_mode: 'Modo de Evidencia',
      dashboard_title: 'Sistema Edge Local',
      dashboard_desc: 'Todos los modelos de diagnóstico están cargados y funcionando nominalmente.',
      session_detail_title: 'DETALLE DE LA SESIÓN DE DIAGNÓSTICO',
      rerun_in_chat: 'Ejecutar en Chat',
      older_session_notice: 'Entrada de sesión antigua: La respuesta completa del chatbot no se guardó en este registro histórico. Puedes volver a ejecutar esta consulta de diagnóstico en la ventana de Chat.',
      detail_query: 'Consulta del Técnico',
      detail_response: 'Respuesta del Chatbot',
      detail_metadata: 'Metadatos de la Sesión',
      detail_tech: 'Técnico',
      detail_date: 'Fecha y Hora',
      detail_disposition: 'Disposición Recomendada',
      detail_category: 'Categoría de Triaje',
      detail_document: 'Manual / Documento',
      detail_agent: 'Agente de Procesamiento',
      detail_metrics: 'Métricas de Rendimiento'
    },
  };

  // ────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────
  let currentLang = 'en';
  let isStreaming = false;
  let lastSelectedDoc = null;
  const sessionStats = { queries: 0, ttftSum: 0, tpsSum: 0, totalTokens: 0 };

  // ────────────────────────────────────────────
  // DOM References
  // ────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const chatMessages = $('#chat-messages');
  const chatInput = $('#chat-input');
  const sendBtn = $('#send-btn');
  const welcomeMessage = $('#welcome-message');
  const dismissDisclaimer = $('#dismiss-disclaimer');
  const disclaimerBanner = $('#disclaimer-banner');
  const clearChatBtn = $('#clear-chat');
  const toggleSidebar = $('#toggle-sidebar');
  const sidebar = $('#sidebar');
  const documentSelect = $('#document-select');
  const imageDropzone = $('#image-dropzone');
  const imageUploadInput = $('#image-upload-input');
  const imagePreviewContainer = $('#image-preview-container');
  const imagePreview = $('#image-preview');
  const removeImageBtn = $('#remove-image-btn');
  const ocrStatus = $('#ocr-status');
  const dropzonePrompt = $('#dropzone-prompt');
  
  const responseLanguageSelect = $('#response-language-select');
  const evidenceModeSelect = $('#evidence-mode-select');

  let currentImageBase64 = null;
  let cachedHistoryEntries = [];

  // ────────────────────────────────────────────
  // i18n Engine
  // ────────────────────────────────────────────
  function t(key) {
    return I18N[currentLang]?.[key] ?? I18N.en[key] ?? key;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
    document.documentElement.setAttribute('data-lang', currentLang);
  }

  function setLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('.lang-toggle__btn').forEach((btn) => {
      btn.classList.toggle('lang-toggle__btn--active', btn.dataset.lang === lang);
    });
    applyI18n();
  }

  // ────────────────────────────────────────────
  // Auto-resize Textarea
  // ────────────────────────────────────────────
  function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }

  // ────────────────────────────────────────────
  // Message Rendering
  // ────────────────────────────────────────────
  function createMessageEl(role, opts = {}) {
    const { agent, agentLabel } = opts;
    const div = document.createElement('div');
    div.classList.add('message', `message--${role}`);
    if (agent) div.setAttribute('data-agent', agent);

    const avatar = document.createElement('div');
    avatar.classList.add('message__avatar');
    avatar.innerHTML = role === 'user' ? '<span class="material-symbols-outlined">person</span>' : (agent === 'technical' ? '<span class="material-symbols-outlined">build</span>' : '<span class="material-symbols-outlined">local_hospital</span>');

    const body = document.createElement('div');
    body.classList.add('message__body');

    // Meta line (agent badge + time)
    if (role === 'assistant' && agent) {
      const meta = document.createElement('div');
      meta.classList.add('message__meta');

      const badge = document.createElement('span');
      badge.classList.add('message__agent-badge', `message__agent-badge--${agent}`);
      badge.textContent = agentLabel || (agent === 'technical' ? t('agent_technical') : t('agent_medical'));
      meta.appendChild(badge);

      const time = document.createElement('span');
      time.classList.add('message__time');
      time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.appendChild(time);

      body.appendChild(meta);
    }

    const content = document.createElement('div');
    content.classList.add('message__content');
    body.appendChild(content);

    div.appendChild(avatar);
    div.appendChild(body);

    return { container: div, content, body };
  }

  function addUserMessage(text) {
    if (welcomeMessage) welcomeMessage.style.display = 'none';

    const { container, content } = createMessageEl('user');
    content.textContent = text;
    chatMessages.appendChild(container);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // ────────────────────────────────────────────
  // Sanitize Model Output (strip chain-of-thought)
  // ────────────────────────────────────────────
  const COT_PATTERNS = [
    /^we are given\b/i,
    /^according to\b/i,
    /^the (user|rules|system|critical|key|situation)\b/i,
    /^thus,/i,
    /^so\s/i,
    /^but\s/i,
    /^hmm/i,
    /^okay,/i,
    /^i recall\b/i,
    /^also noting\b/i,
    /^however,/i,
    /^looking at\b/i,
    /^let me\b/i,
    /^now,/i,
    /^wait\b/i,
  ];
  const COT_INLINE_PATTERNS = [
    /\bheuristic/i,
    /\bchain.of.thought/i,
    /\bthe rules (say|state|override)/i,
    /\bstrict compliance\b/i,
    /\bmy only option\b/i,
    /\btriage category\b/i,
    /\bdisposition should be\b/i,
    /\bfinalDisposition\b/i,
  ];

  function sanitizeModelOutput(text) {
    const lines = text.split('\n');
    const clean = [];
    let skip = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (COT_PATTERNS.some(p => p.test(trimmed))) { skip = true; continue; }
      if (COT_INLINE_PATTERNS.some(p => p.test(trimmed))) { continue; }
      if (skip && trimmed.length > 0 && !COT_PATTERNS.some(p => p.test(trimmed))) { skip = false; }
      if (!skip && trimmed.length > 0) { clean.push(line); }
    }
    return clean.join('\n').trim();
  }

  // ────────────────────────────────────────────
  // Simple Markdown → HTML
  // ────────────────────────────────────────────
  function renderMarkdown(text) {
    let html = text
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Blockquotes
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      // Unordered lists
      .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul> or <ol>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Paragraphs (lines not already wrapped)
    html = html
      .split('\n\n')
      .map((block) => {
        block = block.trim();
        if (!block) return '';
        if (block.startsWith('<')) return block;
        return `<p>${block}</p>`;
      })
      .join('\n');

    // Line breaks within paragraphs
    html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');

    return html;
  }

  // ────────────────────────────────────────────
  // Friendly Disposition Labels
  // ────────────────────────────────────────────
  function getFriendlyDisposition(disposition, lang) {
    const isEs = lang === 'es';
    switch (disposition) {
      case 'swap_test':
        return isEs 
          ? 'swap_test (reemplazar accesorio si la prueba de intercambio resulta exitosa; de lo contrario, inspeccionar conector o escalar)'
          : 'swap_test (replace accessory if swap-test passes; otherwise inspect connector or escalate)';
      case 'replace_accessory':
        return isEs 
          ? 'replace_accessory (reemplazar el accesorio / consumible directamente)'
          : 'replace_accessory (replace accessory / consumable directly)';
      case 'recalibrate':
        return isEs
          ? 'recalibrate (recalibrar el equipo y realizar pruebas de verificación)'
          : 'recalibrate (recalibrate equipment and perform verification tests)';
      case 'follow_error_tree':
        return isEs
          ? 'follow_error_tree (seguir el árbol de decisión de códigos de error del manual)'
          : 'follow_error_tree (follow the error code decision tree in the manual)';
      case 'clinical_referral':
        return isEs
          ? 'clinical_referral (remisión clínica; posible error de uso o configuración clínica)'
          : 'clinical_referral (clinical referral; suspect clinical usage or configuration error)';
      case 'escalate':
        return isEs
          ? 'escalate (escalar a diagnóstico de módulo interno o reparación en taller)'
          : 'escalate (escalate to internal module diagnosis / depot repair)';
      default:
        return disposition ? disposition.replace(/_/g, ' ') : '';
    }
  }

  // ────────────────────────────────────────────
  // Render Diagnostic Card Response
  // ────────────────────────────────────────────
  function renderDiagnosticResponse({
    triageCategory,
    reasoningSummary,
    evidenceUsed,
    instructions,
    finalDisposition,
    lang
  }) {
    let html = '';
    const isEs = lang === 'es';
    
    // Triage row
    if (triageCategory) {
      const displayCategory = triageCategory.replace(/_/g, ' ');
      html += `
        <div class="diag-row">
          <span class="diag-row__label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">label</span>Triage:</span>
          <span class="diag-row__value diag-row__value--triage">${displayCategory}</span>
        </div>
      `;
    }
    
    // Why this action row
    if (reasoningSummary) {
      html += `
        <div class="diag-row">
          <span class="diag-row__label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">lightbulb</span>${isEs ? 'Por qué esta acción' : 'Why this action'}:</span>
          <span class="diag-row__value">${reasoningSummary}</span>
        </div>
      `;
    }
    
    // Evidence row
    if (evidenceUsed) {
      html += `
        <div class="diag-row">
          <span class="diag-row__label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">menu_book</span>${isEs ? 'Evidencia' : 'Evidence'}:</span>
          <span class="diag-row__value">${evidenceUsed}</span>
        </div>
      `;
    }
    
    // Action row
    if (instructions && instructions.trim()) {
      const cleanInstructions = instructions.replace(/\\n/g, '\n');
      html += `
        <div class="diag-row diag-row--action">
          <span class="diag-row__label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">settings</span>${isEs ? 'Acción' : 'Action'}:</span>
          <div class="diag-row__instructions">${renderMarkdown(cleanInstructions.trim())}</div>
        </div>
      `;
    }
    
    // Disposition row
    if (finalDisposition) {
      const dispText = getFriendlyDisposition(finalDisposition, lang);
      html += `
        <div class="diag-row">
          <span class="diag-row__label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">flag</span>${isEs ? 'Disposición' : 'Disposition'}:</span>
          <span class="diag-row__value diag-row__value--disposition">${dispText}</span>
        </div>
      `;
    }
    
    return html ? `<div class="diagnostic-card">${html}</div>` : '';
  }

  // ────────────────────────────────────────────
  // SSE Chat Streaming
  // ────────────────────────────────────────────
  async function sendQuery(query) {
    if (isStreaming || !query.trim()) return;
    isStreaming = true;
    sendBtn.disabled = true;
    chatInput.disabled = true;

    addUserMessage(query);

    // Create assistant message shell
    let currentAgent = 'technical';
    let agentLabel = '';
    let contentText = '';
    let thinkingText = '';
    let sources = [];
    let disclaimers = [];
    let stats = null;

    // Placeholder with typing indicator
    const msgEl = document.createElement('div');
    msgEl.classList.add('message', 'message--assistant');
    msgEl.innerHTML = `
      <div class="message__avatar">⏳</div>
      <div class="message__body">
        <div class="message__content">
          <div class="typing-indicator">
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(msgEl);
    scrollToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lang: currentLang }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(data);
            } catch {
              // Skip malformed data
            }
          }
        }
      }
    } catch (err) {
      contentText = t('error_generic') + '\n\n' + (err.message || '');
    }

    // Helper to process SSE data within the stream
    let firstContentReceived = false;
    function handleSSEEvent(eventWrapper) {
      // The server sends: event: <type>\ndata: <json>\n\n
      // We parse the data from the SSE stream
      // Events come as { type, data } from our routes
    }

    // Finalize message
    updateAssistantMessage(msgEl, {
      agent: currentAgent,
      agentLabel,
      content: contentText || t('no_response'),
      thinking: thinkingText,
      sources,
      disclaimers,
      stats,
    });

    // Update session stats
    if (stats) {
      sessionStats.queries++;
      sessionStats.ttftSum += stats.ttft_ms || 0;
      sessionStats.tpsSum += stats.tokens_per_second || 0;
      sessionStats.totalTokens += (stats.prompt_tokens || 0) + (stats.completion_tokens || 0);
      updateStatsUI();
    }

    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
    scrollToBottom();
  }

  // Re-implemented with proper SSE parsing
  async function sendQueryV2(query) {
    if (isStreaming || !query.trim()) return;
    isStreaming = true;
    sendBtn.disabled = true;
    chatInput.disabled = true;

    addUserMessage(query);

    let currentAgent = 'orchestrator';
    let agentLabel = 'Biomed Field Copilot';
    let contentText = '';
    let thinkingText = '';
    let evidenceUsed = [];
    let sources = [];
    let disclaimers = [];
    let stats = null;
    let triageCategory = '';
    let finalDisposition = '';

    const sentImageBase64 = currentImageBase64;
    clearImageSelection();

    // Typing indicator
    const msgEl = document.createElement('div');
    msgEl.classList.add('message', 'message--assistant');
    msgEl.innerHTML = `
      <div class="message__avatar">⏳</div>
      <div class="message__body">
        <div class="message__content">
          <div class="typing-indicator">
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(msgEl);
    scrollToBottom();

    function renderLiveCard(showTypingIndicator = true) {
      const contentEl = msgEl.querySelector('.message__content');
      if (!contentEl) return;

      // Hide JSON block from the live rendered text
      let visibleText = contentText;
      const jsonStartIdx = visibleText.lastIndexOf('```json');
      if (jsonStartIdx !== -1) {
        visibleText = visibleText.substring(0, jsonStartIdx);
      } else {
        const braceIdx = visibleText.lastIndexOf('{"instructions"');
        if (braceIdx !== -1) {
          visibleText = visibleText.substring(0, braceIdx);
        }
      }
      
      visibleText = sanitizeModelOutput(visibleText);

      let evidenceText = '';
      if (Array.isArray(evidenceUsed) && evidenceUsed.length > 0) {
        evidenceText = evidenceUsed.join(', ');
      } else if (sources.length > 0) {
        evidenceText = sources.map(s => s.document).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      }

      const cardHtml = renderDiagnosticResponse({
        triageCategory,
        reasoningSummary: thinkingText,
        evidenceUsed: evidenceText,
        instructions: visibleText,
        finalDisposition,
        lang: currentLang
      });

      let finalHtml = cardHtml;
      if (showTypingIndicator) {
        finalHtml += `
          <div class="typing-indicator" style="margin-top: var(--space-sm); padding: var(--space-xs) 0 0 0;">
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
          </div>
        `;
      }
      contentEl.innerHTML = finalHtml;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          uiLanguage: currentLang, 
          responseLanguage: responseLanguageSelect ? responseLanguageSelect.value : 'auto',
          evidenceMode: evidenceModeSelect ? evidenceModeSelect.value : 'original',
          documentId: documentSelect.value,
          imageBase64: sentImageBase64 
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            let data;
            try { data = JSON.parse(line.slice(6)); } catch { continue; }

            switch (currentEventType) {
              case 'triage':
                triageCategory = data.category || '';
                const liveAvatar = msgEl.querySelector('.message__avatar');
                if (liveAvatar) liveAvatar.innerHTML = '<span class="material-symbols-outlined">local_hospital</span>';
                renderLiveCard();
                break;
              case 'rag_sources':
                sources = data.sources || [];
                renderLiveCard();
                break;
              case 'content_delta':
                contentText += data.text || '';
                renderLiveCard();
                scrollToBottom();
                break;
              case 'service_logic_meta':
                if (data.reasoning_summary) {
                  thinkingText = data.reasoning_summary;
                }
                if (data.evidence_used) {
                  evidenceUsed = data.evidence_used;
                }
                renderLiveCard();
                break;
              case 'thinking_delta':
                break;
              case 'stats':
                stats = data;
                break;
              case 'disclaimers':
                disclaimers = data.disclaimers || [];
                break;
              case 'error':
                contentText += '\n\n' + (data.message || t('error_generic'));
                renderLiveCard(false);
                break;
              case 'done':
                finalDisposition = data.finalDisposition || '';
                const finalSafetyNote = data.safetyNote || '';
                if (finalSafetyNote) {
                  disclaimers.push(`SAFETY NOTE: ${finalSafetyNote}`);
                }
                renderLiveCard(false);
                break;
            }
            currentEventType = '';
          }
        }
      }
    } catch (err) {
      contentText = t('error_generic') + '\n\n' + (err.message || '');
      renderLiveCard(false);
    }

    updateAssistantMessage(msgEl, {
      agent: currentAgent,
      agentLabel: agentLabel,
      content: contentText || t('no_response'),
      thinking: thinkingText,
      sources,
      disclaimers,
      stats,
      triageCategory,
      finalDisposition,
      evidenceUsed
    });

    if (stats) {
      sessionStats.queries++;
      sessionStats.ttftSum += stats.ttft_ms || 0;
      sessionStats.tpsSum += stats.tokens_per_second || 0;
      sessionStats.totalTokens += (stats.prompt_tokens || 0) + (stats.completion_tokens || 0);
      updateStatsUI();
    }

    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
    scrollToBottom();
    fetchSessions();
  }

  function updateAssistantMessage(msgEl, opts) {
    const { agent, agentLabel, content, thinking, sources, disclaimers, stats, triageCategory, finalDisposition, evidenceUsed } = opts;

    msgEl.setAttribute('data-agent', agent);

    // Avatar
    const avatar = msgEl.querySelector('.message__avatar');
    avatar.innerHTML = agent === 'technical' ? '<span class="material-symbols-outlined">build</span>' : '<span class="material-symbols-outlined">local_hospital</span>';

    // Body
    const body = msgEl.querySelector('.message__body');
    body.innerHTML = '';

    // Meta
    const meta = document.createElement('div');
    meta.classList.add('message__meta');
    const badge = document.createElement('span');
    badge.classList.add('message__agent-badge', `message__agent-badge--${agent}`);
    badge.textContent = agentLabel;
    meta.appendChild(badge);
    const time = document.createElement('span');
    time.classList.add('message__time');
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);
    body.appendChild(meta);

    // Content
    const contentEl = document.createElement('div');
    contentEl.classList.add('message__content');
    
    // Strip JSON block from final render
    let visibleFinalText = content;
    const finalJsonStartIdx = visibleFinalText.lastIndexOf('```json');
    if (finalJsonStartIdx !== -1) {
      visibleFinalText = visibleFinalText.substring(0, finalJsonStartIdx);
    } else {
      const braceIdx = visibleFinalText.lastIndexOf('{"instructions"');
      if (braceIdx !== -1) {
        visibleFinalText = visibleFinalText.substring(0, braceIdx);
      }
    }
    
    visibleFinalText = sanitizeModelOutput(visibleFinalText);
    
    let evidenceText = '';
    if (Array.isArray(evidenceUsed) && evidenceUsed.length > 0) {
      evidenceText = evidenceUsed.join(', ');
    } else if (sources && sources.length > 0) {
      evidenceText = sources.map(s => s.document).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    }

    contentEl.innerHTML = renderDiagnosticResponse({
      triageCategory,
      reasoningSummary: thinking,
      evidenceUsed: evidenceText,
      instructions: visibleFinalText,
      finalDisposition,
      sourcesCount: sources ? sources.length : 0,
      isStreaming: false,
      lang: currentLang
    });
    
    body.appendChild(contentEl);

    // Update Dashboard active session snippet
    const dashSnippet = document.getElementById('dash-latest-assistant-text');
    if (dashSnippet) {
      const cleanSnippetText = visibleFinalText.replace(/<[^>]*>/g, '').substring(0, 180).trim() + (visibleFinalText.length > 180 ? '...' : '');
      dashSnippet.textContent = cleanSnippetText || (currentLang === 'es' ? 'Se completó el análisis de BioMed AI.' : 'BioMed AI analysis complete.');
    }
    const dashTimeVal = document.getElementById('dash-latest-time-val');
    if (dashTimeVal) {
      dashTimeVal.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const dashSessionId = document.getElementById('dash-session-id-badge');
    if (dashSessionId) {
      dashSessionId.textContent = `SESSION: ACTIVE (${agentLabel || 'AI Analysis'})`;
    }

    // Stats bar
    if (stats) {
      const statsEl = document.createElement('div');
      statsEl.classList.add('message__stats');
      statsEl.innerHTML = `
        <span>⏱ TTFT: ${Math.round(stats.ttft_ms || 0)}ms</span>
        <span>⚡ ${(stats.tokens_per_second || 0).toFixed(1)} tok/s</span>
        <span>📝 ${stats.completion_tokens || 0} tokens</span>
        <span>⏳ ${((stats.total_time_ms || 0) / 1000).toFixed(1)}s total</span>
      `;
      body.appendChild(statsEl);
    }

    // RAG Sources (collapsible Audit log)
    if (sources && sources.length > 0) {
      const detailsEl = document.createElement('details');
      detailsEl.classList.add('message__sources-details');
      
      const summaryEl = document.createElement('summary');
      summaryEl.classList.add('message__sources-summary');
      summaryEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">search</span><strong>${currentLang === 'es' ? 'Ver Evidencia de Auditoría' : 'View Audit Evidence'}</strong> (${sources.length} ${currentLang === 'es' ? 'fuentes RAG' : 'RAG sources'})`;
      detailsEl.appendChild(summaryEl);

      const srcEl = document.createElement('div');
      srcEl.classList.add('message__sources');
      sources.forEach((src) => {
        const item = document.createElement('div');
        item.classList.add('message__source-item');

        let evidenceHtml = `<strong><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px">description</span>${src.document}</strong> <span class="source-match">(${(src.similarity * 100).toFixed(0)}% match)</span>`;
        
        // Original text from manual
        if (src.text) {
          evidenceHtml += `<div class="evidence-original"><em>"...${src.text.substring(0, 200)}..."</em></div>`;
        }

        // Translated text (if available via NMT)
        if (src.translatedText) {
          evidenceHtml += `<details class="evidence-translated"><summary><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">translate</span>Show translation</summary><em>"...${src.translatedText.substring(0, 200)}..."</em></details>`;
        }

        item.innerHTML = evidenceHtml;
        srcEl.appendChild(item);
      });
      detailsEl.appendChild(srcEl);
      body.appendChild(detailsEl);
    }

    // Disclaimers
    if (disclaimers && disclaimers.length > 0) {
      const discEl = document.createElement('div');
      discEl.classList.add('message__disclaimers');
      
      // Deduplicate disclaimers to prevent duplicates
      const uniqueDisclaimers = [...new Set(disclaimers)];
      
      uniqueDisclaimers.forEach((d) => {
        const itemEl = document.createElement('div');
        itemEl.classList.add('message__disclaimer-item');
        
        if (d.startsWith('SAFETY NOTE') || d.includes('WARNING') || d.includes('ADVERTENCIA')) {
          itemEl.classList.add('message__disclaimer-item--warning');
        } else if (d.includes('action') || d.includes('acción')) {
          itemEl.classList.add('message__disclaimer-item--action');
        } else if (d.includes('concept') || d.includes('concepto')) {
          itemEl.classList.add('message__disclaimer-item--concept');
        } else {
          itemEl.classList.add('message__disclaimer-item--standard');
        }
        
        itemEl.textContent = d;
        discEl.appendChild(itemEl);
      });
      body.appendChild(discEl);
    }
  }

  // ────────────────────────────────────────────
  // Stats UI
  // ────────────────────────────────────────────
  function updateStatsUI() {
    const { queries, ttftSum, tpsSum, totalTokens } = sessionStats;
    const labels = {
      q: queries,
      ttft: queries > 0 ? Math.round(ttftSum / queries) + 'ms' : '—',
      tps: queries > 0 ? (tpsSum / queries).toFixed(1) + ' t/s' : '—',
      tok: totalTokens.toLocaleString()
    };

    // Update legacy sidebar elements if present
    const qEl = $('#stat-queries'); if (qEl) qEl.textContent = labels.q;
    const ttftEl = $('#stat-ttft'); if (ttftEl) ttftEl.textContent = labels.ttft;
    const tpsEl = $('#stat-tps'); if (tpsEl) tpsEl.textContent = labels.tps;
    const tokEl = $('#stat-tokens'); if (tokEl) tokEl.textContent = labels.tok;

    // Update Dashboard stats elements
    const dqEl = document.getElementById('dash-stat-queries'); if (dqEl) dqEl.textContent = labels.q;
    const dttftEl = document.getElementById('dash-stat-ttft'); if (dttftEl) dttftEl.textContent = labels.ttft;
    const dtpsEl = document.getElementById('dash-stat-tps'); if (dtpsEl) dtpsEl.textContent = labels.tps;
    const dtokEl = document.getElementById('dash-stat-tokens'); if (dtokEl) dtokEl.textContent = labels.tok;
  }

  // ────────────────────────────────────────────
  // Health Check / System Status
  // ────────────────────────────────────────────
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Health check failed');
      const data = await res.json();

      // Models
      const modelsCard = $('#status-models');
      const modelsIndicator = modelsCard?.querySelector('.status-card__indicator');
      const modelsValue = $('#models-status');
      if (modelsCard && modelsIndicator && modelsValue) {
        if (data.models.totalModelsLoaded > 0) {
          modelsIndicator.className = 'status-card__indicator status-card__indicator--ok w-2 h-2 rounded-full';
          modelsValue.textContent = `${data.models.totalModelsLoaded} loaded`;
          const dModels = document.getElementById('dash-models-count');
          if (dModels) dModels.textContent = data.models.totalModelsLoaded;
        } else {
          modelsIndicator.className = 'status-card__indicator status-card__indicator--error w-2 h-2 rounded-full';
          modelsValue.textContent = 'None loaded';
          const dModels = document.getElementById('dash-models-count');
          if (dModels) dModels.textContent = '0';
        }
      }

      // RAG
      const ragCard = $('#status-rag');
      const ragIndicator = ragCard?.querySelector('.status-card__indicator');
      const ragValue = $('#rag-status');
      if (ragCard && ragIndicator && ragValue) {
        if (data.rag.total_chunks > 0) {
          ragIndicator.className = 'status-card__indicator status-card__indicator--ok w-2 h-2 rounded-full';
          ragValue.textContent = `${data.rag.total_chunks} chunks`;
          const dRag = document.getElementById('dash-rag-chunks');
          if (dRag) dRag.textContent = data.rag.total_chunks;
        } else {
          ragIndicator.className = 'status-card__indicator status-card__indicator--loading w-2 h-2 rounded-full';
          ragValue.textContent = 'No docs indexed';
          const dRag = document.getElementById('dash-rag-chunks');
          if (dRag) dRag.textContent = '0';
        }
      }

      // Server
      const serverCard = $('#status-server');
      const serverIndicator = serverCard?.querySelector('.status-card__indicator');
      const serverValue = $('#server-status');
      if (serverCard && serverIndicator && serverValue) {
        serverIndicator.className = 'status-card__indicator status-card__indicator--ok w-2 h-2 rounded-full';
        serverValue.textContent = `Up ${formatUptime(data.uptime_seconds)}`;
      }

      // Dashboard Uptime
      const dUptime = document.getElementById('dash-uptime-val');
      if (dUptime) dUptime.textContent = formatUptime(data.uptime_seconds);

      // Node Memory
      const nodeMemory = document.getElementById('node-memory-status');
      if (nodeMemory && data.memory_rss_bytes) {
        const gb = (data.memory_rss_bytes / 1024 / 1024 / 1024).toFixed(2);
        nodeMemory.textContent = `RAM: ${gb} GB`;
      }

    } catch (e) {
      console.error(e);
      const serverIndicator = $('#status-server')?.querySelector('.status-card__indicator');
      if (serverIndicator) serverIndicator.className = 'status-card__indicator status-card__indicator--error w-2 h-2 rounded-full';
      const serverValue = $('#server-status');
      if (serverValue) serverValue.textContent = 'Disconnected';
      const dUptime = document.getElementById('dash-uptime-val');
      if (dUptime) dUptime.textContent = 'Offline';
    }
  }

  function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  // ────────────────────────────────────────────
  // Document Selection
  // ────────────────────────────────────────────
  async function fetchDocuments() {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      
      const prevSelected = documentSelect.value;
      
      // Clear options except the first placeholder
      while (documentSelect.options.length > 1) {
        documentSelect.remove(1);
      }
      
      if (data.documents && data.documents.length > 0) {
        data.documents.forEach(doc => {
          const opt = document.createElement('option');
          opt.value = doc;
          opt.textContent = doc;
          documentSelect.appendChild(opt);
        });
        
        if (prevSelected && data.documents.includes(prevSelected)) {
          documentSelect.value = prevSelected;
        }

        // 1. Populate Dashboard Pinned Library
        const dashPinned = document.getElementById('dash-pinned-manuals');
        if (dashPinned) {
          dashPinned.innerHTML = '';
          data.documents.slice(0, 4).forEach(doc => {
            const card = document.createElement('div');
            card.className = "group flex items-start gap-md p-md rounded bg-surface-container hover:bg-surface-container-high border border-transparent hover:border-outline-variant transition-all cursor-pointer";
            card.innerHTML = `
              <div class="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center shrink-0 group-hover:text-primary transition-colors text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">article</span>
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="font-body-md text-body-md font-bold text-on-surface group-hover:text-primary transition-colors truncate text-xs">${doc}</h4>
                <p class="font-label-mono text-label-mono text-on-surface-variant mt-1 uppercase text-[9px]">${doc.split('.').pop() || 'PDF'} document</p>
              </div>
            `;
            card.addEventListener('click', () => {
              documentSelect.value = doc;
              updateInputState();
              switchView('view-repair');
            });
            dashPinned.appendChild(card);
          });
        }

        // 2. Populate Manuals Library tab
        const libraryGrid = document.getElementById('library-manuals-grid');
        if (libraryGrid) {
          libraryGrid.innerHTML = '';
          data.documents.forEach(doc => {
            const ext = doc.split('.').pop()?.toLowerCase();
            const icon = ext === 'pdf' ? 'picture_as_pdf' : (ext === 'md' ? 'markdown' : 'description');
            const card = document.createElement('div');
            card.className = "group relative bg-surface-container border border-outline-variant rounded flex flex-col hover:border-primary transition-all duration-300 overflow-hidden cursor-pointer";
            card.innerHTML = `
              <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div class="p-4 border-b border-outline-variant flex justify-between items-start">
                <div class="bg-surface-dim p-2 rounded border border-outline-variant">
                  <span class="material-symbols-outlined text-primary">${icon}</span>
                </div>
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 font-label-mono text-[9px] text-primary">
                  VERIFIED
                </span>
              </div>
              <div class="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div class="font-label-mono text-label-mono text-on-surface-variant mb-1 uppercase text-[9px]">${ext} Manual</div>
                  <h3 class="font-status-lg text-[16px] text-on-surface mb-4 font-bold group-hover:text-primary transition-colors truncate-2-lines">${doc}</h3>
                </div>
                <div class="space-y-1.5 pt-2 border-t border-outline-variant/20">
                  <div class="flex justify-between items-center text-[11px]">
                    <span class="text-on-surface-variant">Last Indexed</span>
                    <span class="font-label-mono text-on-surface text-[10px]">Local Storage</span>
                  </div>
                </div>
              </div>
              <div class="h-1 w-full bg-surface-dim">
                <div class="h-full bg-primary w-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            `;
            card.addEventListener('click', () => {
              documentSelect.value = doc;
              updateInputState();
              switchView('view-repair');
            });
            libraryGrid.appendChild(card);
          });
        }
      }
      
      updateInputState();
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  }
  
  const ASSET_REGISTRY = {
    'nellcor': {
      name: 'Nellcor PM1000',
      sn: 'NL-9942-B',
      loc: 'ICU-Bed 4',
      status: 'Fault Active',
      statusColor: 'text-error',
      schematicTitle: 'Section 4B: D-Sub Connector Pinout',
      schematicPage: 'Page 142 • SpO2 Module Assembly'
    },
    'philips': {
      name: 'Philips MX700',
      sn: 'PH-8893-A',
      loc: 'ICU-Bed 2',
      status: 'Nominal',
      statusColor: 'text-primary',
      schematicTitle: 'Section 9: Transceiver Circuit Board',
      schematicPage: 'Page 289 • Motherboard Assembly'
    },
    'datex': {
      name: 'Datex-Ohmeda Aestiva 5',
      sn: 'DT-5521-X',
      loc: 'OR-Room 1',
      status: 'Maintenance Due',
      statusColor: 'text-yellow-500',
      schematicTitle: 'Section 2A: Manifold Regulator',
      schematicPage: 'Page 88 • Pneumatics Schematic'
    },
    'default': {
      name: 'Biomedical Asset',
      sn: 'GEN-0001-A',
      loc: 'Depot Yard',
      status: 'Ready',
      statusColor: 'text-primary',
      schematicTitle: 'Standard Pinout Configuration',
      schematicPage: 'Page 12 • General Specifications'
    }
  };

  function updateInputState() {
    const activeTitle = document.getElementById('active-equipment-title');
    const assetNameVal = document.getElementById('asset-name-val');
    const assetSnVal = document.getElementById('asset-sn-val');
    const assetLocVal = document.getElementById('asset-loc-val');
    const assetStatusBadge = document.getElementById('asset-status-badge');
    const schematicTitle = document.getElementById('schematic-section-title');
    const schematicPage = document.getElementById('schematic-page-val');

    if (documentSelect.value) {
      chatInput.disabled = false;
      chatInput.placeholder = t('input_placeholder');

      // Find asset mapping
      const key = Object.keys(ASSET_REGISTRY).find(k => documentSelect.value.toLowerCase().includes(k)) || 'default';
      const asset = ASSET_REGISTRY[key];

      if (documentSelect.value !== lastSelectedDoc) {
        lastSelectedDoc = documentSelect.value;
        
        // Notify backend to start a new logging session
        fetch('/api/sessions/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: documentSelect.value })
        })
        .then(() => fetchSessions()) // Refresh list
        .catch(err => console.error('Error starting new session:', err));

        // Clear chat UI
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
          welcomeMessage.style.display = 'none';
        }

        // Add a system notification about the new session in the chat
        const transitionMsg = document.createElement('div');
        transitionMsg.className = 'message message--assistant';
        const isEs = currentLang === 'es';
        const msgText = isEs 
          ? `Iniciada nueva sesión de diagnóstico para: <strong>${asset.name}</strong> (SN: ${asset.sn}). Manual de referencia cargado.`
          : `Started new diagnostic session for: <strong>${asset.name}</strong> (SN: ${asset.sn}). Reference manual loaded.`;

        transitionMsg.innerHTML = `
          <div class="message__avatar"><span class="material-symbols-outlined">build</span></div>
          <div class="message__body">
            <div class="message__content">
              <p>${msgText}</p>
            </div>
          </div>
        `;
        chatMessages.appendChild(transitionMsg);
        scrollToBottom();
      }

      if (activeTitle) activeTitle.textContent = asset.name;
      if (assetNameVal) assetNameVal.textContent = asset.name;
      if (assetSnVal) assetSnVal.textContent = asset.sn;
      if (assetLocVal) assetLocVal.textContent = asset.loc;
      if (assetStatusBadge) {
        let dotColor = 'bg-primary';
        if (asset.statusColor.includes('error')) dotColor = 'bg-error';
        else if (asset.statusColor.includes('yellow')) dotColor = 'bg-yellow-500';
        assetStatusBadge.className = `${asset.statusColor} font-bold flex items-center gap-1`;
        assetStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${dotColor} inline-block animate-pulse"></span>${asset.status}`;
      }
      if (schematicTitle) schematicTitle.textContent = asset.schematicTitle;
      if (schematicPage) schematicPage.textContent = asset.schematicPage;
      
      const docBadge = document.getElementById('chat-session-id');
      if (docBadge) docBadge.textContent = 'SN: ' + asset.sn;

    } else {
      chatInput.disabled = true;
      chatInput.placeholder = currentLang === 'es' 
        ? 'Selecciona un manual de equipo para empezar...' 
        : 'Select an equipment manual to start troubleshooting...';

      if (activeTitle) activeTitle.textContent = currentLang === 'es' ? 'No se seleccionó equipo' : 'No Equipment Selected';
      if (assetNameVal) assetNameVal.textContent = currentLang === 'es' ? 'Diagnóstico de Dispositivo' : 'Device Diagnostics';
      if (assetSnVal) assetSnVal.textContent = 'SN-XXXX-X';
      if (assetLocVal) assetLocVal.textContent = '---';
      if (assetStatusBadge) {
        assetStatusBadge.className = 'text-on-surface-variant font-bold flex items-center gap-1';
        assetStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 inline-block"></span>Offline';
      }
    }
  }
  
  if (documentSelect) {
    documentSelect.addEventListener('change', updateInputState);
  }

  // ────────────────────────────────────────────
  // Event Listeners
  // ────────────────────────────────────────────
  chatInput.addEventListener('input', () => {
    autoResize();
    sendBtn.disabled = !chatInput.value.trim();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (chatInput.value.trim() && !isStreaming) {
        sendQueryV2(chatInput.value.trim());
        chatInput.value = '';
        autoResize();
        sendBtn.disabled = true;
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (chatInput.value.trim() && !isStreaming) {
      sendQueryV2(chatInput.value.trim());
      chatInput.value = '';
      autoResize();
      sendBtn.disabled = true;
    }
  });

  // Quick chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!documentSelect.value) {
        alert(currentLang === 'es' ? 'Por favor, selecciona un manual de equipo primero.' : 'Please select an equipment manual first.');
        documentSelect.focus();
        return;
      }
      const query = chip.dataset.query;
      if (query && !isStreaming) {
        sendQueryV2(query);
      }
    });
  });

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    if (welcomeMessage) {
      chatMessages.appendChild(welcomeMessage);
      welcomeMessage.style.display = '';
    }
    sessionStats.queries = 0;
    sessionStats.ttftSum = 0;
    sessionStats.tpsSum = 0;
    sessionStats.totalTokens = 0;
    updateStatsUI();
  });

  // Dismiss disclaimer
  dismissDisclaimer.addEventListener('click', () => {
    disclaimerBanner.classList.add('dismissed');
    setTimeout(() => {
      disclaimerBanner.classList.add('hidden');
    }, 500);
  });

  // Sidebar toggle (mobile)
  toggleSidebar.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Language toggle
  document.querySelectorAll('.lang-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLanguage(btn.dataset.lang);
      updateInputState();
    });
  });

  // File Upload
  const uploadBtn = $('#upload-btn');
  const fileUploadInput = $('#file-upload-input');

  if (uploadBtn && fileUploadInput) {
    uploadBtn.addEventListener('click', () => fileUploadInput.click());

    fileUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      addUserMessage(`Uploading document: ${file.name}...`);
      
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        
        const msgEl = document.createElement('div');
        msgEl.classList.add('message', 'message--assistant');
        msgEl.innerHTML = `
          <div class="message__avatar"><span class="material-symbols-outlined">local_hospital</span></div>
          <div class="message__body">
            <div class="message__content">
              <p><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;color:var(--md-sys-color-primary)">check_circle</span><strong>${file.name}</strong> ingested successfully (${data.chunks} chunks).</p>
            </div>
          </div>
        `;
        chatMessages.appendChild(msgEl);
        scrollToBottom();
        checkHealth(); 
        await fetchDocuments();
        documentSelect.value = file.name;
        updateInputState();
      } catch (err) {
        const msgEl = document.createElement('div');
        msgEl.classList.add('message', 'message--assistant');
        msgEl.innerHTML = `
          <div class="message__avatar"><span class="material-symbols-outlined" style="color:var(--md-sys-color-error)">warning</span></div>
          <div class="message__body">
            <div class="message__content">
              <p><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;color:var(--md-sys-color-error)">error</span>Failed to upload ${file.name}: ${err.message}</p>
            </div>
          </div>
        `;
        chatMessages.appendChild(msgEl);
        scrollToBottom();
      }
      
      fileUploadInput.value = '';
    });
  }

  // Image Drag and Drop Logic
  if (imageDropzone) {
    imageDropzone.addEventListener('click', () => imageUploadInput.click());
    
    imageDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      imageDropzone.classList.add('dragover');
    });
    
    imageDropzone.addEventListener('dragleave', () => {
      imageDropzone.classList.remove('dragover');
    });
    
    imageDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      imageDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageSelection(e.dataTransfer.files[0]);
      }
    });
    
    imageUploadInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageSelection(e.target.files[0]);
      }
    });
    
    removeImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImageSelection();
    });
  }

  function handleImageSelection(file) {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      currentImageBase64 = e.target.result;
      
      // Update inline dropzone previews
      if (imagePreview) imagePreview.src = currentImageBase64;
      if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
      if (dropzonePrompt) dropzonePrompt.style.display = 'none';
      if (ocrStatus) ocrStatus.style.display = 'flex';
      
      // Update sidebar vision dropzone previews
      const sidebarPreview = document.getElementById('sidebar-image-preview');
      const sidebarPreviewContainer = document.getElementById('sidebar-image-preview-container');
      const sidebarPrompt = document.getElementById('sidebar-dropzone-prompt');
      const sidebarOcr = document.getElementById('sidebar-ocr-status');

      if (sidebarPreview) sidebarPreview.src = currentImageBase64;
      if (sidebarPreviewContainer) sidebarPreviewContainer.style.display = 'block';
      if (sidebarPrompt) sidebarPrompt.style.display = 'none';
      if (sidebarOcr) sidebarOcr.style.display = 'flex';

      setTimeout(() => {
        if (ocrStatus) ocrStatus.style.display = 'none';
        if (sidebarOcr) sidebarOcr.style.display = 'none';
      }, 1500);
    };
    reader.readAsDataURL(file);
  }

  function clearImageSelection() {
    currentImageBase64 = null;
    
    // Clear inline dropzone
    if (imagePreview) imagePreview.src = '';
    if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
    if (dropzonePrompt) dropzonePrompt.style.display = 'flex';
    if (imageUploadInput) imageUploadInput.value = '';

    // Clear sidebar vision dropzone
    const sidebarPreview = document.getElementById('sidebar-image-preview');
    const sidebarPreviewContainer = document.getElementById('sidebar-image-preview-container');
    const sidebarPrompt = document.getElementById('sidebar-dropzone-prompt');
    const sidebarUploadInput = document.getElementById('image-upload-input-sidebar');

    if (sidebarPreview) sidebarPreview.src = '';
    if (sidebarPreviewContainer) sidebarPreviewContainer.style.display = 'none';
    if (sidebarPrompt) sidebarPrompt.style.display = 'flex';
    if (sidebarUploadInput) sidebarUploadInput.value = '';
  }

  // ────────────────────────────────────────────
  // SPA Routing
  // ────────────────────────────────────────────
  const views = document.querySelectorAll('.app-view');
  const tabBtns = document.querySelectorAll('.nav-tab-btn');
  const topbarTitle = document.getElementById('topbar-view-title');

  const ROUTE_MAP = {
    'view-dashboard': '/dashboard',
    'view-repair': '/repair',
    'view-manuals': '/manuals',
    'view-history': '/history'
  };

  const PATH_MAP = {
    '/dashboard': 'view-dashboard',
    '/repair': 'view-repair',
    '/manuals': 'view-manuals',
    '/history': 'view-history'
  };

  function switchView(targetId, updateHistory = true) {
    views.forEach(v => {
      if (v.id === targetId) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    tabBtns.forEach(btn => {
      if (btn.dataset.target === targetId) {
        btn.className = "nav-tab-btn flex items-center gap-md px-4 py-3 font-body-md text-body-md rounded-r transition-all duration-200 text-primary bg-surface-container-highest border-l-4 border-primary text-left";
      } else {
        btn.className = "nav-tab-btn flex items-center gap-md px-4 py-3 font-body-md text-body-md rounded-r transition-all duration-200 text-on-surface-variant hover:bg-surface-container border-l-4 border-transparent hover:border-outline-variant text-left";
      }
    });

    switch(targetId) {
      case 'view-dashboard':
        topbarTitle.textContent = currentLang === 'es' ? 'Sistema de Borde Local' : 'Local Edge System';
        break;
      case 'view-repair':
        topbarTitle.textContent = currentLang === 'es' ? 'Diagnóstico de Equipamiento' : 'Equipment Repair';
        break;
      case 'view-manuals':
        topbarTitle.textContent = currentLang === 'es' ? 'Biblioteca de Referencia' : 'Technical Reference Library';
        break;
      case 'view-history':
        topbarTitle.textContent = currentLang === 'es' ? 'Historial de Sesiones' : 'Repair History & Logs';
        break;
      default:
        topbarTitle.textContent = 'BioMed Sentinel';
    }

    if (updateHistory) {
      const path = ROUTE_MAP[targetId] || '/';
      history.pushState({ targetId }, '', path);
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.target);
    });
  });

  window.addEventListener('popstate', (e) => {
    const targetId = (e.state && e.state.targetId) || PATH_MAP[window.location.pathname] || 'view-dashboard';
    switchView(targetId, false);
  });

  const sidebarNewSession = document.getElementById('sidebar-new-session');
  if (sidebarNewSession) {
    sidebarNewSession.addEventListener('click', () => {
      clearChatBtn.click();
      switchView('view-repair');
    });
  }

  // Library tab bindings
  const libSearch = document.getElementById('library-search-input');
  if (libSearch) {
    libSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const cards = document.querySelectorAll('#library-manuals-grid > div');
      cards.forEach(card => {
        const titleEl = card.querySelector('h3');
        if (titleEl) {
          const title = titleEl.textContent.toLowerCase();
          if (title.includes(query)) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        }
      });
    });
  }

  const libUploadTrigger = document.getElementById('library-upload-trigger');
  if (libUploadTrigger) {
    libUploadTrigger.addEventListener('click', () => {
      if (fileUploadInput) fileUploadInput.click();
    });
  }

  const topbarSearch = document.getElementById('topbar-search-input');
  if (topbarSearch) {
    topbarSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = topbarSearch.value.trim();
        if (query) {
          switchView('view-manuals');
          if (libSearch) {
            libSearch.value = query;
            libSearch.dispatchEvent(new Event('input'));
          }
        }
      }
    });
  }

  // Sidebar vision panel upload triggers sync
  const imageDropzoneSidebar = document.getElementById('image-dropzone-sidebar');
  const imageUploadInputSidebar = document.getElementById('image-upload-input-sidebar');
  const sidebarRemoveImageBtn = document.getElementById('sidebar-remove-image-btn');

  if (imageDropzoneSidebar && imageUploadInputSidebar) {
    imageDropzoneSidebar.addEventListener('click', (e) => {
      if (e.target.closest('#sidebar-remove-image-btn')) return;
      imageUploadInputSidebar.click();
    });

    imageDropzoneSidebar.addEventListener('dragover', (e) => {
      e.preventDefault();
      imageDropzoneSidebar.classList.add('border-primary');
    });

    imageDropzoneSidebar.addEventListener('dragleave', () => {
      imageDropzoneSidebar.classList.remove('border-primary');
    });

    imageDropzoneSidebar.addEventListener('drop', (e) => {
      e.preventDefault();
      imageDropzoneSidebar.classList.remove('border-primary');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageSelection(e.dataTransfer.files[0]);
      }
    });

    imageUploadInputSidebar.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageSelection(e.target.files[0]);
      }
    });
  }

  if (sidebarRemoveImageBtn) {
    sidebarRemoveImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImageSelection();
    });
  }

  // Helper to get technician ID deterministically
  const getTechnicianId = (entryId) => {
    if (!entryId) return 'tech-current';
    let hash = 0;
    for (let i = 0; i < entryId.length; i++) {
      hash = (hash << 5) - hash + entryId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 2 === 0 ? 'tech-current' : 'tech-other';
  };

  // ────────────────────────────────────────────
  // Repair History: Fetch and Filter Sessions
  // ────────────────────────────────────────────
  async function fetchSessions() {
    const grid = document.getElementById('history-sessions-grid');
    if (!grid) return;

    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();

      // Flatten all session entries across all log files
      const allEntries = [];
      if (data.sessions && data.sessions.length > 0) {
        for (const session of data.sessions) {
          if (session.entries && session.entries.length > 0) {
            for (const entry of session.entries) {
              if (entry.query || entry.request_id) {
                allEntries.push({ ...entry, _sessionFile: session.filename });
              }
            }
          }
        }
      }

      // Sort by timestamp, most recent first
      allEntries.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });

      cachedHistoryEntries = allEntries;

      // Aggregate session metrics from history entries
      let realQueries = 0;
      let realTtftSum = 0;
      let realTpsSum = 0;
      let realTotalTokens = 0;
      let queriesWithTtft = 0;
      let queriesWithTps = 0;

      for (const entry of allEntries) {
        realQueries++;
        if (entry.ttft_ms) {
          realTtftSum += entry.ttft_ms;
          queriesWithTtft++;
        }
        if (entry.tokens_per_second) {
          realTpsSum += entry.tokens_per_second;
          queriesWithTps++;
        }
        realTotalTokens += (entry.prompt_tokens || 0) + (entry.completion_tokens || 0);
      }

      sessionStats.queries = realQueries;
      sessionStats.ttftSum = queriesWithTtft > 0 ? (realTtftSum / queriesWithTtft) * realQueries : 0;
      sessionStats.tpsSum = queriesWithTps > 0 ? (realTpsSum / queriesWithTps) * realQueries : 0;
      sessionStats.totalTokens = realTotalTokens;

      updateStatsUI();
      renderFilteredSessions();
      updateDashboardActiveSessionCard(allEntries[0] || null);

    } catch (err) {
      console.error('Error fetching sessions:', err);
      grid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-16 gap-4">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center border border-outline-variant">
            <span class="material-symbols-outlined text-[32px] text-on-surface-variant/40">history</span>
          </div>
          <div class="text-center">
            <h3 class="font-headline-md text-[18px] text-on-surface mb-2">No Diagnostic Sessions Yet</h3>
            <p class="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
              Start a repair session to generate real diagnostic logs. Each conversation is saved automatically.
            </p>
          </div>
          <button class="mt-2 bg-primary text-on-primary px-4 py-2 rounded font-label-mono text-label-mono flex items-center gap-2 hover:brightness-125 transition-all"
            onclick="document.querySelector('[data-target=view-repair]').click()">
            <span class="material-symbols-outlined text-[16px]">chat</span>
            Start a Diagnostic Session
          </button>
        </div>
      `;
    }
  }

  function renderFilteredSessions() {
    const grid = document.getElementById('history-sessions-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const dateFilter = document.getElementById('history-date-filter');
    const techFilter = document.getElementById('history-tech-filter');

    const dateFilterVal = dateFilter ? dateFilter.value : '';
    const techFilterVal = techFilter ? techFilter.value : 'all';

    const filterBtn = document.getElementById('history-filter-btn');
    const hasActiveFilters = dateFilterVal !== '' || techFilterVal !== 'all';
    if (filterBtn) {
      if (hasActiveFilters) {
        filterBtn.innerHTML = `<span class="material-symbols-outlined text-sm">filter_list_off</span> Clear Filters`;
        filterBtn.className = "bg-error/10 border border-error/20 hover:bg-error/20 text-error px-4 py-1.5 rounded font-label-mono text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer";
      } else {
        filterBtn.innerHTML = `<span class="material-symbols-outlined text-sm">filter_list</span> Filters`;
        filterBtn.className = "bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary px-4 py-1.5 rounded font-label-mono text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer";
      }
    }



    const filtered = cachedHistoryEntries.filter(entry => {
      // 1. Date Filter
      if (dateFilterVal) {
        const filterDate = new Date(dateFilterVal);
        const entryDate = new Date(entry.timestamp);
        if (filterDate.getUTCFullYear() !== entryDate.getUTCFullYear() ||
            filterDate.getUTCMonth() !== entryDate.getUTCMonth() ||
            filterDate.getUTCDate() !== entryDate.getUTCDate()) {
          return false;
        }
      }

      // 2. Technician Filter
      if (techFilterVal !== 'all') {
        const entryTech = getTechnicianId(entry.request_id || entry.timestamp);
        if (entryTech !== techFilterVal) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-16 gap-4">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center border border-outline-variant">
            <span class="material-symbols-outlined text-[32px] text-on-surface-variant/40">filter_list</span>
          </div>
          <div class="text-center">
            <h3 class="font-headline-md text-[18px] text-on-surface mb-2">No Matching Sessions</h3>
            <p class="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
              No diagnostic logs match the selected technician or date filters. Try modifying your criteria.
            </p>
          </div>
        </div>
      `;
      return;
    }

    // Render filtered entries
    for (const entry of filtered) {
      const card = document.createElement('div');
      const isEscalated = entry.final_disposition === 'escalate';
      const disposition = entry.final_disposition || 'completed';
      const statusLabel = isEscalated ? 'ESCALATED' : (disposition === 'completed' ? 'COMPLETED' : disposition.replace(/_/g, ' ').toUpperCase());

      const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
      const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const querySnippet = entry.query ? entry.query.substring(0, 150) + (entry.query.length > 150 ? '...' : '') : 'Diagnostic query';
      const agentName = entry.agent || 'orchestrator';
      const docName = entry.selected_document || 'General';
      const triageCat = entry.triage_category ? entry.triage_category.replace(/_/g, ' ') : '';
      const techId = getTechnicianId(entry.request_id || entry.timestamp) === 'tech-current' ? 'Tech: 884-A' : 'Tech: 291-B';

      if (isEscalated) {
        card.className = "bg-surface-container-low border border-error/30 rounded p-5 flex flex-col gap-4 hover:border-error/60 hover:bg-surface-container transition-all group relative overflow-hidden cursor-pointer";
        card.innerHTML = `
          <div class="absolute left-0 top-0 bottom-0 w-1 bg-error/80"></div>
          <div class="flex items-start justify-between relative z-10 pl-2">
            <div class="flex items-center gap-2 bg-error/10 border border-error/20 text-error px-2 py-0.5 rounded">
              <div class="w-1.5 h-1.5 rounded-full bg-error"></div>
              <span class="font-label-mono text-label-mono tracking-wider text-[10px]">${statusLabel}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-label-mono text-label-mono text-on-surface-variant text-[11px] font-semibold">${techId}</span>
              <span class="font-label-mono text-label-mono text-on-surface-variant text-[10px] mt-0.5">${dateStr}</span>
            </div>
          </div>
          <div class="relative z-10 flex-1 pl-2">
            <h3 class="font-headline-md text-[18px] leading-tight text-on-surface mb-1">${escapeHtml(docName)}</h3>
            <p class="font-body-md text-body-md text-on-surface-variant line-clamp-3">${escapeHtml(querySnippet)}</p>
            ${triageCat ? `<div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-error/10 border border-error/20 rounded"><span class="font-label-mono text-[9px] text-error uppercase tracking-wider">${escapeHtml(triageCat)}</span></div>` : ''}
          </div>
          <div class="flex items-center justify-between mt-2 pt-3 border-t border-outline-variant/30 relative z-10 pl-2">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-on-surface-variant text-sm">smart_toy</span>
                <span class="font-label-mono text-[10px] text-on-surface-variant">${agentName}</span>
              </div>
              <span class="font-label-mono text-[10px] text-on-surface-variant/60">${timeStr}</span>
            </div>
            ${entry.completion_tokens ? `<span class="font-label-mono text-[10px] text-on-surface-variant/50">${entry.completion_tokens} tokens</span>` : ''}
          </div>
        `;
      } else {
        card.className = "bg-surface-container-low border border-outline-variant rounded p-5 flex flex-col gap-4 hover:border-primary/40 hover:bg-surface-container transition-all group relative overflow-hidden cursor-pointer";
        card.innerHTML = `
          <div class="absolute -inset-px rounded bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"></div>
          <div class="flex items-start justify-between relative z-10">
            <div class="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">
              <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
              <span class="font-label-mono text-label-mono tracking-wider text-[10px]">${statusLabel}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-label-mono text-label-mono text-on-surface-variant text-[11px] font-semibold">${techId}</span>
              <span class="font-label-mono text-label-mono text-on-surface-variant text-[10px] mt-0.5">${dateStr}</span>
            </div>
          </div>
          <div class="relative z-10 flex-1">
            <h3 class="font-headline-md text-[18px] leading-tight text-on-surface mb-1">${escapeHtml(docName)}</h3>
            <p class="font-body-md text-body-md text-on-surface-variant line-clamp-3">${escapeHtml(querySnippet)}</p>
            ${triageCat ? `<div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-surface-container border border-outline-variant rounded"><span class="font-label-mono text-[9px] text-on-surface-variant uppercase tracking-wider">${escapeHtml(triageCat)}</span></div>` : ''}
          </div>
          <div class="flex items-center justify-between mt-2 pt-3 border-t border-outline-variant/30 relative z-10">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-on-surface-variant text-sm">smart_toy</span>
                <span class="font-label-mono text-[10px] text-on-surface-variant">${agentName}</span>
              </div>
              <span class="font-label-mono text-[10px] text-on-surface-variant/60">${timeStr}</span>
            </div>
            <div class="flex items-center gap-3">
              ${entry.ttft_ms ? `<span class="font-label-mono text-[10px] text-on-surface-variant/50">${Math.round(entry.ttft_ms)}ms TTFT</span>` : ''}
              ${entry.completion_tokens ? `<span class="font-label-mono text-[10px] text-on-surface-variant/50">${entry.completion_tokens} tok</span>` : ''}
            </div>
          </div>
        `;
      }

      card.addEventListener('click', () => {
        showSessionDetailModal(entry);
      });

      grid.appendChild(card);
    }
  }

  // ────────────────────────────────────────────
  // Session Details & Rerun Handler
  // ────────────────────────────────────────────
  function showSessionDetailModal(entry) {
    const modal = document.getElementById('session-detail-modal');
    if (!modal) return;

    // Set title
    const modalTitle = document.getElementById('session-detail-modal-title');
    if (modalTitle) {
      modalTitle.textContent = t('session_detail_title');
    }

    // Set Content
    const modalContent = document.getElementById('session-detail-modal-content');
    if (modalContent) {
      const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
      const dateStr = ts.toLocaleDateString(currentLang === 'es' ? 'es-ES' : 'en-US', { 
        month: 'short', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      
      const techId = getTechnicianId(entry.request_id || entry.timestamp) === 'tech-current' ? 'Tech: 884-A' : 'Tech: 291-B';
      const isEscalated = entry.final_disposition === 'escalate';
      const disposition = entry.final_disposition || 'completed';
      const statusLabel = isEscalated ? 'ESCALATED' : (disposition === 'completed' ? 'COMPLETED' : disposition.replace(/_/g, ' ').toUpperCase());
      const statusColorClass = isEscalated ? 'bg-error/10 border-error/20 text-error' : 'bg-primary/10 border-primary/20 text-primary';
      const dotColorClass = isEscalated ? 'bg-error' : 'bg-primary';

      const docName = entry.selected_document || (currentLang === 'es' ? 'General' : 'General');
      const triageCat = entry.triage_category ? entry.triage_category.replace(/_/g, ' ') : '';
      const agentName = entry.agent || 'orchestrator';

      // Chatbot response HTML block
      let responseHtml = '';
      if (entry.assistant_response) {
        // Let's parse the raw response
        let parsedJson = null;
        let visibleText = entry.assistant_response;
        
        // 1. Extract think tag if present
        let thinkingBlock = '';
        const thinkStart = visibleText.indexOf('<think>');
        const thinkEnd = visibleText.indexOf('</think>');
        if (thinkStart !== -1 && thinkEnd !== -1 && thinkEnd > thinkStart) {
          thinkingBlock = visibleText.substring(thinkStart + 7, thinkEnd).trim();
          visibleText = (visibleText.substring(0, thinkStart) + visibleText.substring(thinkEnd + 8)).trim();
        }

        // 2. Extract JSON block if present
        const jsonStart = visibleText.indexOf('{');
        const jsonEnd = visibleText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          try {
            const jsonStr = visibleText.substring(jsonStart, jsonEnd + 1);
            parsedJson = JSON.parse(jsonStr);
            visibleText = visibleText.substring(0, jsonStart).trim();
          } catch (e) {
            console.warn('Failed to parse json block in history response:', e);
          }
        }

        // Clean trailing code fences
        const fenceStart = visibleText.lastIndexOf('```');
        if (fenceStart !== -1) {
          visibleText = visibleText.substring(0, fenceStart).trim();
        }

        // Clean using sanitizeModelOutput
        visibleText = sanitizeModelOutput(visibleText);

        // Gather variables for card rendering
        const displayTriage = entry.triage_category || parsedJson?.triage_category || '';
        const displayReasoning = parsedJson?.reasoning_summary || entry.reasoningSummary || entry.reasoning_summary || '';
        const displayEvidence = (parsedJson?.evidence_used && parsedJson.evidence_used.join(', ')) || entry.selected_document || '';
        const displayInstructions = parsedJson?.instructions || visibleText;
        const displayDisposition = entry.final_disposition || parsedJson?.final_disposition || '';

        const cardHtml = renderDiagnosticResponse({
          triageCategory: displayTriage,
          reasoningSummary: displayReasoning,
          evidenceUsed: displayEvidence,
          instructions: displayInstructions,
          finalDisposition: displayDisposition,
          lang: currentLang
        });

        let thinkHtml = '';
        if (thinkingBlock) {
          thinkHtml = `
            <details class="bg-surface-container/30 border border-outline-variant/30 rounded p-sm mt-xs text-left">
              <summary class="font-label-mono text-[10px] text-primary/70 uppercase tracking-widest cursor-pointer select-none flex items-center gap-1.5 focus:outline-none">
                <span class="material-symbols-outlined text-[16px]">psychology</span>
                <span>${currentLang === 'es' ? 'Ver Lógica de Razonamiento (CoT)' : 'View Reasoning Logic (CoT)'}</span>
              </summary>
              <div class="font-body-md text-on-surface-variant italic mt-2 pl-2 border-l-2 border-primary/30 whitespace-pre-wrap text-[11px] leading-relaxed text-left">${escapeHtml(thinkingBlock)}</div>
            </details>
          `;
        }

        responseHtml = `
          <div class="flex flex-col gap-sm">
            <div class="flex items-center gap-2 text-primary font-bold text-left pl-1">
              <span class="material-symbols-outlined text-[18px]">smart_toy</span>
              <span>${t('detail_response')}</span>
            </div>
            ${cardHtml}
            ${thinkHtml}
          </div>
        `;
      } else {
        responseHtml = `
          <div class="bg-error/5 border border-error/20 rounded p-md flex gap-md text-left">
            <span class="material-symbols-outlined text-error shrink-0">warning</span>
            <div>
              <p class="font-bold text-error mb-1">${currentLang === 'es' ? 'Detalle no disponible en el registro' : 'Details not stored in log'}</p>
              <p class="text-on-surface-variant text-[11px]">${t('older_session_notice')}</p>
            </div>
          </div>
        `;
      }

      // Metadata items
      const metadataList = [
        { label: t('detail_tech'), val: techId },
        { label: t('detail_date'), val: dateStr },
        { label: t('detail_document'), val: docName },
        { label: t('detail_category'), val: triageCat ? triageCat.toUpperCase() : 'PENDING' },
        { label: t('detail_disposition'), val: statusLabel },
        { label: t('detail_agent'), val: agentName }
      ];

      const metadataHtml = metadataList.map(item => `
        <div class="flex justify-between items-center py-1.5 border-b border-outline-variant/10 text-left">
          <span class="text-on-surface-variant font-label-mono text-[10px] uppercase tracking-wider">${item.label}</span>
          <span class="text-on-surface font-semibold text-[11px] truncate max-w-[320px]">${escapeHtml(item.val)}</span>
        </div>
      `).join('');

      // Performance metrics
      const metricsHtml = entry.total_time_ms ? `
        <div class="mt-md pt-sm border-t border-outline-variant/20 text-left">
          <h4 class="font-label-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-sm">${t('detail_metrics')}</h4>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-sm text-center">
            <div class="bg-surface-container/40 p-sm rounded border border-outline-variant/30">
              <div class="text-on-surface-variant text-[9px] uppercase font-label-mono">TTFT</div>
              <div class="text-primary font-bold text-xs mt-0.5">${entry.ttft_ms ? Math.round(entry.ttft_ms) + 'ms' : '—'}</div>
            </div>
            <div class="bg-surface-container/40 p-sm rounded border border-outline-variant/30">
              <div class="text-on-surface-variant text-[9px] uppercase font-label-mono">Tokens/Sec</div>
              <div class="text-on-surface font-bold text-xs mt-0.5">${entry.tokens_per_second ? entry.tokens_per_second : '—'}</div>
            </div>
            <div class="bg-surface-container/40 p-sm rounded border border-outline-variant/30">
              <div class="text-on-surface-variant text-[9px] uppercase font-label-mono">Completion Tok</div>
              <div class="text-on-surface font-bold text-xs mt-0.5">${entry.completion_tokens || '—'}</div>
            </div>
            <div class="bg-surface-container/40 p-sm rounded border border-outline-variant/30">
              <div class="text-on-surface-variant text-[9px] uppercase font-label-mono">Total Time</div>
              <div class="text-secondary font-bold text-xs mt-0.5">${entry.total_time_ms ? Math.round(entry.total_time_ms) + 'ms' : '—'}</div>
            </div>
          </div>
        </div>
      ` : '';

      modalContent.innerHTML = `
        <!-- Status Indicator header -->
        <div class="flex items-center justify-between bg-surface-container-low p-md rounded border border-outline-variant/40">
          <div class="flex items-center gap-2 ${statusColorClass} px-3 py-1 rounded border">
            <div class="w-2 h-2 rounded-full ${dotColorClass} animate-pulse"></div>
            <span class="font-label-mono text-[11px] font-bold tracking-wider">${statusLabel}</span>
          </div>
          <span class="font-label-mono text-[11px] text-on-surface-variant font-bold">${escapeHtml(techId)}</span>
        </div>

        <!-- Query Section -->
        <div class="bg-surface-container border border-outline-variant/30 rounded p-md flex flex-col gap-sm text-left">
          <div class="flex items-center gap-2 text-secondary font-bold">
            <span class="material-symbols-outlined text-[18px]">person</span>
            <span>${t('detail_query')}</span>
          </div>
          <div class="text-on-surface font-body-md italic whitespace-pre-wrap">"${escapeHtml(entry.query)}"</div>
        </div>

        <!-- Response Section -->
        ${responseHtml}

        <!-- Session Metadata -->
        <div class="bg-surface-container/50 border border-outline-variant/30 rounded p-md flex flex-col">
          <h4 class="font-label-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2 pb-1 border-b border-outline-variant/20 text-left">${t('detail_metadata')}</h4>
          ${metadataHtml}
          ${metricsHtml}
        </div>
      `;
    }

    // Set rerun button handler
    const rerunBtn = document.getElementById('session-detail-rerun-btn');
    if (rerunBtn) {
      // Remove any existing click listeners by cloning
      const newRerunBtn = rerunBtn.cloneNode(true);
      rerunBtn.parentNode.replaceChild(newRerunBtn, rerunBtn);
      
      newRerunBtn.addEventListener('click', () => {
        // Close modal
        modal.classList.add('hidden');
        
        // Load session
        rerunSession(entry);
      });
    }

    // Show modal
    modal.classList.remove('hidden');
  }

  function rerunSession(entry) {
    // 1. Switch to the Chat/Repair view
    switchView('view-repair');
    
    // 2. Select the document in documentSelect if available
    if (entry.selected_document) {
      // Let's find if the document exists in options
      let foundOptionValue = '';
      for (let i = 0; i < documentSelect.options.length; i++) {
        const opt = documentSelect.options[i];
        if (opt.value === entry.selected_document || opt.value.toLowerCase().includes(entry.selected_document.toLowerCase())) {
          foundOptionValue = opt.value;
          break;
        }
      }
      
      if (foundOptionValue) {
        documentSelect.value = foundOptionValue;
        updateInputState();
      } else {
        // If not found in option, but we can set it
        const optionExists = Array.from(documentSelect.options).some(o => o.value === entry.selected_document);
        if (!optionExists) {
          const opt = document.createElement('option');
          opt.value = entry.selected_document;
          opt.textContent = entry.selected_document.split('\\').pop().split('/').pop();
          documentSelect.appendChild(opt);
        }
        documentSelect.value = entry.selected_document;
        updateInputState();
      }
    }
    
    // 3. Pre-fill the query into the chat input
    chatInput.value = entry.query;
    autoResize();
    sendBtn.disabled = !chatInput.value.trim();
    chatInput.focus();
    
    // 4. Automatically submit it after a short delay (e.g. 400ms)
    setTimeout(() => {
      if (chatInput.value.trim() && !isStreaming) {
        sendQueryV2(chatInput.value.trim());
        chatInput.value = '';
        autoResize();
        sendBtn.disabled = true;
      }
    }, 400);
  }

  function updateDashboardActiveSessionCard(latestEntry) {
    const badge = document.getElementById('dash-session-id-badge');
    const contentText = document.getElementById('dash-latest-assistant-text');
    const timeVal = document.getElementById('dash-latest-time-val');
    
    if (!latestEntry) {
      if (badge) badge.textContent = 'SESSION: READY';
      if (contentText) {
        contentText.innerHTML = 'No active diagnostic analysis. Start a repair session by selecting a manual and describing the hardware failure.';
      }
      if (timeVal) timeVal.textContent = '--:--';
      return;
    }

    if (badge) {
      const docLabel = latestEntry.selected_document ? latestEntry.selected_document.replace(/_/g, ' ').toUpperCase() : 'ACTIVE';
      badge.textContent = `SESSION: ${docLabel}`;
    }

    if (timeVal) {
      const ts = latestEntry.timestamp ? new Date(latestEntry.timestamp) : new Date();
      timeVal.textContent = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    if (contentText) {
      const dispText = latestEntry.final_disposition 
        ? latestEntry.final_disposition.replace(/_/g, ' ').toUpperCase()
        : 'PENDING';
      const triageText = latestEntry.triage_category 
        ? latestEntry.triage_category.replace(/_/g, ' ').toUpperCase()
        : 'PENDING';

      contentText.innerHTML = `
        <div class="flex flex-col gap-2 text-xs">
          <div class="flex items-start gap-1">
            <span class="text-on-surface-variant font-semibold select-none min-w-[100px] uppercase font-label-mono">Latest Query:</span>
            <span class="text-on-surface flex-1 font-body-md">"${latestEntry.query}"</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-on-surface-variant font-semibold select-none min-w-[100px] uppercase font-label-mono">Triage:</span>
            <span class="bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded font-label-mono text-[10px] tracking-wide">${triageText}</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-on-surface-variant font-semibold select-none min-w-[100px] uppercase font-label-mono">Disposition:</span>
            <span class="bg-secondary/10 border border-secondary/20 text-secondary px-1.5 py-0.5 rounded font-label-mono text-[10px] tracking-wide">${dispText}</span>
          </div>
        </div>
      `;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ────────────────────────────────────────────
  // Neural Canvas Animation
  // ────────────────────────────────────────────
  function initNeuralCanvas() {
    const canvas = document.getElementById('neural-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
    resize();
    window.addEventListener('resize', resize);

    const points = [];
    const numPoints = 25;
    for (let i = 0; i < numPoints; i++) {
      points.push({
        x: Math.random() * 500,
        y: Math.random() * 100,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1
      });
    }

    function animate() {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // Draw connections
      ctx.strokeStyle = 'rgba(87, 241, 219, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < numPoints; i++) {
        for (let j = i + 1; j < numPoints; j++) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw points
      for (let i = 0; i < numPoints; i++) {
        const p = points[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.fillStyle = i % 2 === 0 ? 'rgba(87, 241, 219, 0.4)' : 'rgba(235, 172, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    }
    animate();
  }

  // Wire up "Refresh Session History" button
  const loadPrevBtn = document.getElementById('load-prev-sessions-btn');
  if (loadPrevBtn) {
    loadPrevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fetchSessions();
    });
  }

  // Wire up History list dynamic filters
  const historyDateFilter = document.getElementById('history-date-filter');
  const historyTechFilter = document.getElementById('history-tech-filter');
  const historyFilterBtn = document.getElementById('history-filter-btn');

  if (historyDateFilter) {
    historyDateFilter.addEventListener('change', renderFilteredSessions);
    historyDateFilter.addEventListener('input', renderFilteredSessions);
  }
  if (historyTechFilter) {
    historyTechFilter.addEventListener('change', renderFilteredSessions);
  }
  if (historyFilterBtn) {
    historyFilterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const dateVal = historyDateFilter ? historyDateFilter.value : '';
      const techVal = historyTechFilter ? historyTechFilter.value : 'all';
      const hasActive = dateVal !== '' || techVal !== 'all';

      if (hasActive) {
        // Reset all inputs
        if (historyDateFilter) historyDateFilter.value = '';
        if (historyTechFilter) historyTechFilter.value = 'all';
        renderFilteredSessions();
      } else {
        // Micro-feedback animation/text indicating all logs are shown
        const prevText = historyFilterBtn.innerHTML;
        historyFilterBtn.innerHTML = `<span class="material-symbols-outlined text-sm">done</span> All Logs Visible`;
        historyFilterBtn.classList.add('bg-primary/20');
        setTimeout(() => {
          historyFilterBtn.innerHTML = prevText;
          historyFilterBtn.classList.remove('bg-primary/20');
        }, 1200);
      }
    });
  }

  // Helper to register standard modals with click-outside-to-close behavior
  function registerModal(modalId, openBtnId, closeBtnId) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    const closeBtn = document.getElementById(closeBtnId);
    if (!modal) return;

    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.remove('hidden');
      });
    }

    const closeModal = () => {
      modal.classList.add('hidden');
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    return { modal, openBtn, closeBtn, closeModal };
  }

  // Register all 4 topbar modals
  registerModal('models-modal', 'open-models-modal', 'close-models-modal');
  registerModal('notifications-modal', 'topbar-notifications-btn', 'close-notifications-modal');
  registerModal('help-modal', 'topbar-help-btn', 'close-help-modal');

  // Register Session Detail Modal Custom Logic
  const sessionDetailModalEl = document.getElementById('session-detail-modal');
  const closeDetailBtn1 = document.getElementById('close-session-detail-modal');
  const closeDetailBtn2 = document.getElementById('close-session-detail-modal-btn');

  const closeDetailModal = () => {
    if (sessionDetailModalEl) sessionDetailModalEl.classList.add('hidden');
  };

  if (closeDetailBtn1) closeDetailBtn1.addEventListener('click', closeDetailModal);
  if (closeDetailBtn2) closeDetailBtn2.addEventListener('click', closeDetailModal);
  if (sessionDetailModalEl) {
    sessionDetailModalEl.addEventListener('click', (e) => {
      if (e.target === sessionDetailModalEl) closeDetailModal();
    });
  }

  // Clear Chat Confirmation Modal Custom Logic
  const clearConfirmModal = document.getElementById('clear-confirm-modal');
  const clearChatTrigger = document.getElementById('clear-chat-trigger');
  const cancelClearBtn = document.getElementById('cancel-clear-btn');
  const clearChatConfirmBtn = document.getElementById('clear-chat');

  if (clearConfirmModal) {
    if (clearChatTrigger) {
      clearChatTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        clearConfirmModal.classList.remove('hidden');
      });
    }
    const closeClearModal = () => {
      clearConfirmModal.classList.add('hidden');
    };
    if (cancelClearBtn) {
      cancelClearBtn.addEventListener('click', closeClearModal);
    }
    if (clearChatConfirmBtn) {
      clearChatConfirmBtn.addEventListener('click', closeClearModal);
    }
    clearConfirmModal.addEventListener('click', (e) => {
      if (e.target === clearConfirmModal) closeClearModal();
    });
  }

  // ────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────
  applyI18n();
  fetchDocuments();
  fetchSessions();
  checkHealth();
  initNeuralCanvas();
  setInterval(checkHealth, 15000); // Poll every 15s
  if (!chatInput.disabled) chatInput.focus();

  // Set default view on startup based on URL path
  const currentPath = window.location.pathname;
  const initialView = PATH_MAP[currentPath] || 'view-dashboard';
  switchView(initialView, false);

})();
