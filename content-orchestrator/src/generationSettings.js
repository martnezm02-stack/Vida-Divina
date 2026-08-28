// generationSettings.js — Generation Settings (Creative Structure +
// Generation Settings, Paso 6 del encargo): capa real de configuración de
// generación (MODELO + CALIDAD) por encima de imageModelCatalog.js/
// creativeDirector.js -- NUNCA un sistema paralelo, solo une lo que ya
// existe en UN objeto real por escena/pieza (Paso 10: modelo y calidad son
// DOS ejes reales distintos, nunca se mezclan).
//
// CALIDAD REAL (Paso 9/16 del encargo): ningún provider real de hoy
// (kreaMcpImageProvider.js pide resolution:'1K' fijo, openAIImageProvider.js
// pide quality:'low' fijo) expone un parámetro de calidad ajustable por
// llamada -- así que la "calidad" real de cada modelo es la MISMA señal ya
// real que costTier/speedTier (imageModelCatalog.js), solo reetiquetada con
// el vocabulario conceptual del encargo (FAST/STANDARD/HIGH/PREMIUM).
// Nunca se inventa una capacidad de calidad ajustable que el provider real
// no tiene, ni un precio real (costStatus siempre 'UNKNOWN' aquí, mismo
// criterio ya validado en image-generation/test/kreaMcpImageProvider).

import { getImageModel, buildModelSelection } from './imageModelCatalog.js';

export const QUALITY_TIERS = Object.freeze(['FAST', 'STANDARD', 'HIGH', 'PREMIUM']);
export const QUALITY_TIER_LABELS = Object.freeze({
  FAST: 'Rápida', STANDARD: 'Estándar', HIGH: 'Alta', PREMIUM: 'Premium',
});
// Texto real exacto pedido por el encargo (Paso 9).
export const QUALITY_TIER_DESCRIPTIONS = Object.freeze({
  FAST: 'Rápida · menor consumo',
  STANDARD: 'Equilibrio entre calidad y consumo',
  HIGH: 'Mayor detalle · mayor consumo',
  PREMIUM: 'Máxima calidad disponible · mayor consumo',
});
const QUALITY_TIER_BY_COST_TIER = Object.freeze({
  LOW: 'FAST', BALANCED: 'STANDARD', HIGH: 'HIGH', PREMIUM: 'PREMIUM',
});

/** La calidad real que YA ofrece un modelo real (derivada de su costTier real, nunca inventada). */
export function qualityTierForModel(modelId) {
  const entry = getImageModel(modelId);
  return QUALITY_TIER_BY_COST_TIER[entry.costTier];
}

/** Niveles reales que un modelo real soporta -- hoy siempre UNO (Paso 9: "no asumir que todos los modelos soportan todos los niveles"; ningún provider real de este catálogo expone más de un nivel real por modelo). */
export function availableQualityTiersForModel(modelId) {
  return Object.freeze([qualityTierForModel(modelId)]);
}

/** Recomienda la calidad real del modelo YA recomendado/elegido (nunca decide un modelo distinto -- ver imageModelCatalog.js#recommendImageModel). */
export function recommendGenerationQuality({ modelId }) {
  if (!modelId) {
    return Object.freeze({ recommendedQuality: null, recommendationReason: 'Sin modelo real disponible, no hay calidad real que sugerir.' });
  }
  const tier = qualityTierForModel(modelId);
  const model = getImageModel(modelId);
  return Object.freeze({
    recommendedQuality: tier,
    recommendationReason: `"${model.displayName}" genera en calidad ${QUALITY_TIER_LABELS[tier]} (${QUALITY_TIER_DESCRIPTIONS[tier]}).`,
  });
}

/**
 * Selección real de calidad -- mismo criterio real que
 * imageModelCatalog.js#buildModelSelection: sin cambio real del usuario,
 * selectionMode 'automatic'; con una calidad real distinta Y compatible con
 * el modelo final, 'user_selected'. Si la calidad seleccionada YA NO es
 * compatible con el modelo final (Paso 13 del encargo -- ej. el usuario
 * cambió de modelo después), cae automáticamente a la mejor calidad real
 * compatible y lo informa -- nunca lanza, nunca deja una calidad
 * incompatible activa.
 */
export function buildQualitySelection({ finalModelId, recommendedQuality, recommendationReason, selectedQuality = null }) {
  const disponibles = finalModelId ? availableQualityTiersForModel(finalModelId) : Object.freeze([]);
  if (!selectedQuality || selectedQuality === recommendedQuality) {
    return Object.freeze({
      recommendedQuality, recommendationReason,
      selectedQuality: recommendedQuality, selectionMode: 'automatic', availableQualities: disponibles,
      compatibilityFallback: null,
    });
  }
  if (!disponibles.includes(selectedQuality)) {
    const fallback = disponibles[0] ?? recommendedQuality;
    return Object.freeze({
      recommendedQuality, recommendationReason,
      selectedQuality: fallback, selectionMode: 'automatic', availableQualities: disponibles,
      compatibilityFallback: `"${QUALITY_TIER_LABELS[selectedQuality] ?? selectedQuality}" no es compatible con este modelo -- se usa "${QUALITY_TIER_LABELS[fallback] ?? fallback}" en su lugar.`,
    });
  }
  return Object.freeze({
    recommendedQuality, recommendationReason,
    selectedQuality, selectionMode: 'user_selected', availableQualities: disponibles,
    compatibilityFallback: null,
  });
}

