// creativeDirector.test.js — Creative Director (2026-08-27).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoScript } from '../src/videoScriptGenerator.js';
import { buildScenePlan } from '../src/scenePlanner.js';
import { buildVisualStrategy } from '../src/creativeDirector.js';
import { VISUAL_TREATMENT_IDS } from '../src/visualTreatments.js';

const COPY_REAL = {
  hook: '¿energía para entrenar?',
  bodyLines: [
    '¿Te ha pasado? falta de energía para entrenar en el gimnasio.',
    'Cápsulas Ripped incluye Tongkat Ali, Ganoderma.',
    'Beneficia el aumento de masa muscular; ayuda a prevenir el envejecimiento prematuro.',
  ],
  sectionsUsed: [
    { section: 'problem', sourceField: 'problema' },
    { section: 'mechanism', sourceField: 'ingredientes' },
    { section: 'productReveal', sourceField: 'beneficios' },
  ],
  cta: 'Escríbenos por WhatsApp.',
  format: 'Native TikTok-style',
  copyStyle: 'UGC_CONVERSATIONAL',
};

const CAMPAIGN_INTENT_REAL = {
  targetAudience: 'mujeres adultas que entrenan en gimnasio', problemOrNeed: 'falta de energía para entrenar', campaignTerritory: 'energía y bienestar en el gimnasio',
};

const CREATIVE_VARIANT_REAL = {
  conceptId: 'problem_agitation', angleId: 'problem_agitation', hookId: 'question',
  copy: COPY_REAL,
  creativeVariant: { format: 'Native TikTok-style' },
  copyStyle: 'UGC_CONVERSATIONAL',
};

const PRODUCT_FACTS_REAL = { nombreComercial: 'Divina Ripped Capsules', nombreVisible: 'Cápsulas Ripped' };
const PRODUCT_ASSET_REAL = { assetId: 'a'.repeat(64), sourcePath: 'C:/assets/ripped-capsules/raw/Ripped_01_Producto.png', role: 'PRODUCT_PRIMARY' };

function realScenePlan(productRawAssets = []) {
  const script = buildVideoScript(COPY_REAL);
  return buildScenePlan({ videoScript: script, productRawAssets, campaignIntent: CAMPAIGN_INTENT_REAL });
}

