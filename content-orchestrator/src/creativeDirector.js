// creativeDirector.js — Creative Director / Visual Director (2026-08-27).
// Capa nueva entre Scene Planner y Asset Resolver/Provider Router (ver
// diagrama del encargo): transforma una creatividad estratégica YA
// construida (creativeVariant + campaignIntent + Scene Plan real de
// scenePlanner.js) en una Visual Strategy real -- CÓMO se representa
// visualmente esa idea, nunca QUÉ se dice (eso ya lo decidió
// campaignIntent.js/hypothesisCreativeEngine.js) ni QUÉ producto físico se
// muestra (eso lo decide productRawAssets real, nunca se inventa aquí).
//
// SEPARACIÓN ESTRICTA (Paso "regla central" del encargo):
//   CampaignIntent      -- QUÉ queremos comunicar (campaignIntent.js).
//   Creative Strategy    -- CON QUÉ ángulo/hook/estructura (hypothesisCreativeEngine.js).
//   Creative Director    -- CÓMO representarlo visualmente (ESTE archivo).
//   Product Knowledge    -- QUÉ producto/claims (productFactsLoader.js).
//   Product Visual Asset -- QUÉ producto FÍSICO real mostrar (productRawAssets, nunca inventado).
//   Provider Router       -- CON QUÉ tecnología producirlo (providerRouter.js).
//
// PRODUCT GROUNDING (Pasos 5-10 del encargo, regla no negociable):
//   - nombreVisible es SOLO para texto/voz/overlay -- nunca decide qué
//     fotografía usar.
//   - La representación visual del producto SIEMPRE viene de un asset real
//     ya registrado (productRawAssets, ver productCatalog.js/
//     assetRegistry.js) -- si no existe, la escena se marca
//     "productAssetRequired:true" y se PRODUCE SIN el producto físico
//     (nunca se fabrica un empaque nuevo con IA, Paso 6/10).
//   - Este archivo NUNCA reclasifica ni toca scene.visualType/
//     assetRequirements que scenePlanner.js ya decidió (ese es el único
//     lugar real que sabe si hay una fotografía real disponible) -- solo
//     AÑADE campos de dirección visual sobre la MISMA escena real.

import { VISUAL_TREATMENTS, assignVisualTreatment } from './visualTreatments.js';
import { buildVisualGenerationRequest } from './visualGenerationRequest.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';
import { DEFAULT_NEGATIVE_PROMPT } from './assetResolver.js';
import { recommendImageModel, buildModelSelection, listAvailableImageModels } from './imageModelCatalog.js';

const ASPECT_RATIO_BY_FORMAT = Object.freeze({ 'Static comparison frames': '4:5' });
const DEFAULT_ASPECT_RATIO = '9:16';

function limpiar(texto) {
  return String(texto ?? '').trim();
}

function aspectRatioForFormat(format) {
  return ASPECT_RATIO_BY_FORMAT[format] ?? DEFAULT_ASPECT_RATIO;
}

/**
 * Enriquece UNA escena real del Scene Plan con dirección visual real del
 * treatment elegido -- nunca reemplaza sectionType/visualType/duration/
 * startSeconds/narration/textOverlay/assetRequirements ya decididos por
 * scenePlanner.js, solo AÑADE campos nuevos (spread de "...scene" primero).
 */
function directScene({
  scene, treatment, campaignIntent, nombreVisible, productAssetAvailable, aspectRatio,
}) {
  const audience = campaignIntent?.targetAudience ?? 'la audiencia real de esta campaña';
  const territory = campaignIntent?.campaignTerritory ?? scene.narration;
  const described = treatment.describe({ audience, territory, nombreVisible });

  const wantsProduct = scene.visualIntent === 'PRODUCT_REVEAL';
  const hasRealProductAsset = wantsProduct && productAssetAvailable;
  const productAssetRequired = wantsProduct && !hasRealProductAsset;

  const productPlacement = hasRealProductAsset
    ? `${nombreVisible ?? 'el producto'} real, empaque sin alterar, en primer plano -- fotografía real ya registrada (nunca recompuesta ni regenerada, Paso 6/9 del encargo).`
    : wantsProduct
      ? 'PRODUCT_VISUAL_ASSET_REQUIRED -- no existe todavía una fotografía real registrada de este producto; la escena se produce sin mostrar el producto físico (Paso 10 del encargo, nunca se inventa un empaque).'
      : 'Sin producto en esta escena -- el producto no debe dominar toda la creatividad (Paso 17/18/27 del encargo).';

  // visualSource: intención real del Creative Director (namespace propio,
  // distinto de ASSET_SOURCES de assetResolver.js -- ese es el resultado
  // REAL ya resuelto; este es lo que el Creative Director recomienda antes
  // de esa resolución).
  const visualSource = hasRealProductAsset ? 'EXISTING_PRODUCT_ASSET' : 'GENERATION_REQUIRED';

  // El prompt real que consumirá assetResolver.js (via scene.visualPrompt,
  // MISMO campo real ya usado hoy -- nunca se duplica ese contrato). Con
  // asset real ya disponible, el prompt original de scenePlanner.js queda
  // intacto (assetResolver ni siquiera lo usará: usa la fotografía real
  // directamente).
  const visualPrompt = hasRealProductAsset
    ? scene.visualPrompt
    : [described.subject, described.environment, described.moodDirection, `Momento real de la escena: ${scene.narration}`]
      .filter((f) => limpiar(f).length > 0)
      .join('. ');

  const combinedText = [described.subject, described.environment, described.moodDirection, productPlacement].join(' ');
  assertBrandAvoidCompliance(combinedText, `creativeDirector: escena "${scene.sceneId}" (treatment "${treatment.label}")`);

  return Object.freeze({
    ...scene,
    visualTreatment: treatment.id,
    visualTreatmentLabel: treatment.label,
    visualSource,
    productAssetRequired,
    subject: described.subject,
    environment: described.environment,
    cameraDirection: described.cameraDirection,
    lightingDirection: described.lightingDirection,
    moodDirection: described.moodDirection,
    motionDirection: described.motionDirection,
    productPlacement,
    textOverlayIntent: described.textOverlayIntent,
    visualPrompt,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio,
  });
}

