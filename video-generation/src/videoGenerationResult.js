// videoGenerationResult.js — contrato uniforme del resultado de UNA llamada
// de generación de video, sin importar qué VideoProvider la produjo. MISMO
// idioma que image-generation/src/imageGenerationResult.js (Creative
// Production Orchestrator, 2026-08-24) -- no se inventa un vocabulario
// paralelo para video.
//
// REGLA CENTRAL (igual que ImageProvider): nunca se oculta un fallo.
// status distinto de SUCCESS exige "error" explícito; SUCCESS exige un
// "asset" real y prohíbe "error". isMock es siempre explícito.

export const VIDEO_GENERATION_STATUSES = Object.freeze([
  'SUCCESS', 'CONFIGURATION_REQUIRED', 'INVALID_REQUEST', 'PROVIDER_ERROR',
]);

export const GENERATED_VIDEO_REVIEW_STATUS = 'DRAFT';

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim?.()) throw new Error(`createVideoGenerationResult: "${fieldName}" es obligatorio.`);
}

/**
 * @param {object} args
 * @param {string} args.status — uno de VIDEO_GENERATION_STATUSES.
 * @param {string} args.requestId
 * @param {string} args.providerName
 * @param {string} args.model
 * @param {boolean} args.isMock
 * @param {string} args.generationFingerprint
 * @param {?{assetId:string|null, sourcePath:string, type:'GENERATED_VIDEO', format:string, durationSeconds:number, width:number, height:number}} [args.asset=null]
 * @param {number} [args.estimatedCost=0]
 * @param {number} [args.actualCost=0]
 * @param {string} [args.currency='USD']
 * @param {?number} [args.generationTimeMs=null]
 * @param {?string} [args.error=null]
 */
export function createVideoGenerationResult({
  status, requestId, providerName, model, isMock, generationFingerprint,
  asset = null, estimatedCost = 0, actualCost = 0, currency = 'USD', generationTimeMs = null, error = null,
}) {
  if (!VIDEO_GENERATION_STATUSES.includes(status)) {
    throw new Error(`createVideoGenerationResult: "status" inválido "${status}" (válidos: ${VIDEO_GENERATION_STATUSES.join(', ')}).`);
  }
  assertNonEmptyString(requestId, 'requestId');
  assertNonEmptyString(providerName, 'providerName');
  assertNonEmptyString(model, 'model');
  assertNonEmptyString(generationFingerprint, 'generationFingerprint');
  if (typeof isMock !== 'boolean') throw new Error('createVideoGenerationResult: "isMock" debe ser boolean explícito, nunca implícito.');

  if (status === 'SUCCESS') {
    if (!asset?.sourcePath?.trim?.()) throw new Error('createVideoGenerationResult: status SUCCESS requiere "asset.sourcePath" real.');
    if (error) throw new Error('createVideoGenerationResult: status SUCCESS nunca lleva "error".');
  } else if (!error?.trim?.()) {
    throw new Error(`createVideoGenerationResult: status "${status}" requiere "error" explícito -- nunca un fallo silencioso.`);
  } else if (asset) {
    throw new Error(`createVideoGenerationResult: status "${status}" nunca lleva "asset" -- solo SUCCESS produce un asset real.`);
  }

  return Object.freeze({
    status, requestId, providerName, model, isMock, generationFingerprint,
    asset: asset ? Object.freeze({ ...asset, reviewStatus: GENERATED_VIDEO_REVIEW_STATUS }) : null,
    estimatedCost, actualCost, currency, generationTimeMs, error,
  });
}