describe('buildVisualStrategy — Creative Director real', () => {
  test('rechaza sin un Scene Plan real', () => {
    assert.throws(() => buildVisualStrategy({ creativeVariant: CREATIVE_VARIANT_REAL, scenePlan: null }), /Scene Plan real/);
  });

  test('produce una Visual Strategy real con todos los campos pedidos (Paso 1 del encargo)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0, campaignId: 'ripped-campaign-1',
    });
    for (const campo of ['concept', 'visualTreatment', 'sceneVisuals', 'assetRequirements', 'imageGenerationRequests', 'videoGenerationRequests', 'style', 'composition', 'camera', 'lighting', 'subject', 'environment', 'productPlacement', 'textOverlayIntent', 'visualSource']) {
      assert.ok(campo in strategy, `falta el campo "${campo}" en la Visual Strategy real`);
    }
    assert.ok(VISUAL_TREATMENT_IDS.includes(strategy.visualTreatment));
    assert.equal(strategy.sceneVisuals.length, scenePlan.scenes.length);
  });

  test('diversidad real entre variantes de un mismo batch (Paso 3): 5 variantes -> 5 tratamientos distintos', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const tratamientos = Array.from({ length: 5 }, (_, i) => buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: i, campaignId: 'ripped-campaign-2',
    }).visualTreatment);
    assert.equal(new Set(tratamientos).size, 5, `esperaba 5 tratamientos únicos, obtuvo: ${tratamientos.join(', ')}`);
  });

  test('NO todas las escenas quedan con el mismo tratamiento textual -- el prompt real varía con la narración de cada escena', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, scenePlan, variantIndex: 0,
    });
    const prompts = new Set(strategy.sceneVisuals.map((s) => s.visualPrompt));
    assert.ok(prompts.size > 1, 'las escenas reales no deberían compartir el mismo visualPrompt exacto');
  });

  describe('Product grounding — nombreVisible (texto) vs productAsset (visual), Paso 5-10', () => {
    test('con asset real disponible: la escena PRODUCT_REVEAL usa EXISTING_PRODUCT_ASSET, nunca marca el producto como faltante', () => {
      const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
      const strategy = buildVisualStrategy({
        creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
        productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
      });
      const productScene = strategy.sceneVisuals.find((s) => s.visualIntent === 'PRODUCT_REVEAL');
      assert.equal(productScene.visualSource, 'EXISTING_PRODUCT_ASSET');
      assert.equal(productScene.productAssetRequired, false);
      assert.ok(productScene.productPlacement.includes('Cápsulas Ripped'));
      assert.equal(strategy.visualSource, 'EXISTING_PRODUCT_ASSET');
    });

    test('sin asset real disponible: la escena PRODUCT_REVEAL se marca productAssetRequired -- NUNCA inventa el empaque (Paso 10)', () => {
      const scenePlan = realScenePlan([]);
      const strategy = buildVisualStrategy({
        creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
        productRawAssets: [], scenePlan, variantIndex: 0,
      });
      const productScene = strategy.sceneVisuals.find((s) => s.visualIntent === 'PRODUCT_REVEAL');
      assert.equal(productScene.productAssetRequired, true);
      assert.match(productScene.productPlacement, /PRODUCT_VISUAL_ASSET_REQUIRED/);
      assert.equal(strategy.visualSource, 'PRODUCT_VISUAL_ASSET_REQUIRED');
      // Nunca se fabrica un nombre de empaque nuevo a partir de nombreVisible -- el prompt real de esa escena no describe un producto inventado.
      assert.doesNotMatch(productScene.visualPrompt, /empaque|packaging|etiqueta/i);
    });

    test('nombreVisible se usa SOLO en productPlacement (texto), nunca reemplaza la fuente visual real', () => {
      const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
      const strategy = buildVisualStrategy({
        creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
        productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
      });
      const productScene = strategy.sceneVisuals.find((s) => s.visualIntent === 'PRODUCT_REVEAL');
      // La fotografía real sigue siendo la del asset registrado -- assetRequirements intacto (scenePlanner.js, nunca tocado por Creative Director).
      assert.equal(productScene.assetRequirements.productImageSourcePath, PRODUCT_ASSET_REAL.sourcePath);
    });
  });

  test('no todas las escenas muestran producto -- solo la de PRODUCT_REVEAL (Paso 18, preserva la regla de scenePlanner.js)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
    });
    const conProducto = strategy.sceneVisuals.filter((s) => s.visualSource === 'EXISTING_PRODUCT_ASSET');
    assert.ok(conProducto.length < strategy.sceneVisuals.length);
    assert.ok(conProducto.length > 0);
  });

  test('imageGenerationRequests: uno por cada escena que requiere generación (nunca para escenas con asset real)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0, campaignId: 'c1', batchId: 'b1', creativeId: 'creative-1',
    });
    const generadas = strategy.sceneVisuals.filter((s) => s.visualSource === 'GENERATION_REQUIRED');
    assert.equal(strategy.imageGenerationRequests.length, generadas.length);
    for (const req of strategy.imageGenerationRequests) {
      assert.equal(req.campaignId, 'c1');
      assert.equal(req.creativeId, 'creative-1');
      assert.ok(req.promptSpec.subject?.length > 0);
      assert.equal(req.status, 'PENDING');
    }
  });

  test('preserva sectionType/visualType/duration/startSeconds/narration/assetRequirements ya decididos por scenePlanner.js (nunca los reemplaza)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
    });
    for (let i = 0; i < scenePlan.scenes.length; i += 1) {
      const original = scenePlan.scenes[i];
      const enriched = strategy.sceneVisuals[i];
      assert.equal(enriched.sceneId, original.sceneId);
      assert.equal(enriched.sectionType, original.sectionType);
      assert.equal(enriched.visualType, original.visualType);
      assert.equal(enriched.duration, original.duration);
      assert.equal(enriched.startSeconds, original.startSeconds);
      assert.equal(enriched.narration, original.narration);
      assert.deepEqual(enriched.assetRequirements, original.assetRequirements);
    }
  });
});

