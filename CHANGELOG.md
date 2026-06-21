# Changelog

All notable changes to the **BioMed AI Copilot** project are documented in this file.

---

## [1.4.0] - 2026-06-21

### Added
- **Export Diagnostic Report Feature**: Implemented a self-contained, offline-first HTML report exporter. It formats technician query, triage category, extracted signals, confidence levels, step-by-step instructions, RAG citations, local execution performance metrics, safety disclaimers, and technician profiles into a premium design with inline styling.
- **Ink-Saving PDF Optimization**: Included print-specific CSS (`@media print`) inside the report template for high-fidelity white-background PDF generation via the browser's native print/PDF export dialog.
- **History Detail Modal Export Integration**: Added the "Export Report" button inside the historical session detail modal, parsing the stored telemetry and chat response history to reconstruct and download the report.
- **Dynamic Localization (i18n) Support**: Added translations for `export_report` and `export_report_title` in English and Spanish, and integrated `data-i18n` attributes to translate report export actions instantly when the user toggles the UI language.

### Fixed
- **Dev Server Startup Port Locks**: Resolved startup crashes caused by database locked file descriptors and port 3000 conflicts.

## [1.3.0] - 2026-06-21

### Added
- **Conversation Memory Integration**: Implemented a local, privacy-first, in-memory session tracking architecture (`SessionStore` with auto-TTL cleanup) to maintain multi-turn troubleshooting context for the MedPsy-4B model pipeline.
- **Deterministic Metadata Summaries**: Formulate concise summaries (active equipment, RAG signals, last recommended dispositions) directly from turn metadata, saving token costs by avoiding extra LLM summarize runs.
- **Context Budget Manager**: Dynamic token budget calculator (`buildMemoryContext`) using a character-to-token heuristic. It prioritizes history context and handles automatic truncation under tight limits so that the model never exceeds its 4K context constraint.
- **Unit Test Suite**: Created a robust memory test suite (`test-memory.ts`) to verify session stores, sliding windows, metadata-based summaries, and budget limits.

### Changed
- **Pipeline Orchestration & Triage**: Updated the multi-agent `Orchestrator` to coordinate session context, providing context summaries to Triage classification (improving continuity for short/follow-up queries) and sliding windows to Service Logic.
- **Optional Orchestrator Arguments**: Relaxed orchestrator instantiation parameters to allow fallback to a default memory store, preventing regressions in demo/safety scripts.
- **Sidebar Padding Styling**: Added bottom-padding (`pb-md`) on the navigation container in `index.html` to improve visual layout spacing for the "Repair History" button.
- **Visual Version Update**: Bumped the visual footer version and system versions to `v1.3.0` for the QVAC Hackathon.

## [1.2.0] - 2026-06-21

### Added
- **Defibrillator Specific Keyword Rules**: Added 8 regex patterns in [triage.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/agents/triage.ts) to intercept defibrillator electrode, impedance, and shock queries and classify them deterministically as `wiring_connector` prior to LLM execution.
- **Post-Triage Consistency Validator**: Integrated a post-processing consistency guardrail (`validateTriageConsistency`) in [triage.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/agents/triage.ts) that cross-references LLM outputs and query terminology to prevent contradictions and misclassifications (e.g. overriding `internal_module` to `wiring_connector` if external components are mentioned).
- **Disambiguation Prompts**: Added clear classification guidelines to system prompts in [prompts/triage.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/prompts/triage.ts).
- **Manual Evidence Warning Fallback**: Added custom style class `.diag-row__value--warning` in [style.css](file:///c:/Users/Handi/Desktop/MedPSY/src/ui/public/style.css) using the system red/coral warning color `#ffb4ab`.

### Changed
- **Suggested Query Paths Sanitization**: Cleaned up dynamic chips generation in [app.js](file:///c:/Users/Handi/Desktop/MedPSY/src/ui/public/app.js) using `.split(/[\\/]/).pop()` to strip folders like `manuals\` and extensions from suggestions and generated queries.

### Fixed
- **Evidence Panel Disappearance**: Fixed the `menu_bookEvidence` section disappearing when streaming finishes without finding relevant manual evidence. It now displays a clean warning alert indicating that the query was not found in the manuals and that the provided information is unverified.

## [1.1.0] - 2026-06-20

### Added
- **RAG Sufficiency Heuristic & Validation**: Added an advanced symptom/fault keyword verification engine (`checkEvidenceSufficiency`) in [orchestrator.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/agents/orchestrator.ts). If the query contains fault symptoms but the vector search results contain only unrelated physical hardware assembly text, the context is marked as deficient (`isDeficient = true`).
- **Safety Prompt Override for Deficient Context**: Introduced the `DEFICIENT EVIDENCE OVERRIDE` instruction block in [prompts/serviceLogic.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/prompts/serviceLogic.ts). It forces the LLM to start instructions with a prominent warning prefix, forbids referencing irrelevant section numbers/internal pins (like J1/J6) from the manual, clamps confidence to $\le 0.3$, and clears citations.
- **Deterministic Backend Guardrails**: Implemented fallback rules in `normalizeOutput` within [serviceLogic.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/agents/serviceLogic.ts) that programmatically inject the warning prefix, reduce confidence, and clear the `evidence_used` array if the LLM fails to comply.
- **Normalization Test Suite**: Created a robust test suite [test-normalize.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/demo/test-normalize.ts) covering deficient warning injections, confidence clamping, and citation clearing for both English and Spanish queries.

### Changed
- **Query Sanitization**: Enhanced RAG precision by implementing `cleanSearchQuery` in [orchestrator.ts](file:///c:/Users/Handi/Desktop/MedPSY/src/agents/orchestrator.ts) to strip file names, directories, and extension noise (like `manuals\MT Datex...`) from input queries prior to embedding lookup.
- **Consumables Replacement Prompting**: Reworded prompt guidelines for `accessory_consumable` categories to avoid negative instructions (e.g. replacing "Do NOT" with a positive instruction to proceed directly to replacement and run post-swap validation).
- **Anti-Hallucination Constraints**: Enforced strict rules prohibiting the LLM from fabricating numeric values (ohm ranges, voltages, etc.) unless they are verbatim in the provided text, fallback to "per manufacturer specifications" instead.

### Fixed
- **Chain of Thought (CoT) Live Scroll Lock**: Corrected live SSE event streaming behavior in [app.js](file:///c:/Users/Handi/Desktop/MedPSY/src/ui/public/app.js) to prevent the main chat history window from auto-scrolling to the bottom when new CoT thinking tokens arrive. This allows the user to browse previous messages uninterrupted.
- **CoT Truncation & Internal Scroll**: Added scroll styling (`max-height: 300px; overflow-y: auto`) to final CoT containers and capped maximum final thinking logs output to 2,000 characters to prevent DOM overloading.
- **Orphan Dots in Instructions**: Patched list formatting in `normalizeOutput` to prevent empty lines and punctuation-only steps (orphan dots `.`) from appearing in numbered step outputs.
