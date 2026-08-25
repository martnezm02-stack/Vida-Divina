// mockVideoProvider.js — provider de desarrollo/tests. NUNCA llama
// internet, NUNCA requiere credenciales. Mismo rol que
// image-generation/src/providers/mockImageProvider.js: valida el contrato
// real (VideoProvider) con un resultado determinista, nunca finge una
// generación real. El "asset" es un archivo de texto ".mock" (NUNCA
// ".mp4") -- un MP4 falso induciría a error a cualquier código que
// intente decodificarlo/reproducirlo como video real.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVideoGenerationResult } from '../videoGenerationResult.js';

export const DATA_ROOT = process.env.VIDEO_GENERATION_DATA_ROOT
  ? join(process.env.VIDEO_GENERATION_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const MOCK_OUTPUT_DIR = join(DATA_ROOT, 'mock-output');

function ensureDir(dir) { mkdirSync(dir, { recursive: true }); }

export class MockVideoProvider {
  providerName = 'mock';
  model = 'mock-video-model';
  capabilities = Object.freeze({
    textToVideo: true, imageToVideo: false, nativeAudio: false, maxDurationSeconds: 15, aspectRatioControl: true,
  });

  isConfigured() { return true; }

  async generate(request) {
    if (!request?.generationFingerprint || !request.generationPrompt?.trim?.() || !request.aspectRatio?.trim?.() || !Number.isFinite(request.durationSeconds)) {
      return createVideoGenerationResult({
        status: 'INVALID_REQUEST',
        requestId: request?.requestId ?? 'unknown',
        providerName: this.providerName,
        model: this.model,
        isMock: true,
        generationFingerprint: request?.generationFingerprint ?? '0'.repeat(64),
        error: 'MockVideoProvider: la solicitud no trae los campos mínimos reales (generationPrompt/durationSeconds/aspectRatio/generationFingerprint).',
      });
    }

    ensureDir(MOCK_OUTPUT_DIR);
    const fileName = `mock-${request.generationFingerprint}.mock`;
    const outputPath = join(MOCK_OUTPUT_DIR, fileName);
    const contenido = [
      'VIDA DIVINA -- MOCK VIDEO GENERATION RESULT',
      'ESTE ARCHIVO NO ES UN VIDEO REAL -- fixture determinista de prueba (Creative Production Orchestrator).',
      `provider: ${this.providerName}`, `model: ${this.model}`,
      `fingerprint: ${request.generationFingerprint}`,
      `aspectRatio: ${request.aspectRatio}`, `durationSeconds: ${request.durationSeconds}`,
      `generationPrompt: ${request.generationPrompt}`,
    ].join('\n');
    if (!existsSync(outputPath)) writeFileSync(outputPath, contenido, 'utf8');
    const assetId = createHash('sha256').update(contenido).digest('hex');

    return createVideoGenerationResult({
      status: 'SUCCESS',
      requestId: request.requestId,
      providerName: this.providerName,
      model: this.model,
      isMock: true,
      generationFingerprint: request.generationFingerprint,
      asset: {
        assetId, sourcePath: outputPath, type: 'GENERATED_VIDEO', format: 'mock',
        durationSeconds: request.durationSeconds, width: null, height: null,
      },
      estimatedCost: 0, actualCost: 0, currency: 'USD', generationTimeMs: 1,
    });
  }
}
