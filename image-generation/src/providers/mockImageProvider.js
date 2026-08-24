// mockImageProvider.js — provider de desarrollo/tests, Fase 1. NUNCA llama
// internet, NUNCA requiere credenciales, NUNCA usa un modelo de IA real --
// mismo rol que media-hosting/src/mockMediaHostingProvider.js cumple para
// hosting: validar el contrato real (ImageProvider) con un resultado
// determinista, nunca fingir una generación real.
//
// El "asset" que produce es un archivo de texto determinista (extensión
// ".mock", NUNCA ".png"/".jpg") -- deliberado: un archivo con extensión de
// imagen pero contenido falso induciría a error a cualquier código futuro
// que intente decodificarlo como imagen real. El contenido incluye el
// fingerprint real de la solicitud, así que dos solicitudes con insumos
// generativos distintos producen archivos (y por lo tanto assetId/hash)
// distintos -- dos solicitudes IDÉNTICAS producen el mismo archivo
// (idempotente por nombre determinista, mismo criterio content-addressed
// que assetLineage.js).

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageGenerationResult } from '../imageGenerationResult.js';

// Mismo patrón que content-orchestrator/src/assetLineage.js#DATA_ROOT: sin
// la variable de entorno, el default es image-generation/data (aislado del
// resto del proyecto); los tests la sobrescriben a un directorio temporal.
export const DATA_ROOT = process.env.IMAGE_GENERATION_DATA_ROOT
  ? join(process.env.IMAGE_GENERATION_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const MOCK_OUTPUT_DIR = join(DATA_ROOT, 'mock-output');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export class MockImageProvider {
  providerName = 'mock';
  model = 'mock-image-model';
  capabilities = Object.freeze({
    textToImage: true,
    imageToImage: true,
    referenceImagePreservation: true,
    negativePrompt: true,
    aspectRatioControl: true,
  });

  /** Nunca requiere credenciales -- Fase 1, Parte 4/6. */
  isConfigured() {
    return true;
  }

  /**
   * Nunca llama red, nunca usa un modelo de difusión real. Valida la forma
   * mínima real del request (defensa en profundidad, no confía en que
   * generateImage() ya validó todo) y produce un fixture determinista.
   */
  async generate(request) {
    if (!request?.generationFingerprint || !request.generationPrompt?.trim?.() || !request.negativePrompt?.trim?.() || !request.aspectRatio?.trim?.()) {
      return createImageGenerationResult({
        status: 'INVALID_REQUEST',
        requestId: request?.requestId ?? 'unknown',
        visualProductionPackageId: request?.visualProductionPackageId ?? null,
        providerName: this.providerName,
        model: this.model,
        isMock: true,
        generationFingerprint: request?.generationFingerprint ?? '0'.repeat(64),
        error: 'MockImageProvider: la solicitud no trae los campos mínimos reales (generationPrompt/negativePrompt/aspectRatio/generationFingerprint).',
      });
    }

    ensureDir(MOCK_OUTPUT_DIR);
    const fileName = `mock-${request.generationFingerprint}.mock`;
    const outputPath = join(MOCK_OUTPUT_DIR, fileName);
    const contenido = [
      'VIDA DIVINA -- MOCK IMAGE GENERATION RESULT',
      'ESTE ARCHIVO NO ES UNA IMAGEN REAL -- fixture determinista de prueba (Fase 1, Image Generation Engine).',
      `provider: ${this.providerName}`,
      `model: ${this.model}`,
      `fingerprint: ${request.generationFingerprint}`,
      `aspectRatio: ${request.aspectRatio}`,
      `generationPrompt: ${request.generationPrompt}`,
      `negativePrompt: ${request.negativePrompt}`,
      `productReferenceAssetId: ${request.productReference ? request.productReference.assetId : 'NONE'}`,
    ].join('\n');

    // Idempotente: mismo fingerprint -> mismo nombre de archivo -> no se
    // reescribe si ya existe (mismo criterio "content-addressed" que
    // recordLineage() en assetLineage.js).
    if (!existsSync(outputPath)) writeFileSync(outputPath, contenido, 'utf8');

    const assetId = createHash('sha256').update(contenido).digest('hex');

    return createImageGenerationResult({
      status: 'SUCCESS',
      requestId: request.requestId,
      visualProductionPackageId: request.visualProductionPackageId,
      providerName: this.providerName,
      model: this.model,
      isMock: true,
      generationFingerprint: request.generationFingerprint,
      asset: {
        assetId,
        sourcePath: outputPath,
        type: 'GENERATED_IMAGE',
        format: 'mock',
        aspectRatio: request.aspectRatio,
      },
      estimatedCost: 0,
      actualCost: 0,
      currency: 'USD',
    });
  }
}
