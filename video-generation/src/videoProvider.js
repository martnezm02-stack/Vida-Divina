// videoProvider.js — contrato pequeño que todo VideoProvider real debe
// cumplir (MockVideoProvider hoy; MiniMaxVideoProvider como adapter real
// -- CONFIGURATION_REQUIRED sin credenciales, nunca simula una generación
// real). Mismo espíritu EXACTO que image-generation/src/imageProvider.js
// -- no se duplica el patrón, se replica a propósito para mantener ambos
// providers intercambiables desde el mismo ProviderRouter
// (content-orchestrator/src/providerRouter.js).

import { createVideoGenerationResult, VIDEO_GENERATION_STATUSES } from './videoGenerationResult.js';

export const VIDEO_PROVIDER_CAPABILITY_KEYS = Object.freeze([
  'textToVideo', 'imageToVideo', 'nativeAudio', 'maxDurationSeconds', 'aspectRatioControl',
]);

export function assertValidVideoProvider(provider) {
  if (!provider || typeof provider !== 'object') throw new Error('assertValidVideoProvider: "provider" debe ser un objeto real.');
  if (!provider.providerName?.trim?.()) throw new Error('assertValidVideoProvider: el provider debe declarar "providerName".');
  if (!provider.model?.trim?.()) throw new Error('assertValidVideoProvider: el provider debe declarar "model".');
  if (!provider.capabilities || typeof provider.capabilities !== 'object') throw new Error('assertValidVideoProvider: el provider debe declarar "capabilities".');
  if (typeof provider.isConfigured !== 'function') throw new Error('assertValidVideoProvider: el provider debe exponer isConfigured().');
  if (typeof provider.generate !== 'function') throw new Error('assertValidVideoProvider: el provider debe exponer generate(request).');
  return true;
}

/**
 * Punto de entrada único para invocar cualquier VideoProvider real --
 * MISMA defensa en profundidad que generateImage() de
 * image-generation/src/imageProvider.js: valida forma, gate de
 * configuración ANTES de cualquier llamada real, nunca fallback
 * silencioso, cualquier excepción se convierte en PROVIDER_ERROR
 * explícito.
 */
export async function generateVideo({ provider, request }) {
  assertValidVideoProvider(provider);
  if (!request || typeof request !== 'object' || !request.generationFingerprint) {
    throw new Error('generateVideo: "request" debe ser un VideoGenerationRequest real (createVideoGenerationRequest(), videoGenerationRequest.js).');
  }
  if (request.providerName !== provider.providerName || request.model !== provider.model) {
    throw new Error(`generateVideo: el request fue construido para "${request.providerName}/${request.model}" pero se invocó con "${provider.providerName}/${provider.model}".`);
  }

  if (!provider.isConfigured()) {
    return createVideoGenerationResult({
      status: 'CONFIGURATION_REQUIRED',
      requestId: request.requestId,
      providerName: provider.providerName,
      model: provider.model,
      isMock: false,
      generationFingerprint: request.generationFingerprint,
      error: `generateVideo: el provider "${provider.providerName}" no está configurado (falta credencial real, ej. MINIMAX_API_KEY) -- ninguna llamada real fue intentada.`,
    });
  }

  const t0 = Date.now();
  try {
    const result = await provider.generate(request);
    if (!result?.status || !VIDEO_GENERATION_STATUSES.includes(result.status)) {
      throw new Error(`generateVideo: "${provider.providerName}" devolvió un resultado con forma inválida -- generate() debe construirlo con createVideoGenerationResult().`);
    }
    return result;
  } catch (err) {
    return createVideoGenerationResult({
      status: 'PROVIDER_ERROR',
      requestId: request.requestId,
      providerName: provider.providerName,
      model: provider.model,
      isMock: false,
      generationFingerprint: request.generationFingerprint,
      generationTimeMs: Date.now() - t0,
      error: `generateVideo: "${provider.providerName}" lanzó un error real durante generate(): ${err.message}`,
    });
  }
}
