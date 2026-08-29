// scenePlanner.js — Creative Production Orchestrator (2026-08-24): Script
// (videoScriptGenerator.js, YA real, sin tocar) -> Scene Plan real. NUNCA
// vuelve a generar copy ni redacta narración nueva -- consume
// EXCLUSIVAMENTE las secciones ya tipadas/timed que buildVideoScript() ya
// produjo (HOOK/CONTEXT/PRODUCT_MECHANISM/GROUNDED_PRODUCT_FACT/CTA).
//
// REGLA CENTRAL (Paso 3 del encargo): "no todas las escenas deben mostrar
// el producto". Cada tipo de sección real tiene una intención visual real
// distinta -- HOOK/CONTEXT hablan del territorio/audiencia de campaña
// (nunca el producto), PRODUCT_MECHANISM/GROUNDED_PRODUCT_FACT sí
// muestran el producto real (es, literalmente, donde el copy conecta con
// el producto), CTA vuelve a marca/WhatsApp, no necesariamente producto.

import { alignStagesToCount, LEGACY_STRUCTURE } from './creativeStructureEngine.js';

// Text Overlay corto real para CTA (Corrección "Flujo creativo integral",
// 2026-08-28, Paso 9 del encargo): el overlay de CTA NO debe repetir
// literalmente el CTA hablado completo (voiceover + overlay + subtítulos
// mostrando el mismo texto largo tres veces) -- se extrae, de forma
// determinista y a partir del MISMO texto real del CTA (nunca inventado),
// una frase de cierre corta cuando el texto real contiene una señal clara
// (WhatsApp/enlace); si no hay señal real, se preserva el CTA completo tal
// cual (nunca se acorta arbitrariamente un texto sin patrón reconocible).
const SHORT_CTA_PATTERNS = Object.freeze([
  { re: /whatsapp/i, label: 'Escríbenos por WhatsApp' },
  { re: /\benlace\b|\blink\b/i, label: 'Visita el enlace' },
]);

function buildShortCtaOverlay(ctaText) {
  const encontrado = SHORT_CTA_PATTERNS.find((p) => p.re.test(ctaText ?? ''));
  return encontrado?.label ?? ctaText;
}

// Text Overlay real para HOOK (Corrección "Evolución integral del
// Creative Director", 2026-08-28, Paso 12 del encargo): "si el hook se
// está diciendo, no repetir automáticamente todo el hook en texto
// grande". Un hook corto (gancho de una línea, el caso real más común) SÍ
// se muestra tal cual -- es su propio propósito visual. Uno largo real
// (frase completa) se omite como overlay (el voiceover+subtítulos ya lo
// comunican) en vez de fabricar una versión acortada inventada.
const HOOK_OVERLAY_MAX_CHARS = 60;

function buildHookOverlay(hookText) {
  const limpio = String(hookText ?? '').trim();
  return limpio.length > 0 && limpio.length <= HOOK_OVERLAY_MAX_CHARS ? limpio : null;
}

export const VISUAL_INTENT_TYPES = Object.freeze(['CONCEPT_OPENING', 'AUDIENCE_CONTEXT', 'PRODUCT_REVEAL', 'CTA_BRAND']);

const VISUAL_INTENT_BY_SECTION_TYPE = Object.freeze({
  HOOK: 'CONCEPT_OPENING',
  CONTEXT: 'AUDIENCE_CONTEXT',
  PRODUCT_MECHANISM: 'PRODUCT_REVEAL',
  GROUNDED_PRODUCT_FACT: 'PRODUCT_REVEAL',
  CTA: 'CTA_BRAND',
});

// Creative Structure Engine (nueva capa, Paso 4 del encargo): mapeo de
// respaldo real cuando NO llega un "creativeStructure" real (Paso 20,
// backward compatibility) -- deriva un narrativeStage real a partir del
// MISMO section.type real que ya decide visualIntent arriba, nunca uno
// inventado.
const LEGACY_NARRATIVE_STAGE_BY_SECTION_TYPE = Object.freeze({
  HOOK: 'HOOK',
  CONTEXT: 'PROBLEM',
  PRODUCT_MECHANISM: 'PRODUCT',
  GROUNDED_PRODUCT_FACT: 'PRODUCT',
  CTA: 'CTA',
});

/**
 * @param {{
 *   videoScript: object, productRawAssets?: object[], campaignIntent?: object|null,
 *   creativeStructure?: ?object,
 * }} args
 * videoScript -- resultado real de buildVideoScript() (videoScriptGenerator.js), YA aplicable:true.
 * productRawAssets -- rawAssets reales del producto (ver dashboard/server/lib/productCatalog.js#getProduct().rawAssets), opcional.
 * creativeStructure -- resultado real de creativeStructureEngine.js#buildCreativeStructure(), opcional
 * (Creative Structure Engine, Paso 4 del encargo). Sin este argumento, el
 * plan sigue siendo 100% funcional (Paso 20, backward compatibility) --
 * cada escena recibe un narrativeStage legacy derivado de section.type, y
 * el plan se marca explícitamente con LEGACY_STRUCTURE, nunca en silencio.
 */