/**
 * Punto de entrada único del Creative Director (Paso 1 del encargo).
 *
 * @param {{
 *   creativeVariant: object, campaignIntent?: ?object, productFacts?: ?object,
 *   productRawAssets?: object[], scenePlan: object, platform?: ?string,
 *   format?: ?string, variantIndex?: number, campaignId?: ?string, batchId?: ?string, creativeId?: ?string,
 * }} args
 * @returns {object} VisualStrategy real.
 */
export function buildVisualStrategy({
  creativeVariant, campaignIntent = null, productFacts = null, productRawAssets = [],
  scenePlan, platform = null, format = null, variantIndex = 0, campaignId = null, batchId = null, creativeId = null,
  // Modelo Sugerido + Selección Manual (2026-08-27): "undefined" real
  // (nunca pasado) = el usuario todavía no decidió, se usa la recomendación
  // real tal cual (selectionMode "automatic"); un id real de
  // imageModelCatalog.js SOBRESCRIBE la recomendación para ESTA generación
  // (selectionMode "user_selected") -- regla central del encargo: "el
  // sistema recomienda, el usuario decide".
  selectedModelId = null,
}) {
  if (!scenePlan?.scenes?.length) {
    throw new Error('buildVisualStrategy: "scenePlan" debe ser un Scene Plan real ya construido (scenePlanner.js#buildScenePlan) -- el Creative Director nunca inventa escenas.');
  }

  const treatment = assignVisualTreatment({ variantIndex, campaignIntent, campaignId });
  const productAsset = productRawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? productRawAssets[0] ?? null;
  const nombreVisible = productFacts?.nombreVisible ?? productFacts?.nombreComercial ?? null;
  const aspectRatio = aspectRatioForFormat(format ?? creativeVariant?.creativeVariant?.format ?? null);

  const scenes = scenePlan.scenes.map((scene) => directScene({
    scene,
    treatment,
    campaignIntent,
    nombreVisible,
    productAssetAvailable: Boolean(productAsset),
    aspectRatio,
  }));

  const imageGenerationRequests = Object.freeze(
    scenes
      .filter((s) => s.visualSource === 'GENERATION_REQUIRED')
      .map((s) => buildVisualGenerationRequest({
        campaignId,
        batchId,
        creativeId,
        sceneId: s.sceneId,
        visualTreatment: s.visualTreatment,
        promptSpec: Object.freeze({
          subject: s.subject,
          environment: s.environment,
          cameraDirection: s.cameraDirection,
          lightingDirection: s.lightingDirection,
          moodDirection: s.moodDirection,
          motionDirection: s.motionDirection,
          textOverlayIntent: s.textOverlayIntent,
          aspectRatio: s.aspectRatio,
          negativePrompt: s.negativePrompt,
          generationPrompt: s.visualPrompt,
        }),
      })),
  );

  // videoGenerationRequests: preparado estructuralmente (Paso 1 del
  // encargo pide el campo) -- esta fase no genera video por escena
  // individual (produceCreative() sigue componiendo el video final vía
  // HyperFrames/ffmpeg, ver creativeProductionOrchestrator.js); queda
  // vacío real, nunca simulado, hasta que exista un caso de uso real de
  // video POR ESCENA independiente del master compuesto.
  const videoGenerationRequests = Object.freeze([]);

  // Modelo Sugerido + Selección Manual (2026-08-27): recomendación real
  // (Creative Director + Provider Router, ver imageModelCatalog.js) +
  // selección real del usuario si la proveyó -- nunca decide por sí solo
  // sin dejar la puerta real abierta a que el usuario la sobrescriba.
  const modelRecommendation = recommendImageModel({
    productAssetAvailable: Boolean(productAsset),
    visualTreatmentId: treatment.id,
    hasGenerationRequiredScenes: imageGenerationRequests.length > 0,
    aspectRatio,
  });
  const modelSelection = buildModelSelection({
    ...modelRecommendation, selectedModelId, productAssetAvailable: Boolean(productAsset), aspectRatio,
  });

  const overview = treatment.describe({
    audience: campaignIntent?.targetAudience ?? 'la audiencia real de esta campaña',
    territory: campaignIntent?.campaignTerritory ?? creativeVariant?.creativeVariant?.angleText ?? 'esta campaña',
    nombreVisible,
  });

  const productScenes = scenes.filter((s) => s.visualIntent === 'PRODUCT_REVEAL');
  const productVisualSource = productScenes.length === 0
    ? 'NOT_APPLICABLE'
    : productScenes.every((s) => s.visualSource === 'EXISTING_PRODUCT_ASSET')
      ? 'EXISTING_PRODUCT_ASSET'
      : productScenes.some((s) => s.visualSource === 'EXISTING_PRODUCT_ASSET')
        ? 'PARTIAL_PRODUCT_VISUAL_ASSET_REQUIRED'
        : 'PRODUCT_VISUAL_ASSET_REQUIRED';

  return Object.freeze({
    concept: `${creativeVariant?.conceptId ?? creativeVariant?.angleId ?? 'concepto'} — ${treatment.label}`,
    visualTreatment: treatment.id,
    visualTreatmentLabel: treatment.label,
    style: treatment.label,
    subject: overview.subject,
    environment: overview.environment,
    camera: overview.cameraDirection,
    lighting: overview.lightingDirection,
    composition: Object.freeze(scenes.map((s) => Object.freeze({
      sceneId: s.sceneId, visualIntent: s.visualIntent, visualTreatment: s.visualTreatment, visualSource: s.visualSource,
    }))),
    productPlacement: productScenes[0]?.productPlacement ?? 'Sin escenas de producto en este guion real.',
    textOverlayIntent: overview.textOverlayIntent,
    visualSource: productVisualSource,
    assetRequirements: Object.freeze({
      productAssetAvailable: Boolean(productAsset),
      productAssetId: productAsset?.assetId ?? null,
      productScenesRequiringAsset: productScenes.filter((s) => s.productAssetRequired).length,
    }),
    sceneVisuals: scenes,
    imageGenerationRequests,
    videoGenerationRequests,
    // Lineage real de recomendación vs selección (regla de lineage del
    // encargo Modelo Sugerido) -- permite medir después recomendación
    // automática vs selección manual, nunca solo el resultado final.
    recommendedProvider: modelSelection.recommendedProvider,
    recommendedModel: modelSelection.recommendedModel,
    recommendationReason: modelSelection.recommendationReason,
    selectedProvider: modelSelection.selectedProvider,
    selectedModel: modelSelection.selectedModel,
    selectionMode: modelSelection.selectionMode,
    // finalModelId: SIEMPRE igual a selectedModel (mismo valor, ver
    // imageModelCatalog.js#buildModelSelection) -- expuesto aparte porque
    // es el campo real que consume creativeProductionOrchestrator.js para
    // construir el provider real de esta generación, sin que el llamador
    // tenga que re-derivar la misma regla de "selectedModel gana".
    finalModelId: modelSelection.finalModelId,
  });
}

