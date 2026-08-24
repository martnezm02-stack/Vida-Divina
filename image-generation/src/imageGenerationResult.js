// imageGenerationResult.js — contrato uniforme del resultado de UNA llamada
// de generación de imagen, sin importar qué ImageProvider la produjo. Mismo
// idioma que media-hosting/src/mediaHostingContract.js#createMediaHostingResult():
// un único constructor validador, ningún provider arma este objeto a mano.
//
// REGLA CENTRAL: nunca se oculta un fallo. status distinto de SUCCESS exige
// "error" explícito; SUCCESS exige un "asset" real y prohíbe "error". Un
// asset generado nunca nace aprobado -- reviewStatus es un valor fijo
// (GENERATED_IMAGE_REVIEW_STATUS = 'DRAFT'), nunca un parámetro que el
// llamador pueda establecer (mismo patrón que PACKAGE_STATUS en
// creative-intelligence/production/visualProductionPackage.js): el
// generador jamás puede aprobar su propio asset.

import { randomUUID } from 'node:crypto';

export const IMAGE_GENERATION_STATUSES = Object.freeze([
  'SUCCESS', 'CONFIGURATION_REQUIRED', 'INVALID_REQUEST', 'PROVIDER_ERROR',
]);

// Fijo -- todo GeneratedImage nace en DRAFT, nunca APPROVED. La integración
// con Human Review (dashboard) queda para una fase posterior (Fase 1, Parte 11).
export const GENERATED_IMAGE_REVIEW_STATUS = 'DRAFT';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim?.()) throw new Error(`createImageGenerationResult: "${fieldName}" es obligatorio.`);
}

/**
 * @param {object} args
 * @param {string} args.status — uno de IMAGE_GENERATION_STATUSES.
 * @param {string} args.requestId — el requestId real del ImageGenerationRequest que originó este resultado.
 * @param {?string} args.visualProductionPackageId
 * @param {string} args.providerName
 * @param {string} args.model
 * @param {boolean} args.isMock — explícito, nunca implícito (mismo criterio que "hasRealProductReference" en visualProductionPackage.js).
 * @param {string} args.generationFingerprint — hash sha256 real (computeGenerationFingerprint(), imageGenerationRequest.js).
 * @param {?{assetId:string|null, sourcePath:string, type:string, format:string, aspectRatio:string}} [args.asset=null] — obligatorio si status==='SUCCESS', debe ser null en cualquier otro caso.
 * @param {number} [args.estimatedCost=0]
 * @param {number} [args.actualCost=0]
 * @param {string} [args.currency='USD']
 * @param {?string} [args.error=null] — obligatorio si status!=='SUCCESS', debe ser null si status==='SUCCESS'.
 */
export function createImageGenerationResult({
  status,
  requestId,
  visualProductionPackageId = null,
  providerName,
  model,
  isMock,
  generationFingerprint,
  asset = null,
  estimatedCost = 0,
  actualCost = 0,
  currency = 'USD',
  error = null,
}) {
  if (!IMAGE_GENERATION_STATUSES.includes(status)) {
    throw new Error(`createImageGenerationResult: "status" inválido "${status}" (válidos: ${IMAGE_GENERATION_STATUSES.join(', ')}).`);
  }
  assertNonEmptyString(requestId, 'requestId');
  assertNonEmptyString(providerName, 'providerName');
  assertNonEmptyString(model, 'model');
  if (typeof isMock !== 'boolean') {
    throw new Error('createImageGenerationResult: "isMock" debe ser boolean explícito -- nunca se asume si un resultado es de prueba o real.');
  }
  if (typeof generationFingerprint !== 'string' || !SHA256_PATTERN.test(generationFingerprint)) {
    throw new Error('createImageGenerationResult: "generationFingerprint" debe ser el hash sha256 real (computeGenerationFingerprint(), imageGenerationRequest.js).');
  }
  if (typeof estimatedCost !== 'number' || Number.isNaN(estimatedCost) || estimatedCost < 0) {
    throw new Error('createImageGenerationResult: "estimatedCost" debe ser un número >= 0.');
  }
  if (typeof actualCost !== 'number' || Number.isNaN(actualCost) || actualCost < 0) {
    throw new Error('createImageGenerationResult: "actualCost" debe ser un número >= 0.');
  }
  assertNonEmptyString(currency, 'currency');

  if (status === 'SUCCESS') {
    if (error !== null) throw new Error('createImageGenerationResult: status "SUCCESS" no puede llevar "error" -- un resultado exitoso nunca reporta un fallo.');
    if (!asset || typeof asset !== 'object') throw new Error('createImageGenerationResult: status "SUCCESS" requiere "asset" real.');
    if (!asset.sourcePath?.trim?.()) throw new Error('createImageGenerationResult: "asset.sourcePath" es obligatorio.');
    if (asset.assetId !== null && asset.assetId !== undefined && !SHA256_PATTERN.test(asset.assetId)) {
      throw new Error('createImageGenerationResult: "asset.assetId", si se provee, debe ser un hash sha256 real (content-addressed, mismo idioma que assetRegistry.js/assetLineage.js).');
    }
    if (!asset.type?.trim?.()) throw new Error('createImageGenerationResult: "asset.type" es obligatorio (ej. "GENERATED_IMAGE").');
  } else {
    if (!error?.trim?.()) throw new Error(`createImageGenerationResult: status "${status}" requiere "error" explícito -- nunca se oculta un fallo.`);
    if (asset !== null) throw new Error(`createImageGenerationResult: status "${status}" no puede llevar "asset" -- ningún resultado no exitoso produce un asset real.`);
  }

  return Object.freeze({
    imageGenerationResultId: randomUUID(),
    requestId,
    visualProductionPackageId,
    status,
    providerName,
    model,
    isMock,
    generationFingerprint,
    asset: asset
      ? Object.freeze({
        assetId: asset.assetId ?? null,
        sourcePath: asset.sourcePath,
        type: asset.type,
        format: asset.format ?? null,
        aspectRatio: asset.aspectRatio ?? null,
        reviewStatus: GENERATED_IMAGE_REVIEW_STATUS,
      })
      : null,
    estimatedCost,
    actualCost,
    currency,
    error,
    createdAt: new Date().toISOString(),
  });
}
