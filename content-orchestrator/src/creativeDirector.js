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
import { buildGenerationSettings } from './generationSettings.js';
import { buildVisualContinuityContext, resolveContinuityAudience, resolveContinuityTerritory, computeInstructionCoverage } from './visualContinuityContext.js';
import { buildVisualSceneBriefs } from './visualSceneBrief.js';
import { ANGLE_LABELS } from './creativeAngleSelector.js';

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
  scene, treatment, nombreVisible, productAssetAvailable, aspectRatio, audience, territory,
  // Visual Scene Brief (Corrección "Diversidad Visual", 2026-08-28, Paso
  // 1/3 del encargo): "sceneBrief" real (buildVisualSceneBriefs()) SOLO
  // existe cuando hay visualContinuityContext.characterContinuityRequired
  // real -- sin él, esta función se comporta EXACTAMENTE igual que antes
  // (compatibilidad hacia atrás exacta, Paso 31: ningún llamador sin
  // userInstruction ve un cambio).
  sceneBrief = null, visualContinuityContext = null,
  // Creative Angle / Hook Intelligence (Corrección "Evolución integral del
  // Creative Director", 2026-08-28, Paso 18/26 del encargo): reales,
  // opcionales -- ausentes = comportamiento EXACTO de antes (Paso 31,
  // compatibilidad hacia atrás). primaryAngleLabel/hookText vienen del
  // MISMO creativeVariant.angleId/copy.hook ya elegidos por
  // hypothesisCreativeEngine.js/creativeAngleSelector.js -- nunca
  // inventados aquí.
  primaryAngleLabel = null, hookText = null,
}) {
  const described = treatment.describe({ audience, territory, nombreVisible });

  const wantsProduct = scene.visualIntent === 'PRODUCT_REVEAL';
  const hasRealProductAsset = wantsProduct && productAssetAvailable;
  const productAssetRequired = wantsProduct && !hasRealProductAsset;

  const productPlacement = hasRealProductAsset
    ? `${nombreVisible ?? 'el producto'} real, empaque sin alterar, en primer plano -- fotografía real ya registrada (nunca recompuesta ni regenerada, Paso 6/9 del encargo).${sceneBrief ? ` ${sceneBrief.action}.` : ''}`
    : wantsProduct
      ? 'PRODUCT_VISUAL_ASSET_REQUIRED -- no existe todavía una fotografía real registrada de este producto; la escena se produce sin mostrar el producto físico (Paso 10 del encargo, nunca se inventa un empaque).'
      : 'Sin producto en esta escena -- el producto no debe dominar toda la creatividad (Paso 17/18/27 del encargo).';

  // visualSource: intención real del Creative Director (namespace propio,
  // distinto de ASSET_SOURCES de assetResolver.js -- ese es el resultado
  // REAL ya resuelto; este es lo que el Creative Director recomienda antes
  // de esa resolución).
  const visualSource = hasRealProductAsset ? 'EXISTING_PRODUCT_ASSET' : 'GENERATION_REQUIRED';

  // subject/environment/cameraDirection (Corrección "Diversidad Visual"):
  // CON continuidad real, "subject"/"environment" usan la identidad GLOBAL
  // fija (visualContinuityContext -- NUNCA varía entre escenas, Paso 5) y
  // "cameraDirection" usa el encuadre/ángulo/composición ESPECÍFICO de
  // ESTA escena (sceneBrief -- Paso 3/8, root cause real del bug "escena 1
  // y 2 casi idénticas": antes, described.subject/cameraDirection eran el
  // MISMO string real para TODA la pieza). SIN continuidad real
  // (backward compatibility, Paso 31), se preserva described.* tal cual.
  const subject = sceneBrief && visualContinuityContext
    ? [visualContinuityContext.subjectDescription, visualContinuityContext.wardrobe].filter((f) => limpiar(f).length > 0).join(', ') || described.subject
    : described.subject;
  const environment = sceneBrief && visualContinuityContext
    ? (visualContinuityContext.environment ?? described.environment)
    : described.environment;
  const cameraDirection = sceneBrief
    ? `${sceneBrief.shotType}, ángulo ${sceneBrief.cameraAngle} -- ${sceneBrief.composition}.`
    : described.cameraDirection;

  // El prompt real que consumirá assetResolver.js (via scene.visualPrompt,
  // MISMO campo real ya usado hoy -- nunca se duplica ese contrato). Con
  // asset real ya disponible, el prompt original de scenePlanner.js queda
  // intacto (assetResolver ni siquiera lo usará: usa la fotografía real
  // directamente).
  // hookVisualIntent (Paso 11 del encargo): SOLO en la escena real cuya
  // función narrativa es HOOK -- traducción visual real del hook real ya
  // elegido (nunca "persona genérica mirando a cámara").
  const isHookScene = sceneBrief?.narrativePurpose === 'HOOK';
  const hookVisualIntent = isHookScene
    ? [subject, environment, sceneBrief?.action, hookText ? `Hook real: "${hookText}"` : null]
      .filter((f) => limpiar(f).length > 0)
      .join('. ')
    : null;

  const visualPrompt = hasRealProductAsset
    ? scene.visualPrompt
    : sceneBrief
      // GLOBAL (subject+environment, fijo para toda la pieza) + CREATIVE
      // ANGLE + NARRATIVE CONTEXT + SCENE (acción/composición/interacción,
      // real y distinta por escena, Paso 6/26 del encargo previo: "NO usar
      // el mismo prompt base para varias escenas cambiando solamente una
      // palabra") + CAMERA + CONTINUITY + PRODUCT. Corrección "Corrección
      // integral del flujo de Crear contenido" (2026-08-28, Paso 13 del
      // encargo): antes el prompt real NUNCA incluía cameraDirection
      // (encuadre/ángulo real solo vivían en el campo separado
      // scene.cameraDirection, invisibles para el provider real) ni
      // sceneNarrativeContext/continuity -- root cause real adicional del
      // Problema 2 ("reducido a subject + estilo genérico").
      ? [
        subject, environment,
        primaryAngleLabel ? `Ángulo creativo: ${primaryAngleLabel}` : null,
        sceneBrief.sceneNarrativeContext ? `Contexto narrativo: ${sceneBrief.sceneNarrativeContext}` : null,
        isHookScene && hookText ? `Hook real: "${hookText}"` : null,
        sceneBrief.action, sceneBrief.composition, sceneBrief.interaction,
        sceneBrief.emotionalState ? `Estado emocional: ${sceneBrief.emotionalState}` : null,
        cameraDirection,
        described.moodDirection,
        wantsProduct ? productPlacement : null,
        `Momento real de la escena: ${scene.narration}`,
        // Continuity (Paso 13/30 del encargo): refuerzo real explícito
        // DENTRO del texto del prompt real (no solo en negativePrompt/
        // metadata separada) -- el provider real solo ve el texto real que
        // se le envía, nunca los campos estructurados aparte.
        visualContinuityContext?.subjectGender ? `Mismo personaje real en todas las escenas: ${visualContinuityContext.subjectGender === 'female' ? 'mujer' : 'hombre'}, nunca cambia de género/identidad.` : null,
      ]
        .filter((f) => limpiar(f).length > 0)
        .join('. ')
      : [described.subject, described.environment, described.moodDirection, `Momento real de la escena: ${scene.narration}`]
        .filter((f) => limpiar(f).length > 0)
        .join('. ');

  const combinedText = [subject, environment, described.moodDirection, productPlacement].join(' ');
  assertBrandAvoidCompliance(combinedText, `creativeDirector: escena "${scene.sceneId}" (treatment "${treatment.label}")`);

  return Object.freeze({
    ...scene,
    visualTreatment: treatment.id,
    visualTreatmentLabel: treatment.label,
    visualSource,
    productAssetRequired,
    subject,
    environment,
    cameraDirection,
    lightingDirection: described.lightingDirection,
    moodDirection: described.moodDirection,
    motionDirection: described.motionDirection,
    productPlacement,
    textOverlayIntent: described.textOverlayIntent,
    visualPrompt,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio,
    // Visual Scene Brief (Paso 1/7 del encargo) -- solo presente con
    // continuidad real (mismo criterio de arriba, Paso 31).
    ...(sceneBrief ? {
      action: sceneBrief.action,
      narrativePurpose: sceneBrief.narrativePurpose,
      shotType: sceneBrief.shotType,
      cameraAngle: sceneBrief.cameraAngle,
      composition: sceneBrief.composition,
      bodyPosition: sceneBrief.bodyPosition,
      interaction: sceneBrief.interaction,
      emotionalState: sceneBrief.emotionalState,
      // sceneNarrativeContext (Paso 10/11 del encargo): "qué parte de la
      // historia representa" esta escena real -- ya calculado real por
      // visualSceneBrief.js, nunca recalculado aquí.
      sceneNarrativeContext: sceneBrief.sceneNarrativeContext,
      props: sceneBrief.props,
      productPresence: wantsProduct,
      continuityConstraints: sceneBrief.continuityConstraints,
      ...(hookVisualIntent ? { hookVisualIntent } : {}),
    } : {}),
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
  // Generation Settings (Paso 6/14 del encargo Creative Structure +
  // Generation Settings): mismo criterio real que selectedModelId --
  // "undefined"/null = el usuario acepta la calidad recomendada
  // (qualitySelectionMode "automatic"); una calidad real de
  // generationSettings.js#QUALITY_TIERS sobrescribe la recomendación.
  selectedQuality = null,
  // Visual Continuity Context (Corrección "Crear contenido", Paso 8/9 del
  // encargo): texto libre real del usuario -- mismo campo real que ya
  // gobierna Creative Structure Engine (buildCreativeStructure), ahora
  // TAMBIÉN fija UN sujeto/entorno real para TODA la pieza (root cause
  // real del bug "una escena muestra hombre, otra mujer": antes,
  // audience/territory se recalculaban por escena con fallbacks que sí
  // variaban -- ver visualContinuityContext.js).
  userInstruction = null,
}) {
  if (!scenePlan?.scenes?.length) {
    throw new Error('buildVisualStrategy: "scenePlan" debe ser un Scene Plan real ya construido (scenePlanner.js#buildScenePlan) -- el Creative Director nunca inventa escenas.');
  }

  const treatment = assignVisualTreatment({ variantIndex, campaignIntent, campaignId });
  const productAsset = productRawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? productRawAssets[0] ?? null;
  const nombreVisible = productFacts?.nombreVisible ?? productFacts?.nombreComercial ?? null;
  const aspectRatio = aspectRatioForFormat(format ?? creativeVariant?.creativeVariant?.format ?? null);
  // Creative Angle / Hook Intelligence (Paso 1/4/26 del encargo): MISMO
  // angleId/hook real ya elegido río arriba (creativeAngleSelector.js /
  // hypothesisCreativeEngine.js, vía creativeVariant.angleId/copy.hook) --
  // nunca recalculado ni inventado aquí.
  const primaryAngleLabel = creativeVariant?.angleId ? (ANGLE_LABELS[creativeVariant.angleId] ?? creativeVariant.angleId) : null;
  const hookText = creativeVariant?.copy?.hook ?? null;

  // UNA sola vez para TODA la pieza (nunca por escena) -- esto es lo que
  // garantiza que ninguna escena cambie de sujeto/entorno a mitad de
  // camino. Sin userInstruction real, resolveContinuity*() devuelve
  // EXACTAMENTE el fallback preexistente (compatibilidad hacia atrás,
  // Paso 31 del encargo).
  const visualContinuityContext = buildVisualContinuityContext({ userInstruction, campaignIntent, productFacts });
  const audience = resolveContinuityAudience(visualContinuityContext, campaignIntent?.targetAudience ?? 'la audiencia real de esta campaña');
  // territory: el fallback preexistente (scene.narration) variaba POR
  // ESCENA -- se preserva tal cual solo cuando no hay contexto real ni
  // campaignIntent (mismo criterio, ver visualContinuityContext.js).
  const baseTerritory = campaignIntent?.campaignTerritory ?? null;

  // Visual Scene Brief (Corrección "Diversidad Visual", 2026-08-28, Paso
  // 1/3 del encargo): UN brief real por escena (acción/encuadre/
  // composición/etc.), SOLO cuando hay continuidad real que propagar --
  // sin ella, "sceneBriefs" queda null y directScene() se comporta
  // EXACTAMENTE igual que antes (Paso 31, compatibilidad hacia atrás).
  const sceneBriefs = visualContinuityContext.characterContinuityRequired
    ? buildVisualSceneBriefs({ scenes: scenePlan.scenes, visualContinuityContext })
    : null;

  const scenes = scenePlan.scenes.map((scene, i) => directScene({
    scene,
    treatment,
    nombreVisible,
    productAssetAvailable: Boolean(productAsset),
    aspectRatio,
    audience,
    territory: resolveContinuityTerritory(visualContinuityContext, baseTerritory ?? scene.narration),
    sceneBrief: sceneBriefs?.[i] ?? null,
    visualContinuityContext: sceneBriefs ? visualContinuityContext : null,
    primaryAngleLabel: sceneBriefs ? primaryAngleLabel : null,
    hookText: sceneBriefs ? hookText : null,
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
          // Visual Scene Brief (Paso 13/14 del encargo "Diversidad
          // Visual"): auditable por escena en el Dashboard -- solo
          // presente con continuidad real (mismo criterio, Paso 31).
          ...(s.action ? {
            action: s.action, narrativePurpose: s.narrativePurpose, shotType: s.shotType, cameraAngle: s.cameraAngle,
            composition: s.composition, bodyPosition: s.bodyPosition, interaction: s.interaction, props: s.props,
            emotionalState: s.emotionalState, continuityConstraints: s.continuityConstraints,
            sceneNarrativeContext: s.sceneNarrativeContext,
          } : {}),
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

  // Instruction Coverage / Prompt Gate (Paso 14/15/36 del encargo): mide,
  // sobre el TEXTO REAL de todos los scene.visualPrompt de la pieza
  // (el mismo texto real que verá el provider), si las señales reales ya
  // extraídas de userInstruction (subject/gender/environment/edad) de
  // verdad quedaron en el prompt real final -- red de seguridad real,
  // nunca un cálculo que reemplaza la construcción real del prompt.
  const combinedPromptText = scenes.map((s) => s.visualPrompt).filter(Boolean).join(' ');
  const instructionCoverage = computeInstructionCoverage({ context: visualContinuityContext, combinedPromptText });

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
  // Generation Settings (Paso 6 del encargo): UN objeto real que une
  // MODELO + CALIDAD -- nunca un sistema paralelo al lineage individual ya
  // devuelto más abajo (recommendedModel/selectedModel/selectionMode se
  // preservan tal cual para no romper consumidores existentes).
  const generationSettings = buildGenerationSettings({
    mediaType: 'IMAGE',
    recommendedModel: modelRecommendation.recommendedModel,
    recommendationReason: modelRecommendation.recommendationReason,
    selectedModelId,
    productAssetAvailable: Boolean(productAsset),
    aspectRatio,
    selectedQuality,
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
    // Visual Intent (Paso 4/18 del encargo): CON continuidad real
    // (subject/environment/angle reales), específico y dinámico -- nunca
    // el default genérico por-tratamiento (ej. "Explicación clara y
    // visual relacionada con esta campaña", EDUCATIONAL en
    // visualTreatments.js). SIN continuidad real (Paso 31, compatibilidad
    // hacia atrás), preserva EXACTAMENTE overview.subject/environment.
    visualIntent: visualContinuityContext.characterContinuityRequired
      ? [visualContinuityContext.subjectDescription, visualContinuityContext.environment, primaryAngleLabel]
        .filter((f) => limpiar(f).length > 0).join(', ')
      : [overview.subject, overview.environment].filter((f) => limpiar(f).length > 0).join(', '),
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
    // Visual Continuity Context (Paso 8/15 del encargo): expuesto para
    // lineage/UI -- el MISMO objeto real que ya se usó arriba para
    // audience/territory, nunca recalculado.
    visualContinuityContext,
    // Instruction Coverage (Paso 14/36 del encargo): expuesto tal cual --
    // Creative Quality Auto-QA (creativeQualityAutoQA.js) y la UI lo
    // reutilizan, nunca lo recalculan.
    instructionCoverageScore: instructionCoverage.instructionCoverageScore,
    instructionCoverageMissing: instructionCoverage.missing,
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
    // Generation Settings (Paso 6/15 del encargo): objeto unificado
    // MODELO+CALIDAD, con lineage completo -- se persiste tal cual en
    // job.visualStrategy.generationSettings (ver
    // creativeProductionOrchestrator.js, sin cambios adicionales
    // necesarios: ya serializa visualStrategy completo).
    generationSettings,
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
  // Generation Settings (Paso 12/13 del encargo): selección manual real ya
  // hecha por el usuario en esta vista previa (antes de producir) -- mismo
  // criterio real que selectedModelId (null = recomendación aceptada tal
  // cual).
  selectedModelId = null, selectedQuality = null,
  // Visual Continuity Context (Corrección "Crear contenido", Paso 8 del
  // encargo): mismo criterio real que buildVisualStrategy() -- la vista
  // previa debe mostrar el MISMO sujeto/entorno que luego se propagará a
  // todas las escenas reales, nunca uno distinto.
  userInstruction = null,
  // Creative Angle (Paso 18 del encargo): angleId real YA elegido por
  // creativeAngleSelector.js (batch.variantsDetail[variantIndex].angleId)
  // -- opcional, nunca recalculado ni inventado aquí.
  angleId = null,
}) {
  const treatment = assignVisualTreatment({ variantIndex, campaignIntent, campaignId });
  const productAsset = productRawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? productRawAssets[0] ?? null;
  const aspectRatio = aspectRatioForFormat(format);
  const { recommendedModel, recommendationReason } = recommendImageModel({
    productAssetAvailable: Boolean(productAsset), visualTreatmentId: treatment.id, hasGenerationRequiredScenes: true, aspectRatio,
  });
  const visualContinuityContext = buildVisualContinuityContext({ userInstruction, campaignIntent, productFacts });
  const primaryAngleLabel = angleId ? (ANGLE_LABELS[angleId] ?? angleId) : null;
  const overview = treatment.describe({
    audience: resolveContinuityAudience(visualContinuityContext, campaignIntent?.targetAudience ?? 'la audiencia real de esta campaña'),
    territory: resolveContinuityTerritory(visualContinuityContext, campaignIntent?.campaignTerritory ?? 'esta campaña'),
    nombreVisible: productFacts?.nombreVisible ?? productFacts?.nombreComercial ?? null,
  });
  return Object.freeze({
    visualTreatment: treatment.id,
    visualTreatmentLabel: treatment.label,
    // Visual Intent (Paso 4/18 del encargo): con continuidad real,
    // específico (sujeto/entorno/ángulo reales) -- nunca el default
    // genérico por-tratamiento. Sin ella, preserva el cálculo preexistente.
    visualIntent: visualContinuityContext.characterContinuityRequired
      ? [visualContinuityContext.subjectDescription, visualContinuityContext.environment, primaryAngleLabel]
        .filter((f) => limpiar(f).length > 0).join(', ')
      : [overview.subject, overview.environment].filter((f) => limpiar(f).length > 0).join(', '),
    visualContinuityContext,
    recommendedModel,
    recommendationReason,
    availableModels: listAvailableImageModels({ productReferenceAvailable: Boolean(productAsset), aspectRatio }),
    // Generation Settings (Paso 6/20 del encargo): objeto unificado
    // MODELO+CALIDAD para que el Dashboard muestre "Modelo sugerido" +
    // "Calidad sugerida" en un solo lugar -- nunca un sistema paralelo,
    // reusa exactamente el mismo recommendedModel/recommendationReason de
    // arriba.
    generationSettings: buildGenerationSettings({
      mediaType: 'IMAGE', recommendedModel, recommendationReason, selectedModelId,
      productAssetAvailable: Boolean(productAsset), aspectRatio, selectedQuality,
    }),
    // Referencia visual del producto (Corrección "Flujo creativo integral",
    // 2026-08-28, Paso 27 del encargo): expuesto ANTES de producir para que
    // el Dashboard pueda avisar "sin fotografía real" antes de gastar el
    // costo real de voiceover -- mismo criterio real que
    // buildVisualStrategy().assetRequirements (nunca un cálculo nuevo).
    assetRequirements: Object.freeze({
      productAssetAvailable: Boolean(productAsset), productAssetId: productAsset?.assetId ?? null,
    }),
  });
}
