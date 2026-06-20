# Changelog

All notable changes to the **BioMed AI Copilot** project are documented in this file.

---

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
