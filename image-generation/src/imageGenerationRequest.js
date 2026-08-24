// imageGenerationRequest.js — adaptador determinista:
// VisualProductionPackage (ya real, ya validado por
// creative-intelligence/production/visualProductionPackage.js) -> solicitud
// plana que un ImageProvider.generate() puede consumir directamente.
//
// REGLA CENTRAL (mismo criterio que
// contentOrchestrator.js#visualProductionPackageToRenderArgs()): este
// archivo NUNCA redacta texto nuevo, NUNCA reconstruye Persona/Pain/Angle,
// NUNCA genera claims -- es un mapeo explícito de campos que YA existen en
// el VisualProductionPackage real. Es la única traducción de ese objeto a
// este vocabulario; no se duplica en ningún otro archivo.
//
// LÍMITE DE ARQUITECTURA (Fase 1, Parte 16): la única entrada de negocio
// autorizada de esta función es un VisualProductionPackage real. Se valida
// su forma contra el vocabulario que el propio módulo
// visualProductionPackage.js exporta (PRODUCT_REFERENCE_STATUSES) -- se
// reutiliza esa constante por import, nunca se duplica un vocabulario
// paralelo. No se importa nada de persona.js/pain.js/creativeCell.js ni de
// ningún loader de Product Facts.
//
// PRODUCT REFERENCE (Fase 1, Parte 3 -- gap reportado en el informe final):
// cuando el VisualProductionPackage declara
// productPlacement.assetStatus === 'PRODUCT_REFERENCE_AVAILABLE', el
// llamador debe proveer "productReferenceAsset" -- el objeto YA registrado
// por video-production/src/assetRegistry.js#registerImageAsset() (o su
// envoltorio en content-orchestrator/src/assetPackage.js#registerAssetEntry,
// misma forma en los campos que aquí se validan). Este archivo NUNCA llama
// a registerImageAsset() ni lee bytes del archivo -- solo transporta la
// referencia (assetId/sourcePath/role) ya validada por esa capa, y verifica
// que el archivo siga existiendo en disco. No copia, no mueve, no
// sobrescribe, no reclasifica el RAW como GENERATED_IMAGE. La integridad
// completa (hash real recalculado antes/después de una operación) sigue
// siendo responsabilidad exclusiva de
// content-orchestrator/src/productIntegrity.js -- no se duplica aquí.

import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PRODUCT_REFERENCE_STATUSES } from '../../creative-intelligence/production/visualProductionPackage.js';
import { ASSET_ROLES as PRODUCT_REFERENCE_ROLES } from '../../video-production/src/assetRegistry.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim?.()) throw new Error(`createImageGenerationRequest: "${fieldName}" es obligatorio.`);
}

function assertValidVisualProductionPackage(vpp) {
  if (!vpp || typeof vpp !== 'object') {
    throw new Error('createImageGenerationRequest: "visualProductionPackage" debe ser un objeto real (createVisualProductionPackage(), creative-intelligence/production/visualProductionPackage.js).');
  }
  assertNonEmptyString(vpp.visualProductionPackageId, 'visualProductionPackage.visualProductionPackageId');
  assertNonEmptyString(vpp.generationPrompt, 'visualProductionPackage.generationPrompt');
  assertNonEmptyString(vpp.negativePrompt, 'visualProductionPackage.negativePrompt');
  assertNonEmptyString(vpp.sceneDescription, 'visualProductionPackage.sceneDescription');
  assertNonEmptyString(vpp.subjectDescription, 'visualProductionPackage.subjectDescription');
  if (!vpp.productPlacement?.description?.trim?.()) {
    throw new Error('createImageGenerationRequest: "visualProductionPackage.productPlacement.description" es obligatorio.');
  }
  if (!PRODUCT_REFERENCE_STATUSES.includes(vpp.productPlacement?.assetStatus)) {
    throw new Error(`createImageGenerationRequest: "visualProductionPackage.productPlacement.assetStatus" inválido "${vpp.productPlacement?.assetStatus}" (válidos: ${PRODUCT_REFERENCE_STATUSES.join(', ')}).`);
  }
  assertNonEmptyString(vpp.cameraDirection, 'visualProductionPackage.cameraDirection');
  assertNonEmptyString(vpp.lightingDirection, 'visualProductionPackage.lightingDirection');
  if (!Array.isArray(vpp.screenText)) {
    throw new Error('createImageGenerationRequest: "visualProductionPackage.screenText" debe ser un arreglo.');
  }
  if (!Array.isArray(vpp.aspectRatios) || vpp.aspectRatios.length === 0) {
    throw new Error('createImageGenerationRequest: "visualProductionPackage.aspectRatios" debe ser un arreglo no vacío.');
  }
  assertNonEmptyString(vpp.assetType, 'visualProductionPackage.assetType');
}

