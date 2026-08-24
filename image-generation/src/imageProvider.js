// imageProvider.js — contrato pequeño que todo ImageProvider real debe
// cumplir (MockImageProvider hoy; FluxProvider/OpenAIImageProvider/
// GoogleImagenProvider/LocalDiffusionProvider en fases futuras, ninguno
// implementado todavía). Mismo espíritu que
// media-hosting/src/mediaHostingService.js: un punto de entrada único
// (generateImage()) que nunca confía en que el llamador ya validó todo
// (defensa en profundidad), gatea por configuración ANTES de intentar
// cualquier llamada real, y nunca convierte un fallo en un éxito silencioso.
//
// Deliberadamente NO se diseña una interfaz compleja de scoring/fallback
// entre varios providers (eso es Fase 2+, y solo si hay más de un provider
// real conectado) -- esta fase tiene un único provider (mock).

import { createImageGenerationResult, IMAGE_GENERATION_STATUSES } from './imageGenerationResult.js';

// Vocabulario de referencia de capacidades -- documental, no cerrado: un
// provider real puede declarar capacidades adicionales sin que esto las
// rechace. Ningún provider está obligado a soportar todas.
export const IMAGE_PROVIDER_CAPABILITY_KEYS = Object.freeze([
  'textToImage', 'imageToImage', 'referenceImagePreservation', 'negativePrompt', 'aspectRatioControl',
]);

/**
 * Verifica que un objeto cumpla la forma mínima de ImageProvider:
 * providerName, model, capabilities, isConfigured(), generate(). Lanza con
 * el primer campo real que falte -- fail-closed, nunca asume una forma
 * parcial como válida.
 */
export function assertValidImageProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('assertValidImageProvider: "provider" debe ser un objeto real.');
  }
  if (!provider.providerName?.trim?.()) throw new Error('assertValidImageProvider: el provider debe declarar "providerName".');
  if (!provider.model?.trim?.()) throw new Error('assertValidImageProvider: el provider debe declarar "model".');
  if (!provider.capabilities || typeof provider.capabilities !== 'object') {
    throw new Error('assertValidImageProvider: el provider debe declarar "capabilities" (objeto real).');
  }
  if (typeof provider.isConfigured !== 'function') {
    throw new Error('assertValidImageProvider: el provider debe exponer isConfigured() -- ver Configuration Gate, mediaHostingContract.js.');
  }
  if (typeof provider.generate !== 'function') {
    throw new Error('assertValidImageProvider: el provider debe exponer generate(request).');
  }
  return true;
}

/**
 * Punto de entrada único para invocar cualquier ImageProvider real.
 * Defensa en profundidad (mismo criterio que MediaHostingService.upload()):
 *
 *   1. Valida la forma del provider -- nunca confía en que ya es válido.
 *   2. Verifica que el request fue construido PARA este provider/model
 *      exacto (createImageGenerationRequest() ya fija providerName/model
 *      en el request -- un mismatch aquí es un error de integración real,
 *      nunca se ignora).
 *   3. Si el provider no está configurado (sin credenciales), devuelve
 *      CONFIGURATION_REQUIRED sin intentar ninguna llamada real -- nunca
 *      hay fallback silencioso a otro provider, nunca una generación
 *      simulada por accidente.
 *   4. Envuelve provider.generate() en try/catch real: cualquier excepción
 *      se convierte en PROVIDER_ERROR explícito, nunca se propaga como un
 *      throw no manejado ni se confunde con SUCCESS.
 *   5. Verifica que lo que devolvió provider.generate() tenga la forma de
 *      un ImageGenerationResult real (al menos "status") -- un provider
 *      que devuelve basura nunca pasa como si fuera un resultado válido.
 *
 * @param {{provider: object, request: object}} args
 */
export async function generateImage({ provider, request }) {
  assertValidImageProvider(provider);
  if (!request || typeof request !== 'object' || !request.generationFingerprint) {
    throw new Error('generateImage: "request" debe ser un ImageGenerationRequest real (createImageGenerationRequest(), imageGenerationRequest.js).');
  }
  if (request.providerName !== provider.providerName || request.model !== provider.model) {
    throw new Error(`generateImage: el request fue construido para "${request.providerName}/${request.model}" pero se invocó con el provider "${provider.providerName}/${provider.model}" -- nunca se ejecuta un request contra un provider distinto del que lo generó.`);
  }

  if (!provider.isConfigured()) {
    return createImageGenerationResult({
      status: 'CONFIGURATION_REQUIRED',
      requestId: request.requestId,
      visualProductionPackageId: request.visualProductionPackageId,
      providerName: provider.providerName,
      model: provider.model,
      // CONFIGURATION_REQUIRED solo puede originarse en un provider real sin
      // credenciales -- MockImageProvider.isConfigured() es siempre true, así
      // que este camino nunca lo produce el mock.
      isMock: false,
      generationFingerprint: request.generationFingerprint,
      error: `generateImage: el provider "${provider.providerName}" no está configurado (faltan credenciales) -- ninguna llamada real fue intentada.`,
    });
  }

  try {
    const result = await provider.generate(request);
    if (!result?.status || !IMAGE_GENERATION_STATUSES.includes(result.status)) {
      throw new Error(`generateImage: "${provider.providerName}" devolvió un resultado con forma inválida -- generate() debe construirlo con createImageGenerationResult().`);
    }
    return result;
  } catch (err) {
    return createImageGenerationResult({
      status: 'PROVIDER_ERROR',
      requestId: request.requestId,
      visualProductionPackageId: request.visualProductionPackageId,
      providerName: provider.providerName,
      model: provider.model,
      isMock: false,
      generationFingerprint: request.generationFingerprint,
      error: `generateImage: "${provider.providerName}" lanzó un error real durante generate(): ${err.message}`,
    });
  }
}
