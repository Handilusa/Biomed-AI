# 🏗️ BioMed AI - System Architecture & Workflows

This document provides detailed architectural diagrams and workflow specifications for the core subsystems of **BioMed AI**. 

---

## 🗺️ System Architecture Overview

BioMed AI is built on four core local Pillars designed to run completely offline on consumer hardware. The relationship between the Web Interface, the Express Backend, and the local QVAC SDK Inference Engines is illustrated below:

```mermaid
graph TB
    subgraph Client [Web UI - Frontend]
        UI[Dashboard / Chat / Swarm Panel / Canvas]
        ChartJS[Chart.js Loss Curve Graph]
        HTML5Canvas[HTML5 Canvas Bounding Box Drawer]
    end

    subgraph Server [Express App - Node.js 22 Backend]
        REST[REST API Endpoints]
        SSE[SSE Event Streamers /api/swarm/events, /api/train/events]
        Router[Deterministic Intent Router]
        Compliance[Compliance Agent / safetyRules]
        ModelManager[Model Loader & Lifecycle Manager]
        Logger[Structured Logging Engine JSONL + CSV]
    end

    subgraph QVAC [QVAC SDK Local Inference Engine]
        SDK[QVAC SDK Client]
        LLM[MedPsy-4B Quantized LLM]
        Embeddings[Nomic Embed Text v1.5]
        OCR[ONNX-Native OCR Engine]
        Bergamot[Bergamot NMT Translation Engine]
        Swarm[Hyperswarm P2P Swarm Engine]
        HyperDB[(HyperDB Vector Store)]
    end

    %% Interactions
    UI -->|REST Request: chat, OCR, LoRA| REST
    UI -->|Listen to Events| SSE
    REST -->|Intent Classification & Check| Router
    REST -->|Manage Models| ModelManager
    REST -->|Compliance check| Compliance
    REST -->|Write logs| Logger

    ModelManager -->|Load/Unload/Translate| SDK
    Router -->|Check safety rules| Compliance
    Compliance -->|Vector Embeddings & Search| SDK
    
    SDK <-->|Federated Inference Delegate| Swarm
    SDK <-->|PDF chunk embeddings| HyperDB
    SDK -->|Text extraction| OCR
    SDK -->|Inference runs| LLM
    SDK -->|Translate text| Bergamot
```

---

## 🔄 1. Multi-Agent Triage & Request Validation Lifecycle

This diagram illustrates how a technician's query flows through the system, including deterministic triage, programmatic safety rules checking, RAG manual context retrieval, MedPsy-4B LLM completion, and final compliance validation before streaming to the UI.

```mermaid
graph TD
    User([User Query]) --> Router{Deterministic Triage}
    
    Router -->|Clinical Topic| ClinicalReferral[Compliance Agent: clinical_referral] --> UserResponse([Bypassed Response with Clinical Disclaimer])
    
    Router -->|Technical/Medical/Other| SafetyCheck{Safety Rules Matcher}
    
    SafetyCheck -->|Triggered Hazard| Escalate[Forced Safe State: escalate] --> UserResponse
    
    SafetyCheck -->|Safe Query| RAGCheck{RAG Retrieval needed?}
    
    RAGCheck -->|Yes: Technical| HyperDB[(HyperDB Vector Store)]
    HyperDB -->|Local RAG Context| MedPsyLLM[MedPsy-4B Inference Engine]
    
    RAGCheck -->|No: Medical/Other| MedPsyLLM
    
    MedPsyLLM -->|Raw LLM Response| ComplianceAgent{LLM Compliance Agent}
    
    ComplianceAgent -->|Assign Final Disposition & Safety Note| FinalResponse([Stream Response + Disclaimers + Badges to UI])
```