/** Verifica la forma mínima de una referencia de producto YA registrada -- nunca lee bytes, nunca recalcula el hash (eso es productIntegrity.js). */
function assertValidProductReferenceAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    throw new Error('createImageGenerationRequest: "productReferenceAsset" debe ser un objeto real (el resultado de registerImageAsset()/registerAssetEntry(), no fabricado aquí).');
  }
  if (!asset.assetId || !SHA256_PATTERN.test(asset.assetId)) {
    throw new Error('createImageGenerationRequest: "productReferenceAsset.assetId" debe ser un hash sha256 real (ver assetRegistry.js#registerImageAsset).');
  }
  if (!asset.sourcePath?.trim?.()) {
    throw new Error('createImageGenerationRequest: "productReferenceAsset.sourcePath" es obligatorio.');
  }
  if (!existsSync(asset.sourcePath)) {
    throw new Error(`createImageGenerationRequest: "productReferenceAsset.sourcePath" ("${asset.sourcePath}") no existe físicamente en disco -- nunca se transporta una referencia a un archivo inexistente.`);
  }
  if (!asset.role || !PRODUCT_REFERENCE_ROLES.includes(asset.role)) {
    throw new Error(`createImageGenerationRequest: "productReferenceAsset.role" inválido "${asset.role}" (válidos: ${PRODUCT_REFERENCE_ROLES.join(', ')}).`);
  }
}

/**
 * Hash determinista de los campos que realmente determinan el contenido
 * generado -- mismo idioma sha256 content-addressed que ya usa todo el
 * proyecto (assetRegistry.js/assetLineage.js), no una librería nueva.
 * Excluye deliberadamente requestId/createdAt: dos solicitudes construidas
 * en momentos distintos, con los mismos insumos generativos, deben producir
 * el MISMO fingerprint (Fase 1, Parte 8 -- idempotencia futura).
 */
export function computeGenerationFingerprint({
  generationPrompt, negativePrompt, aspectRatio, providerName, model, productReference,
}) {
  const canonical = JSON.stringify({
    generationPrompt,
    negativePrompt,
    aspectRatio,
    providerName,
    model,
    referenceAssetId: productReference?.assetId ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * @param {object} args
 * @param {object} args.visualProductionPackage — objeto real de createVisualProductionPackage().
 * @param {string} args.providerName — providerName del ImageProvider destino (ej. "mock").
 * @param {string} args.model — model del ImageProvider destino (ej. "mock-image-model").
 * @param {?object} [args.productReferenceAsset=null] — obligatorio si
 *   visualProductionPackage.productPlacement.assetStatus === 'PRODUCT_REFERENCE_AVAILABLE';
 *   debe ser null si assetStatus === 'PRODUCT_REFERENCE_REQUIRED' (nunca se
 *   inventa una referencia que el propio VisualProductionPackage declaró
 *   ausente).
 */
export function createImageGenerationRequest({
  visualProductionPackage,
  providerName,
  model,
  productReferenceAsset = null,
}) {
  assertValidVisualProductionPackage(visualProductionPackage);
  assertNonEmptyString(providerName, 'providerName');
  assertNonEmptyString(model, 'model');

  const assetStatus = visualProductionPackage.productPlacement.assetStatus;
  if (assetStatus === 'PRODUCT_REFERENCE_AVAILABLE') {
    if (!productReferenceAsset) {
      throw new Error('createImageGenerationRequest: el VisualProductionPackage declara productPlacement.assetStatus="PRODUCT_REFERENCE_AVAILABLE" pero no se proveyó "productReferenceAsset" real.');
    }
    assertValidProductReferenceAsset(productReferenceAsset);
  } else if (productReferenceAsset !== null) {
    throw new Error('createImageGenerationRequest: el VisualProductionPackage declara productPlacement.assetStatus="PRODUCT_REFERENCE_REQUIRED" (sin referencia real disponible) -- "productReferenceAsset" debe ser null, nunca inventado.');
  }

  const aspectRatio = visualProductionPackage.aspectRatios[0];
  const productReference = productReferenceAsset
    ? Object.freeze({ assetId: productReferenceAsset.assetId, sourcePath: productReferenceAsset.sourcePath, role: productReferenceAsset.role })
    : null;

  const generationFingerprint = computeGenerationFingerprint({
    generationPrompt: visualProductionPackage.generationPrompt,
    negativePrompt: visualProductionPackage.negativePrompt,
    aspectRatio,
    providerName,
    model,
    productReference,
  });

  return Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: visualProductionPackage.visualProductionPackageId,
    providerName,
    model,
    generationPrompt: visualProductionPackage.generationPrompt,
    negativePrompt: visualProductionPackage.negativePrompt,
    sceneDescription: visualProductionPackage.sceneDescription,
    subjectDescription: visualProductionPackage.subjectDescription,
    productPlacementDescription: visualProductionPackage.productPlacement.description,
    cameraDirection: visualProductionPackage.cameraDirection,
    lightingDirection: visualProductionPackage.lightingDirection,
    screenText: Object.freeze([...visualProductionPackage.screenText]),
    aspectRatio,
    assetType: visualProductionPackage.assetType,
    productReference,
    generationFingerprint,
    createdAt: new Date().toISOString(),
  });
}