// Creative Structure + Generation Settings (Paso 32 del encargo): visual
// intent independiente del voiceover, generationSettings unificado
// (modelo+calidad), manual model/quality selection, product reference,
// lineage.
describe('buildVisualStrategy — Generation Settings (Paso 4/6/11/12)', () => {
  test('visualIntent real, independiente del voiceover completo (Paso 4)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
    });
    assert.ok(strategy.visualIntent?.length > 0);
    // visualIntent describe la escena visualmente -- nunca es el guion/CTA
    // completo (esos son texto/voz, un eje real distinto, Paso 4).
    assert.doesNotMatch(strategy.visualIntent, /Escríbenos por WhatsApp/);
  });

  test('generationSettings real: un objeto único con mediaType/modelo/calidad/lineage (Paso 6/15)', () => {
    const scenePlan = realScenePlan([PRODUCT_ASSET_REAL]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [PRODUCT_ASSET_REAL], scenePlan, variantIndex: 0,
    });
    assert.equal(strategy.generationSettings.mediaType, 'IMAGE');
    for (const key of ['recommendedModel', 'recommendedQuality', 'selectedModel', 'selectedQuality', 'selectionMode', 'modelSelectionMode', 'qualitySelectionMode', 'costStatus']) {
      assert.ok(key in strategy.generationSettings, `generationSettings debe exponer "${key}"`);
    }
  });

  test('manual model selection real recalcula la calidad disponible (Paso 13/22)', () => {
    const scenePlan = realScenePlan([]);
    const automatic = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0,
    });
    if (!automatic.generationSettings.selectedModel) return; // ningún provider real configurado en este entorno -- nada que reseleccionar.
    const manual = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0,
      selectedModelId: automatic.generationSettings.selectedModel, selectedQuality: automatic.generationSettings.selectedQuality,
    });
    // Selección explícita que coincide con la recomendación real -> sigue "automatic" (regla central: solo un cambio real activa "user_selected").
    assert.equal(manual.generationSettings.selectionMode, 'automatic');
  });
});

describe('buildVisualStrategy — Visual Continuity Context (Corrección "Crear contenido", Paso 8/9/10)', () => {
  const INSTRUCCION_MUJER_OFICINA = 'Quiero un video de una mujer adulta trabajando en una oficina moderna, mostrando cómo puede integrar el producto en su rutina diaria.';

  test('J: visualContinuityContext real se propaga IDÉNTICO a TODAS las escenas (mismo subject/environment en cada una)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
    });
    assert.equal(strategy.visualContinuityContext.subjectGender, 'female');
    assert.equal(strategy.visualContinuityContext.environment, 'oficina moderna');
    assert.ok(scenePlan.scenes.length > 1, 'el fixture real debe tener más de 1 escena para probar propagación');
    const subjects = new Set(strategy.sceneVisuals.map((s) => s.subject));
    const environments = new Set(strategy.sceneVisuals.map((s) => s.environment));
    assert.equal(subjects.size, 1, `todas las escenas deben compartir el mismo "subject" real, obtuvo: ${[...subjects].join(' | ')}`);
    assert.equal(environments.size, 1, `todas las escenas deben compartir el mismo "environment" real, obtuvo: ${[...environments].join(' | ')}`);
    // El "subject" real (que sí incorpora visualContinuityContext, ver
    // directScene()) debe reflejar el sujeto detectado en TODAS las
    // escenas -- el "environment" en cambio es propio de cada
    // VISUAL_TREATMENT (ver visualTreatments.js, no se toca) y algunos
    // tratamientos (ej. EDUCATIONAL) usan una descripción de fondo fija
    // que NO incorpora "territory"; lo que este test prueba es que sea
    // consistente entre escenas, no un texto literal específico.
    for (const s of strategy.sceneVisuals) {
      assert.match(s.subject, /mujer adulta/);
    }
  });

  test('K: subjectGender female detectado real -- ninguna escena real menciona "hombre" (nunca cambia sin override explícito)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
    });
    for (const s of strategy.sceneVisuals) {
      assert.doesNotMatch(s.subject, /\bhombre\b/);
    }
  });

  test('sin userInstruction real (backward compatibility, Paso 31): audience/territory usan EXACTAMENTE el fallback preexistente, ningún llamador antiguo cambia de comportamiento', () => {
    const scenePlan = realScenePlan([]);
    const conInstruccion = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0,
    });
    const sinInstruccion = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: null,
    });
    assert.deepEqual(conInstruccion.sceneVisuals.map((s) => s.subject), sinInstruccion.sceneVisuals.map((s) => s.subject));
    assert.equal(sinInstruccion.visualContinuityContext.subjectGender, null);
  });
});

