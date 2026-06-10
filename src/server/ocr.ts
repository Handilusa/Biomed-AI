// ─── Biomed Field Copilot — OCR/Vision Integration ───

import { completion } from '@qvac/sdk';
import type { ModelManager } from '../models/manager.js';

export async function processImageWithVisionModel(
  modelManager: ModelManager,
  imageBase64: string
): Promise<string> {
  try {
    // Attempt to use QVAC native multimodal capability if vision model is loaded
    const modelId = modelManager.getModelId('vision'); // Assumes a vision model role exists
    if (!modelId) {
      console.warn('No vision model loaded in ModelManager. Returning empty OCR.');
      return '';
    }

    const run = completion({
      modelId,
      history: [
        { role: 'user', content: `Please extract all visible text from this image, including alarm codes, error numbers, and component labels.\n[IMAGE:${imageBase64}]` }
      ],
      stream: false
    });

    let extractedText = '';
    for await (const event of run.events) {
      if (event.type === 'contentDelta') {
        extractedText += (event as any).text;
      }
    }

    return extractedText.trim();
  } catch (error) {
    console.error('Vision/OCR processing failed:', error);
    return ''; // Fallback gracefully if OCR fails
  }
}
