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

export const VISUAL_INTENT_TYPES = Object.freeze(['CONCEPT_OPENING', 'AUDIENCE_CONTEXT', 'PRODUCT_REVEAL', 'CTA_BRAND']);

const VISUAL_INTENT_BY_SECTION_TYPE = Object.freeze({
  HOOK: 'CONCEPT_OPENING',
  CONTEXT: 'AUDIENCE_CONTEXT',
  PRODUCT_MECHANISM: 'PRODUCT_REVEAL',
  GROUNDED_PRODUCT_FACT: 'PRODUCT_REVEAL',
  CTA: 'CTA_BRAND',
});

/**
 * @param {{videoScript: object, productRawAssets?: object[], campaignIntent?: object|null}} args
 * videoScript -- resultado real de buildVideoScript() (videoScriptGenerator.js), YA aplicable:true.
 * productRawAssets -- rawAssets reales del producto (ver dashboard/server/lib/productCatalog.js#getProduct().rawAssets), opcional.
 */
export function buildScenePlan({ videoScript, productRawAssets = [], campaignIntent = null }) {
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
      textOverlay: section.type === 'HOOK' ? videoScript.onScreenText.hook
        : section.type === 'CTA' ? videoScript.onScreenText.cta
          : null,
      transition: i === 0 ? 'NONE' : 'CUT',
      audioIntent: 'VOICEOVER_SEGMENT',
      assetRequirements: hasProductAsset ? Object.freeze({ productImageAssetId: productImage.assetId, productImageSourcePath: productImage.sourcePath }) : Object.freeze({}),
    });
  });

  const sceneCountByVisualType = scenes.reduce((acc, s) => { acc[s.visualType] = (acc[s.visualType] ?? 0) + 1; return acc; }, {});

  return Object.freeze({
    totalDurationSeconds: videoScript.estimatedDurationSeconds,
    styleCategory: videoScript.styleCategory,
    scenes: Object.freeze(scenes),
    sceneCountByVisualType: Object.freeze(sceneCountByVisualType),
    // Señal real de diversidad visual (Paso 3: "no todas las escenas deben
    // mostrar el producto") -- nunca todas PRODUCT_ASSET si hay >1 escena.
    allScenesShowProduct: scenes.length > 1 && scenes.every((s) => s.visualType === 'PRODUCT_ASSET'),
  });
}