describe('buildVisualStrategy — Diversidad Visual entre escenas (Corrección "Mejorar diversidad visual", 2026-08-28)', () => {
  const INSTRUCCION_MUJER_OFICINA = 'Quiero un video de una mujer adulta trabajando en una oficina moderna, mostrando cómo puede integrar el producto en su rutina diaria.';

  function strategyConContinuidad(productRawAssets = []) {
    const scenePlan = realScenePlan(productRawAssets);
    return {
      scenePlan,
      strategy: buildVisualStrategy({
        creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
        productRawAssets, scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
      }),
    };
  }

  test('B: cada escena real recibe un Visual Scene Brief propio (action/narrativePurpose/shotType/cameraAngle/composition/bodyPosition/interaction)', () => {
    const { strategy } = strategyConContinuidad([]);
    for (const s of strategy.sceneVisuals) {
      assert.ok(s.action?.length > 0, `escena "${s.sceneId}" real trae "action" real`);
      assert.ok(s.narrativePurpose?.length > 0, `escena "${s.sceneId}" real trae "narrativePurpose" real`);
      assert.ok(s.shotType?.length > 0, `escena "${s.sceneId}" real trae "shotType" real`);
      assert.ok(s.cameraAngle?.length > 0, `escena "${s.sceneId}" real trae "cameraAngle" real`);
      assert.ok(s.composition?.length > 0, `escena "${s.sceneId}" real trae "composition" real`);
      assert.ok(s.bodyPosition?.length > 0, `escena "${s.sceneId}" real trae "bodyPosition" real`);
      assert.ok(Array.isArray(s.continuityConstraints) && s.continuityConstraints.length > 0, `escena "${s.sceneId}" real trae "continuityConstraints" real`);
    }
  });

  test('C: la "action" real difiere entre escenas consecutivas reales (nunca "de pie en oficina" repetido)', () => {
    const { strategy } = strategyConContinuidad([]);
    assert.ok(strategy.sceneVisuals.length > 1, 'el fixture real debe tener más de 1 escena');
    for (let i = 1; i < strategy.sceneVisuals.length; i += 1) {
      assert.notEqual(
        strategy.sceneVisuals[i].action, strategy.sceneVisuals[i - 1].action,
        `escena "${strategy.sceneVisuals[i].sceneId}" real repite la MISMA action que "${strategy.sceneVisuals[i - 1].sceneId}"`,
      );
    }
  });

  test('D: diversidad real de shotType/cameraAngle/composition -- no todas las escenas comparten el mismo encuadre real', () => {
    const { strategy } = strategyConContinuidad([]);
    const shotTypes = new Set(strategy.sceneVisuals.map((s) => s.shotType));
    const cameraAngles = new Set(strategy.sceneVisuals.map((s) => s.cameraAngle));
    assert.ok(shotTypes.size > 1 || cameraAngles.size > 1, `esperaba variedad real de encuadre/ángulo entre escenas, obtuvo shotTypes=${[...shotTypes]} cameraAngles=${[...cameraAngles]}`);
  });

  test('I: dos escenas consecutivas reales nunca reciben el MISMO Visual Scene Brief completo (action+shotType+composition)', () => {
    const { strategy } = strategyConContinuidad([]);
    for (let i = 1; i < strategy.sceneVisuals.length; i += 1) {
      const a = strategy.sceneVisuals[i];
      const b = strategy.sceneVisuals[i - 1];
      const iguales = a.action === b.action && a.shotType === b.shotType && a.composition === b.composition;
      assert.equal(iguales, false, `escenas "${b.sceneId}" y "${a.sceneId}" reales tienen un Visual Scene Brief real idéntico`);
    }
  });

  test('E/F: generatedPrompt real (visualPrompt) incorpora CONTEXTO GLOBAL (subject/environment) + CONTEXTO ESPECÍFICO de la escena (action) -- nunca el mismo prompt base repetido', () => {
    const { strategy } = strategyConContinuidad([]);
    const generationScenes = strategy.sceneVisuals.filter((s) => s.visualSource === 'GENERATION_REQUIRED');
    assert.ok(generationScenes.length > 1, 'el fixture real debe tener más de 1 escena real con generación de imagen');
    for (const s of generationScenes) {
      assert.match(s.visualPrompt, /mujer adulta/, `escena "${s.sceneId}" real: prompt incluye el contexto GLOBAL real (sujeto)`);
      assert.match(s.visualPrompt, /oficina moderna/, `escena "${s.sceneId}" real: prompt incluye el contexto GLOBAL real (entorno)`);
      assert.ok(s.visualPrompt.includes(s.action), `escena "${s.sceneId}" real: prompt incluye el contexto ESPECÍFICO real de la escena (action)`);
    }
    const prompts = new Set(generationScenes.map((s) => s.visualPrompt));
    assert.equal(prompts.size, generationScenes.length, 'ningún prompt real de generación se repite entre escenas -- cada uno es único (Paso 6 del encargo)');
  });

  test('G: el personaje real nunca cambia de género entre escenas (mismo criterio real que K, ahora también sobre "action"/"interaction")', () => {
    const { strategy } = strategyConContinuidad([]);
    for (const s of strategy.sceneVisuals) {
      assert.doesNotMatch(s.action ?? '', /\bhombre\b/);
      assert.doesNotMatch(s.interaction ?? '', /\bhombre\b/);
    }
  });

  test('H: la escena real de producto mantiene productAssetId real (Product Grounding, Paso 10 del encargo)', () => {
    const { strategy } = strategyConContinuidad([PRODUCT_ASSET_REAL]);
    assert.equal(strategy.assetRequirements.productAssetAvailable, true);
    assert.equal(strategy.assetRequirements.productAssetId, PRODUCT_ASSET_REAL.assetId);
    const productScenes = strategy.sceneVisuals.filter((s) => s.visualIntent === 'PRODUCT_REVEAL');
    assert.ok(productScenes.length > 0, 'el fixture real debe tener al menos 1 escena PRODUCT_REVEAL real');
    for (const s of productScenes) {
      assert.equal(s.productPresence, true, `escena "${s.sceneId}" real: productPresence real true`);
      assert.equal(s.visualSource, 'EXISTING_PRODUCT_ASSET', `escena "${s.sceneId}" real: usa el asset real ya existente, nunca inventa empaque`);
    }
  });

  test('J: backward compatibility real -- sin userInstruction, ninguna escena real trae campos del Visual Scene Brief (nunca se filtran por accidente)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: null,
    });
    for (const s of strategy.sceneVisuals) {
      assert.equal(s.action, undefined, `escena "${s.sceneId}" real: sin userInstruction, "action" real nunca aparece`);
      assert.equal(s.shotType, undefined, `escena "${s.sceneId}" real: sin userInstruction, "shotType" real nunca aparece`);
    }
  });
});