/**
 * Vista previa real (Modelo Sugerido + Selección Manual, 2026-08-27) --
 * para que el Dashboard muestre "Modelo sugerido" + "Cambiar modelo" ANTES
 * de producir (antes de generar el voiceover real, que es costoso). Usa
 * SOLO señales reales ya disponibles sin un Scene Plan completo
 * (treatment real + disponibilidad real de asset de producto) -- nunca
 * inventa un Scene Plan falso solo para esta vista previa.
 * "hasGenerationRequiredScenes" se asume real true (toda campaña real con
 * al menos una sección no-producto genera al menos una escena real que
 * requiere generación, ver scenePlanner.js) -- una simplificación real y
 * documentada, nunca un cálculo inventado.
 *
 * @param {{campaignIntent?:?object, productFacts?:?object, productRawAssets?:object[], variantIndex?:number, campaignId?:?string, format?:?string}} args
 */
export function previewVisualRecommendation({
  campaignIntent = null, productFacts = null, productRawAssets = [], variantIndex = 0, campaignId = null, format = null,
}) {
  const treatment = assignVisualTreatment({ variantIndex, campaignIntent, campaignId });
  const productAsset = productRawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? productRawAssets[0] ?? null;
  const aspectRatio = aspectRatioForFormat(format);
  const { recommendedModel, recommendationReason } = recommendImageModel({
    productAssetAvailable: Boolean(productAsset), visualTreatmentId: treatment.id, hasGenerationRequiredScenes: true, aspectRatio,
  });
  return Object.freeze({
    visualTreatment: treatment.id,
    visualTreatmentLabel: treatment.label,
    recommendedModel,
    recommendationReason,
    availableModels: listAvailableImageModels({ productReferenceAvailable: Boolean(productAsset), aspectRatio }),
  });
}
