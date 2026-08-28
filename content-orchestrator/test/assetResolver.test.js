// assetResolver.test.js — Creative Production Orchestrator (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-resolver-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { resolveSceneAsset, resolveAssetPlan } = await import('../src/assetResolver.js');
const { MockImageProvider } = await import('../../image-generation/src/providers/mockImageProvider.js');
const { MiniMaxVideoProvider } = await import('../../video-generation/src/providers/miniMaxVideoProvider.js');

const PRODUCT_SCENE = Object.freeze({
  sceneId: 'scene-2', sectionType: 'PRODUCT_MECHANISM', visualType: 'PRODUCT_ASSET', visualPrompt: 'producto real',
  assetRequirements: Object.freeze({ productImageAssetId: 'a1', productImageSourcePath: 'C:/assets/sculpt-black.png' }),
});
const CONCEPT_SCENE = Object.freeze({
  sceneId: 'scene-1', sectionType: 'HOOK', visualType: 'TYPOGRAPHIC', visualPrompt: 'vitalidad y confianza masculina',
  assetRequirements: Object.freeze({}),
});

describe('resolveSceneAsset — prioridad real (Paso 4)', () => {
  test('escena con asset de producto real -> EXISTING_PRODUCT_ASSET, sin llamar ningún provider', async () => {
    const r = await resolveSceneAsset({ scene: PRODUCT_SCENE, imageProvider: new MockImageProvider() });
    assert.equal(r.source, 'EXISTING_PRODUCT_ASSET');
    assert.equal(r.imageSourcePath, 'C:/assets/sculpt-black.png');
    assert.equal(r.isMock, false);
    // Prompt Auditable (Corrección "Crear contenido", Paso 13 del
    // encargo): sin generación real, generatedPrompt null explícito.
    assert.equal(r.generatedPrompt, null);
  });

  test('escena de concepto sin producto + solo MockImageProvider disponible -> nunca acepta el mock como visual real, cae a TYPOGRAPHIC', async () => {
    const r = await resolveSceneAsset({ scene: CONCEPT_SCENE, imageProvider: new MockImageProvider() });
    assert.equal(r.source, 'TYPOGRAPHIC');
    assert.equal(r.imageSourcePath, null);
    const intentoImagen = r.attempted.find((a) => a.source === 'GENERATED_IMAGE');
    assert.equal(intentoImagen.outcome, 'SKIPPED_MOCK_NOT_USABLE');
  });

  test('escena de concepto sin ningún provider real disponible -> TYPOGRAPHIC directo', async () => {
    const r = await resolveSceneAsset({ scene: CONCEPT_SCENE });
    assert.equal(r.source, 'TYPOGRAPHIC');
  });

  test('videoProvider real (MiniMax) sin credencial -> se reporta NOT_CONFIGURED, nunca se usa, cae a TYPOGRAPHIC', async () => {
    delete process.env.MINIMAX_API_KEY;
    const r = await resolveSceneAsset({ scene: CONCEPT_SCENE, videoProvider: new MiniMaxVideoProvider() });
    assert.equal(r.source, 'TYPOGRAPHIC');
    const intentoVideo = r.attempted.find((a) => a.source === 'GENERATED_VIDEO');
    assert.equal(intentoVideo.outcome, 'NOT_CONFIGURED');
  });
});

describe('resolveAssetPlan — plan completo real', () => {
  test('resuelve N escenas reales en orden, cada una con su propia resolución real', async () => {
    const plan = await resolveAssetPlan({ scenes: [CONCEPT_SCENE, PRODUCT_SCENE], imageProvider: new MockImageProvider() });
    assert.equal(plan.length, 2);
    assert.equal(plan[0].sceneId, 'scene-1');
    assert.equal(plan[0].source, 'TYPOGRAPHIC');
    assert.equal(plan[1].sceneId, 'scene-2');
    assert.equal(plan[1].source, 'EXISTING_PRODUCT_ASSET');
  });
});