describe('buildVisualStrategy — Creative Angle / Hook Intelligence (Corrección "Evolución integral del Creative Director", 2026-08-28)', () => {
  const INSTRUCCION_MUJER_OFICINA = 'Quiero un video de una mujer adulta trabajando en una oficina moderna, mostrando cómo puede integrar el producto en su rutina diaria.';

  test('Visual Intent real específico: incluye el ángulo creativo real (nunca el default genérico por-tratamiento, Paso 18)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
    });
    // CREATIVE_VARIANT_REAL.angleId real = "problem_agitation" -> label real "Agitación del problema".
    assert.match(strategy.visualIntent, /Agitaci[oó]n del problema/);
    assert.match(strategy.visualIntent, /mujer adulta/);
  });

  test('hookVisualIntent real: presente SOLO en la escena real HOOK, incorpora el hook real (Paso 11 del encargo)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
    });
    const hookScene = strategy.sceneVisuals.find((s) => s.narrativePurpose === 'HOOK');
    assert.ok(hookScene, 'debe existir una escena real con narrativePurpose HOOK');
    assert.ok(hookScene.hookVisualIntent?.length > 0, 'la escena HOOK real trae hookVisualIntent real');
    assert.match(hookScene.hookVisualIntent, new RegExp(CREATIVE_VARIANT_REAL.copy.hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const nonHookScenes = strategy.sceneVisuals.filter((s) => s.narrativePurpose !== 'HOOK');
    for (const s of nonHookScenes) {
      assert.equal(s.hookVisualIntent, undefined, `escena "${s.sceneId}" real (${s.narrativePurpose}) NO debe traer hookVisualIntent real`);
    }
  });

  test('generatedPrompt real de la escena HOOK incluye el ángulo creativo real y el hook real (Paso 26 del encargo)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: null, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: INSTRUCCION_MUJER_OFICINA,
    });
    const hookScene = strategy.sceneVisuals.find((s) => s.narrativePurpose === 'HOOK');
    assert.match(hookScene.visualPrompt, /Agitaci[oó]n del problema/);
    assert.match(hookScene.visualPrompt, new RegExp(CREATIVE_VARIANT_REAL.copy.hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('backward compatibility real: sin userInstruction, visualIntent real preserva el cálculo preexistente (nunca angle/hook)', () => {
    const scenePlan = realScenePlan([]);
    const strategy = buildVisualStrategy({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productFacts: PRODUCT_FACTS_REAL,
      productRawAssets: [], scenePlan, variantIndex: 0, userInstruction: null,
    });
    assert.doesNotMatch(strategy.visualIntent, /Agitaci[oó]n del problema/);
    for (const s of strategy.sceneVisuals) {
      assert.equal(s.hookVisualIntent, undefined);
    }
  });
});
