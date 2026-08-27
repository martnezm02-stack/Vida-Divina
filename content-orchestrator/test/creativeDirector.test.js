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