### Key Stages:
1. **Deterministic Triage:** Keyword-based routing immediately isolates clinical queries, forwarding them to the compliance agent to safeguard against clinical misdiagnoses.
2. **Programmatic Safety Checks:** Scans queries and evidence against critical edge-case safety rules (e.g. high-voltage discharge, oxygen hydrocarbon contamination, laser safety) to preemptively flag hazardous activities.
3. **HyperDB Retrieval:** Technical queries perform a semantic embedding lookup via the local vector database, injecting relevant manual snippets directly into the prompt context.
4. **Compliance Validation:** The final output is checked by an LLM-based compliance validator to extract the final disposition (`swap_test`, `recalibrate`, `escalate`, etc.) and append any required safety disclaimers.

---

## 🌐 2. P2P Swarm & Federated Inference Architecture

When multiple technicians operate on the same hospital local network, BioMed AI uses **Hyperswarm** to share compute loads and delegate inference calls automatically.

```mermaid
graph TD
    subgraph LAN [Hospital Local Area Network]
        PeerA[Technician Laptop A - requester]
        PeerB[Technician Laptop B - provider]
        PeerC[Technician Laptop C - provider]
    end

    PeerA <-->|Hyperswarm P2P Discovery| PeerB
    PeerA <-->|Hyperswarm P2P Discovery| PeerC

    PeerA -->|1. Request Triage| RouterA[Local Router]
    RouterA -->|2. Inference Request| SDKe[QVAC SDK Client]
    
    SDKe -->|3. Check Swarm Peers| SwarmManager[Swarm Delegate Manager]
    
    SwarmManager -->|Option A: Peer B Idle| RemoteCall[completion delegate: Peer B] --> PeerB
    PeerB -->|Remote Inference via P2P Stream| RemoteCall
    
    SwarmManager -->|Option B: Peers Busy / Offline| LocalInference[Local Inference: MedPsy-4B]
    
    RemoteCall -->|4. Handshake / Fallback check| ResponseStream["SSE Stream: /api/swarm/events"]
    LocalInference --> ResponseStream
    
    ResponseStream -->|5. Render badges & text| UI[Web Interface]
```

### Key Features:
* **Zero Configuration:** Technicians discover each other automatically using local network peer discovery via DHT and multicast DNS.
* **Automatic Fallback:** If a remote peer fails to respond or is disconnected, the QVAC SDK automatically falls back to local execution on Laptop A without interrupting the technician's workflow.
* **Swarm Diagnostics:** SSE connection events stream to the UI in real time, updating the swarm dashboard with the number of connected peers and active delegation handshakes.

---

## 📈 3. Local LoRA Fine-Tuning & Loss Streaming

Technicians can refine the diagnostics by providing corrections. Once enough corrections are saved, the local LoRA training cycle begins, streaming live training loss metrics directly to a Chart.js interface.

```mermaid
graph TD
    UserCorrection([User Corrects AI Response]) --> LocalStorage[(data/corrections.jsonl)]
    
    LocalStorage --> ThresholdCheck{Count >= 5?}
    
    ThresholdCheck -->|No| Wait[Wait for more corrections]
    ThresholdCheck -->|Yes| EnableTrain[Enable 'Train MedPsy Model' Button in UI]
    
    EnableTrain -->|Click Train| Backend[Express Server]
    
    Backend -->|Initialize finetune loop| SDK[QVAC SDK Fine-Tuning Engine]
    
    SDK -->|Epoch Step, Accuracy, Loss| TrainLoop(Training Loop)
    
    TrainLoop -->|Local LoRA Weights Update| MedPsyLLM[(MedPsy-4B Weights)]
    TrainLoop -->|Stream Metrics via SSE| SSE["SSE Stream: /api/train/events"]
    
    SSE -->|Real-time Data Stream| ChartJS[Chart.js Loss Curve Graph]
```

### Key Workflow:
1. **Correction Capture:** Technician adjustments to diagnostic reasoning are stored locally in JSONL format.
2. **LoRA Fine-Tuning Trigger:** When at least 5 corrections accumulate, the UI enables training.
3. **Training Execution:** The backend initializes the QVAC fine-tuning adapter, training the model locally.
4. **Real-time Charting:** Epoch step index, accuracy, and loss metrics are piped to the client via a SSE channel and rendered on a Chart.js line graph, visualizing model convergence.
