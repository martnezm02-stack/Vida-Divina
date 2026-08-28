// visualGenerationRequest.js — Creative Director (2026-08-27). Estructura
// determinista real que registra, POR ESCENA, qué se pidió generar
// visualmente y qué ocurrió realmente -- Paso 15/22 del encargo Creative
// Director. NO es un segundo sistema de lineage: los assets REALES
// derivados (archivos ya escritos a disco por un provider real) se siguen
// registrando exclusivamente en assetLineage.js (recordLineage()), este
// archivo solo transporta la especificación + el resultado real de
// asetResolver.js/providerRouter.js para que Production Orchestrator /
// Editable Video Project puedan mostrar/editar/reemplazar/regenerar sin
// tener que re-derivar esa información de scenePlan/assetPlan por separado.
//
// REGLA DE NO SIMULACIÓN (Paso 25 del encargo): "provider"/"cost" en el
// registro FINAL (resolveVisualGenerationRequest) reflejan EXACTAMENTE lo
// que assetResolver.js reportó que ocurrió -- nunca se etiqueta un asset
// típográfico/existente como "generado por IA", nunca se inventa un costo
// real que no vino de un ImageGenerationResult real.

import { randomUUID, createHash } from 'node:crypto';

export const VISUAL_GENERATION_REQUEST_STATUSES = Object.freeze([
  'PENDING', 'RESOLVED_EXISTING_ASSET', 'RESOLVED_GENERATED', 'RESOLVED_TYPOGRAPHIC', 'RESOLVED_ERROR',
]);

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim?.()) throw new Error(`visualGenerationRequest: "${fieldName}" es obligatorio.`);
}

/**
 * Construye el request PENDIENTE real -- antes de que Asset Resolver
 * intente resolverlo. Nunca decide el provider real (eso es
 * Provider Router, ver providerRouter.js/creativeProductionOrchestrator.js)
 * -- "provider" aquí queda null hasta la resolución real.
 *
 * @param {{campaignId?:?string, batchId?:?string, creativeId?:?string, sceneId:string, visualTreatment:string, promptSpec:object}} args
 */
export function buildVisualGenerationRequest({
  campaignId = null, batchId = null, creativeId = null, sceneId, visualTreatment, promptSpec,
}) {
  assertNonEmptyString(sceneId, 'sceneId');
  assertNonEmptyString(visualTreatment, 'visualTreatment');
  if (!promptSpec || typeof promptSpec !== 'object' || !promptSpec.subject?.trim?.()) {
    throw new Error('visualGenerationRequest: "promptSpec" debe ser un objeto real con al menos "subject" (nunca se genera sin una especificación real).');
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ sceneId, visualTreatment, promptSpec }), 'utf8')
    .digest('hex');

  return Object.freeze({
    requestId: randomUUID(),
    campaignId, batchId, creativeId, sceneId,
    visualTreatment,
    promptSpec: Object.freeze({ ...promptSpec }),
    // promptMode (Corrección "Crear contenido", Paso 15/16 del encargo):
    // "system_generated" por defecto -- si el usuario edita el prompt
    // ANTES de producir (UI todavía no lo permite en esta fase, ver
    // reporte final), el llamador real pasaría "user_edited" aquí; nunca
    // sobrescrito en silencio.
    promptMode: 'system_generated',
    provider: null,
    status: 'PENDING',
    assetId: null,
    generatedPrompt: null,
    cost: Object.freeze({ estimated: null, actual: null, currency: 'USD', status: null }),
    lineage: Object.freeze({ sourceType: null, sourceAssetId: null, sourcePath: null }),
    fingerprint,
    createdAt: new Date().toISOString(),
  });
}

const STATUS_BY_ASSET_SOURCE = Object.freeze({
  EXISTING_PRODUCT_ASSET: 'RESOLVED_EXISTING_ASSET',
  GENERATED_IMAGE: 'RESOLVED_GENERATED',
  GENERATED_VIDEO: 'RESOLVED_GENERATED',
  STOCK_FOOTAGE: 'RESOLVED_GENERATED',
  TYPOGRAPHIC: 'RESOLVED_TYPOGRAPHIC',
});

/**
 * Aplica la resolución REAL de assetResolver.js (una entrada de
 * resolveAssetPlan()) sobre un request PENDIENTE real -- nunca inventa un
 * campo que resolveSceneAsset() no reportó. Devuelve un registro nuevo
 * (inmutable), nunca muta el request original.
 *
 * @param {object} request — un VisualGenerationRequest real de buildVisualGenerationRequest().
 * @param {{source:string, imageSourcePath:?string, providerUsed:?string, isMock:boolean, cost?:?{estimatedCost:number, actualCost:number, currency:string}}} resolution — una entrada real de resolveAssetPlan()/resolveSceneAsset().
 */
export function resolveVisualGenerationRequest(request, resolution) {
  if (!request?.requestId) throw new Error('resolveVisualGenerationRequest: "request" debe ser un VisualGenerationRequest real (buildVisualGenerationRequest()).');
  if (!resolution?.source) throw new Error('resolveVisualGenerationRequest: "resolution" debe ser una resolución real de assetResolver.js (con "source").');

  const status = STATUS_BY_ASSET_SOURCE[resolution.source] ?? 'RESOLVED_ERROR';
  const assetId = resolution.imageSourcePath
    ? createHash('sha256').update(resolution.imageSourcePath, 'utf8').digest('hex').slice(0, 16)
    : null;

  return Object.freeze({
    ...request,
    provider: resolution.providerUsed ?? (resolution.source === 'EXISTING_PRODUCT_ASSET' ? 'existing_asset' : resolution.source === 'TYPOGRAPHIC' ? 'local_typographic' : null),
    status,
    assetId,
    // Prompt Auditable (Paso 13/14 del encargo): EXACTAMENTE lo que
    // assetResolver.js reportó que se envió al provider real -- null real
    // cuando no hubo generación real (asset existente/tipográfico).
    generatedPrompt: resolution.generatedPrompt ?? null,
    cost: Object.freeze({
      estimated: resolution.cost?.estimatedCost ?? 0,
      actual: resolution.cost?.actualCost ?? 0,
      currency: resolution.cost?.currency ?? 'USD',
      // Krea Image Provider (Paso 12 del encargo Krea): "UNKNOWN" cuando el
      // provider real no expone precio por llamada -- nunca se disfraza de
      // costo conocido/cero real.
      status: resolution.cost?.costStatus ?? 'KNOWN',
    }),
    lineage: Object.freeze({
      sourceType: resolution.source,
      sourceAssetId: resolution.isMock ? null : assetId,
      sourcePath: resolution.imageSourcePath ?? null,
    }),
    resolvedAt: new Date().toISOString(),
  });
}