export function buildScenePlan({
  videoScript, productRawAssets = [], campaignIntent = null, creativeStructure = null,
}) {
  if (!videoScript?.applicable) {
    throw new Error('buildScenePlan: "videoScript" debe ser un Video Script real y aplicable (videoScript.applicable === true) -- este planner nunca inventa escenas para un formato estático.');
  }
  const productImage = productRawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? productRawAssets[0] ?? null;

  const scenes = videoScript.sections.map((section, i) => {
    const visualIntent = VISUAL_INTENT_BY_SECTION_TYPE[section.type] ?? 'AUDIENCE_CONTEXT';
    const wantsProduct = visualIntent === 'PRODUCT_REVEAL';
    const hasProductAsset = wantsProduct && Boolean(productImage);
    return Object.freeze({
      sceneId: `scene-${i + 1}`,
      sectionType: section.type,
      startSeconds: section.startSeconds,
      duration: section.durationSeconds,
      narration: section.text,
      // Prompt real para un VideoProvider (nunca inventa un hecho de
      // producto -- solo describe qué se ve, grounded en la narración real
      // de ESTA sección y el territorio de campaña si existe).
      visualPrompt: campaignIntent && !hasProductAsset
        ? `${campaignIntent.campaignTerritory} -- ${section.text}`
        : section.text,
      visualIntent,
      visualType: hasProductAsset ? 'PRODUCT_ASSET' : 'TYPOGRAPHIC',
      textOverlay: section.type === 'HOOK' ? buildHookOverlay(videoScript.onScreenText.hook)
        : section.type === 'CTA' ? buildShortCtaOverlay(videoScript.onScreenText.cta)
          : null,
      transition: i === 0 ? 'NONE' : 'CUT',
      audioIntent: 'VOICEOVER_SEGMENT',
      assetRequirements: hasProductAsset ? Object.freeze({ productImageAssetId: productImage.assetId, productImageSourcePath: productImage.sourcePath }) : Object.freeze({}),
    });
  });

  const sceneCountByVisualType = scenes.reduce((acc, s) => { acc[s.visualType] = (acc[s.visualType] ?? 0) + 1; return acc; }, {});

  // Creative Structure Engine (Paso 4 del encargo): alinea los stages
  // reales de la estructura (recomendada o seleccionada por el usuario) al
  // número real de escenas que el copy real ya determinó -- NUNCA al
  // revés. Sin "creativeStructure" real (Paso 20, backward compatibility),
  // cae a LEGACY_STRUCTURE, etiquetada explícitamente (nunca un stage
  // inventado en silencio).
  const stageSequence = creativeStructure?.stages?.length
    ? alignStagesToCount(creativeStructure.stages, scenes.length)
    : scenes.map((s) => LEGACY_NARRATIVE_STAGE_BY_SECTION_TYPE[s.sectionType] ?? 'PROBLEM');
  const scenesConEstructura = scenes.map((s, i) => Object.freeze({ ...s, narrativeStage: stageSequence[i] }));

  return Object.freeze({
    totalDurationSeconds: videoScript.estimatedDurationSeconds,
    styleCategory: videoScript.styleCategory,
    scenes: Object.freeze(scenesConEstructura),
    sceneCountByVisualType: Object.freeze(sceneCountByVisualType),
    // Señal real de diversidad visual (Paso 3: "no todas las escenas deben
    // mostrar el producto") -- nunca todas PRODUCT_ASSET si hay >1 escena.
    allScenesShowProduct: scenes.length > 1 && scenes.every((s) => s.visualType === 'PRODUCT_ASSET'),
    // Lineage real del Creative Structure Engine (Paso 21 del encargo) --
    // asociado a ESTE Scene Plan (y, por extensión, a la Creative Variant
    // que lo originó vía creativeProductionOrchestrator.js).
    creativeStructure: Object.freeze({
      structureId: creativeStructure?.structureId ?? LEGACY_STRUCTURE.structureId,
      selectionMode: creativeStructure?.selectionMode ?? 'legacy_fallback',
      recommendationReason: creativeStructure?.recommendationReason ?? LEGACY_STRUCTURE.objective,
      recommendedStructure: creativeStructure?.recommendedStructure ?? null,
      selectedStructure: creativeStructure?.selectedStructure ?? null,
      stages: Object.freeze(stageSequence),
    }),
  });
}
