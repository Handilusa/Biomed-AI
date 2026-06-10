# Biomed Field Copilot

> 100% local, privacy-first AI assistant for biomedical equipment technicians — powered by [QVAC](https://qvac.tether.io) MedPsy models running entirely on-device.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![QVAC SDK](https://img.shields.io/badge/QVAC-SDK-teal)](https://docs.qvac.tether.io)
[![Hackathon](https://img.shields.io/badge/QVAC%20Hackathon-2026-orange)](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i)

---

## ⚕️ Important Disclaimer

> **This tool is for educational and support purposes only — not for clinical diagnosis or treatment.**  
> Final clinical decisions must be made by qualified healthcare professionals.  

---

## Overview

Biomed Field Copilot is a **multi-agent AI system** that helps biomedical equipment technicians with:

1. **🔧 Technical Troubleshooting** — Step-by-step guidance for equipment issues grounded by RAG over maintenance manuals.
2. **🧠 Field Heuristics** — Applies real-world biomédica logic (e.g. swap-tests, modular replacement, escalation).
3. **👁️ Multimodal OCR** — Processes images of screens, alarms, or error codes locally.

**Key features:**
- **Zero cloud AI** — All inference runs locally via QVAC SDK on consumer hardware
- **Multi-agent architecture** — Sequential pipeline (Triage -> Manual Evidence -> Service Logic -> Compliance)
- **Local RAG & Tool Calling** — Uses structured tool schemas locally for strict diagnostic pathways
- **Privacy-first** — No patient data leaves the device

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (localhost:3000)               │
│                  Image Upload + Markdown Streaming           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   Multi-Agent Orchestrator                   │
│                                                              │
│  1. Triage Agent: Classifies category & extracts signals     │
│  2. Manual Evidence Agent: RAG search on selected manual     │
│  3. Service Logic Agent: Applies real biomédica heuristics   │
│  4. Compliance Agent: Safety limits & final disposition      │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │  Local AI Stack │
    │  QVAC SDK       │
    │  MedPsy LLM     │
    │  Vision OCR     │
    └─────────────────┘
```

---

## Hardware Requirements

| Component | Specification |
|-----------|--------------|
| **CPU** | Intel Core i7 13th gen (or equivalent) |
| **GPU** | NVIDIA RTX 5060 Laptop (or any Vulkan-compatible GPU) |
| **RAM** | 32 GB |
| **OS** | Windows 11 / Linux (Ubuntu 22.04+) |

### Memory Budget

| Component | Size |
|-----------|------|
| MedPsy-4B Q4_K_M (LLM) | ~2.6 GB |
| Vision/OCR Model (if loaded) | ~1.5 GB |
| Embedding model (RAG) | ~0.5 GB |
| **Total AI footprint** | **~4.6 GB** |

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Download models
```bash
npm run download:models
```

### 3. Start the server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

> [!TIP]
> **Troubleshooting: "Model loading failed: RPC initialization timed out"**  
> If the server crashed or was stopped abruptly, QVAC might leave a stale lock file. On the next startup, you might see a 30s timeout error.
> 
> **Solution:** Simply stop the process (Ctrl+C) and run `npm run dev` again. The first run will automatically clean up the stale lock, and the second run will load the models successfully in a few seconds.

---

## Demo Run (Evidence Bundle)

To generate the structured logs required for hackathon verification:

```bash
npm run demo:log
```

**Output:**
- `logs/demo_run_<timestamp>.jsonl` — Structured JSON logs with Triage Category, Tools Called, and Final Disposition.
- `logs/demo_run_<timestamp>.csv` — CSV for spreadsheet analysis

See [EVIDENCE.md](EVIDENCE.md) for log format documentation.
