// ─── Biomed Field Copilot — OCR Engine with Real Bounding Boxes ───
// Uses @qvac/sdk ocr() for native on-device text extraction with
// real bbox coordinates, confidence scores, and detection statistics.

import { ocr, loadModel } from '@qvac/sdk';
import type { OCRTextBlock } from '@qvac/sdk';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface OCRBlock {
  text: string;
  bbox: [number, number, number, number] | null; // [x, y, w, h]
  confidence: number | null;
}

export interface OCRResult {
  blocks: OCRBlock[];
  fullText: string;
  totalBlocks: number;
  stats?: {
    detectionTime?: number;
    recognitionTime?: number;
    totalTime?: number;
  };
}

// ────────────────────────────────────────────
// OCR Manager
// ────────────────────────────────────────────

export class OCRManager {
  private ocrModelId: string | null = null;

  /**
   * Load the OCR model if not already loaded.
   * Uses the QVAC built-in ONNX OCR engine.
   */
  async ensureModelLoaded(): Promise<string> {
    if (this.ocrModelId) return this.ocrModelId;

    console.log('🔄 Loading OCR model...');
    const startTime = Date.now();

    const loadedId = await loadModel({
      modelSrc: 'onnx-community/ocr',
      modelType: 'ocr',
    });

    if (!loadedId) {
      throw new Error('Failed to load OCR model');
    }

    this.ocrModelId = loadedId;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ OCR model loaded in ${elapsed}s (modelId: ${this.ocrModelId})`);

    return loadedId;
  }

  /**
   * Process an image using the QVAC OCR engine.
   * Returns real text blocks with bounding box coordinates and confidence.
   *
   * @param imageInput - Base64-encoded image string or raw Buffer
   * @returns OCRResult with blocks, bbox coords, and detection stats
   */
  async processImage(imageInput: string | Buffer): Promise<OCRResult> {
    const modelId = await this.ensureModelLoaded();

    console.log('  🔍 Running OCR analysis...');
    const startTime = performance.now();

    // Call the real QVAC OCR API
    const result = await ocr({
      modelId,
      image: imageInput,
      options: { paragraph: false },
    });

    const totalTime = performance.now() - startTime;

    // Normalize the result — SDK returns blocks with text, bbox?, confidence?
    const blocks: OCRBlock[] = [];
    let fullText = '';

    if (result && typeof result === 'object') {
      // The OCR response can be streamed or direct
      const rawBlocks: OCRTextBlock[] = Array.isArray(result)
        ? result
        : (result as any).blocks || [];

      for (const block of rawBlocks) {
        const normalized: OCRBlock = {
          text: block.text || '',
          bbox: block.bbox || null,
          confidence: block.confidence ?? null,
        };
        blocks.push(normalized);
        fullText += (fullText ? ' ' : '') + normalized.text;
      }
    }

    console.log(`  ✅ OCR complete: ${blocks.length} text blocks found (${(totalTime / 1000).toFixed(1)}s)`);

    return {
      blocks,
      fullText: fullText.trim(),
      totalBlocks: blocks.length,
      stats: {
        totalTime: Math.round(totalTime),
      },
    };
  }

  /**
   * Process an image and return only the extracted text.
   * Backward-compatible with the old processImageWithVisionModel API.
   */
  async extractText(imageInput: string | Buffer): Promise<string> {
    try {
      const result = await this.processImage(imageInput);
      return result.fullText;
    } catch (err) {
      console.error('  ❌ OCR text extraction failed:', (err as Error).message);
      return '';
    }
  }

  /**
   * Check if the OCR model is loaded.
   */
  isLoaded(): boolean {
    return this.ocrModelId !== null;
  }

  /**
   * Get the model ID if loaded.
   */
  getModelId(): string | null {
    return this.ocrModelId;
  }
}

// ────────────────────────────────────────────
// Legacy compatibility export
// ────────────────────────────────────────────

/**
 * @deprecated Use OCRManager.extractText() instead.
 * Legacy function maintained for backward compatibility with agents.
 */
export async function processImageWithVisionModel(
  _modelManager: any,
  imageBase64: string,
  ocrManager?: OCRManager
): Promise<string> {
  if (ocrManager) {
    return ocrManager.extractText(imageBase64);
  }
  // Fallback: create a temporary manager
  const tempManager = new OCRManager();
  return tempManager.extractText(imageBase64);
}
