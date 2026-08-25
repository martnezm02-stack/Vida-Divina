// scenePlanner.test.js — Creative Production Orchestrator (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoScript } from '../src/videoScriptGenerator.js';
import { buildScenePlan } from '../src/scenePlanner.js';

const COPY_REAL = {
  hook: '¿vitalidad y confianza masculina?',
  bodyLines: [
    '¿Te ha pasado? baja vitalidad y confianza en el desempeño diario.',
    'Café Divina Sculpt Black incluye 70 mg Reishi, L-Carnitina.',
    'Beneficia el sistema inmune; control del peso; antioxidante.',
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

const PRODUCT_ASSETS_REAL = [
  { assetId: 'a1', sourcePath: 'C:/assets/sculpt-black.png', role: 'PRODUCT_PRIMARY' },
];

const CAMPAIGN_INTENT_REAL = {
  targetAudience: 'hombres adultos', problemOrNeed: 'baja vitalidad y confianza en el desempeño diario', campaignTerritory: 'vitalidad y confianza masculina',
};

function realScript() {
  return buildVideoScript(COPY_REAL);
}

describe('buildScenePlan — Script real -> Scene Plan real', () => {
  test('rechaza un videoScript no aplicable (formato estático)', () => {
    const staticScript = buildVideoScript({ ...COPY_REAL, format: 'Static comparison frames' });
    assert.throws(() => buildScenePlan({ videoScript: staticScript }), /aplicable/);
  });

  test('produce una escena real por cada sección real del Script (hook + 3 body + cta = 5)', () => {
    const plan = buildScenePlan({ videoScript: realScript(), productRawAssets: PRODUCT_ASSETS_REAL, campaignIntent: CAMPAIGN_INTENT_REAL });
    assert.equal(plan.scenes.length, 5);
    assert.equal(plan.scenes[0].sectionType, 'HOOK');
    assert.equal(plan.scenes[plan.scenes.length - 1].sectionType, 'CTA');
  });

  test('NO todas las escenas muestran el producto -- solo mechanism/productReveal (Paso 3, regla no negociable)', () => {
    const plan = buildScenePlan({ videoScript: realScript(), productRawAssets: PRODUCT_ASSETS_REAL, campaignIntent: CAMPAIGN_INTENT_REAL });
    assert.equal(plan.allScenesShowProduct, false);
    const productScenes = plan.scenes.filter((s) => s.visualType === 'PRODUCT_ASSET');
    const typographicScenes = plan.scenes.filter((s) => s.visualType === 'TYPOGRAPHIC');
    assert.ok(productScenes.length > 0);
    assert.ok(typographicScenes.length > 0);
    assert.equal(plan.scenes.find((s) => s.sectionType === 'HOOK').visualType, 'TYPOGRAPHIC');
    assert.equal(plan.scenes.find((s) => s.sectionType === 'mechanism' || s.sectionType === 'PRODUCT_MECHANISM')?.visualType ?? 'TYPOGRAPHIC', productScenes[0]?.visualType ?? 'TYPOGRAPHIC');
  });

  test('sin productRawAssets reales: ninguna escena real puede ser PRODUCT_ASSET (nunca inventa un asset)', () => {
    const plan = buildScenePlan({ videoScript: realScript(), productRawAssets: [], campaignIntent: CAMPAIGN_INTENT_REAL });
    assert.ok(plan.scenes.every((s) => s.visualType === 'TYPOGRAPHIC'));
  });

  test('visualPrompt de escenas sin producto incorpora el territorio real de campaña', () => {
    const plan = buildScenePlan({ videoScript: realScript(), productRawAssets: [], campaignIntent: CAMPAIGN_INTENT_REAL });
    const hookScene = plan.scenes.find((s) => s.sectionType === 'HOOK');
    assert.match(hookScene.visualPrompt, /vitalidad y confianza masculina/);
  });

  test('duraciones de escena suman la duración total real del Script (mismo criterio de allocateTiming ya validado)', () => {
    const script = realScript();
    const plan = buildScenePlan({ videoScript: script, productRawAssets: PRODUCT_ASSETS_REAL });
    const sumaReal = plan.scenes.reduce((s, sc) => s + sc.duration, 0);
    assert.ok(Math.abs(sumaReal - script.estimatedDurationSeconds) < 0.1);
  });
});