/**
 * Punto de entrada único de Generation Settings (Paso 6 del encargo):
 * combina imageModelCatalog.js#buildModelSelection (MODELO, ya real, sin
 * tocar) con buildQualitySelection (CALIDAD, arriba) en UN objeto real --
 * "no crear otro sistema paralelo". mediaType es informativo (Paso 7):
 * 'IMAGE' es el único mediaType real con catálogo de modelos hoy -- 'VIDEO'
 * se devuelve sin modelo/calidad real (Paso 24: "no mostrar modelos de
 * imagen como si pudieran generar video" -- no existe hoy un catálogo real
 * de modelos de video seleccionable).
 *
 * @param {{mediaType?:string, recommendedModel:?object, recommendationReason:string, selectedModelId?:?string, productAssetAvailable?:boolean, aspectRatio?:?string, selectedQuality?:?string}} args
 */
export function buildGenerationSettings({
  mediaType = 'IMAGE', recommendedModel = null, recommendationReason = '', selectedModelId = null,
  productAssetAvailable = false, aspectRatio = null, selectedQuality = null,
}) {
  if (mediaType !== 'IMAGE') {
    return Object.freeze({
      mediaType, recommendedProvider: null, recommendedModel: null, recommendedQuality: null,
      selectedProvider: null, selectedModel: null, selectedQuality: null,
      selectionMode: 'automatic', modelSelectionMode: 'automatic', qualitySelectionMode: 'automatic',
      recommendationReason: 'Sin catálogo real de modelos de video seleccionable todavía -- usa el pipeline de video existente tal cual.',
      qualityRecommendationReason: null, compatibilityFallback: null, availableQualities: Object.freeze([]),
      finalModelId: null, estimatedCost: 0, actualCost: 0, costStatus: 'UNKNOWN',
    });
  }

  const modelSelection = buildModelSelection({
    recommendedModel, recommendationReason, selectedModelId, productAssetAvailable, aspectRatio,
  });
  const qualityRec = recommendGenerationQuality({ modelId: modelSelection.finalModelId });
  const qualitySelection = buildQualitySelection({
    finalModelId: modelSelection.finalModelId,
    recommendedQuality: qualityRec.recommendedQuality,
    recommendationReason: qualityRec.recommendationReason,
    selectedQuality,
  });

  return Object.freeze({
    mediaType,
    recommendedProvider: modelSelection.recommendedProvider,
    recommendedModel: modelSelection.recommendedModel,
    recommendedQuality: qualitySelection.recommendedQuality,
    selectedProvider: modelSelection.selectedProvider,
    selectedModel: modelSelection.selectedModel,
    selectedQuality: qualitySelection.selectedQuality,
    // selectionMode combinado (Paso 14): 'automatic' SOLO si ni modelo ni
    // calidad fueron cambiados por el usuario; separado también en
    // modelSelectionMode/qualitySelectionMode (Paso 14, "cuando sea útil").
    selectionMode: (modelSelection.selectionMode === 'user_selected' || qualitySelection.selectionMode === 'user_selected') ? 'user_selected' : 'automatic',
    modelSelectionMode: modelSelection.selectionMode,
    qualitySelectionMode: qualitySelection.selectionMode,
    recommendationReason: modelSelection.recommendationReason,
    qualityRecommendationReason: qualitySelection.recommendationReason,
    compatibilityFallback: qualitySelection.compatibilityFallback,
    availableQualities: qualitySelection.availableQualities,
    finalModelId: modelSelection.finalModelId,
    // Costo real (Paso 16): Krea MCP no expone precio por llamada -- nunca
    // se inventa, siempre UNKNOWN salvo evidencia real de costo.
    estimatedCost: 0, actualCost: 0, costStatus: 'UNKNOWN',
  });
}

/** Forma real y mínima para la UI de "Cambiar modelo" (Paso 12): catálogo completo etiquetado con nombre + comentario corto, nunca el id técnico como texto principal -- reexporta IMAGE_MODEL_CATALOG en forma de UI para que el Dashboard no tenga que importar el catálogo interno directamente. */
export function listModelChoicesForUi(availableModels) {
  return availableModels.map((m) => Object.freeze({
    id: m.id, displayName: m.displayName, shortComment: m.shortComment, supportsProductReference: m.supportsProductReference,
  }));
}
