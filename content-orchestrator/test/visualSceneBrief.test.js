// visualSceneBrief.test.js — Corrección "Diversidad Visual" (2026-08-28).
// Cobertura real del builder de Visual Scene Brief por escena, aislado de
// creativeDirector.js (ver creativeDirector.test.js para la cobertura de
// integración end-to-end).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualSceneBriefs } from '../src/visualSceneBrief.js';

const CONTEXT_REAL = Object.freeze({
  subjectGender: 'female', subjectAgeRange: 'adult', subjectDescription: 'mujer adulta',
  wardrobe: 'ropa profesional / blazer neutro', environment: 'oficina moderna', characterContinuityRequired: true,
});

function scene({ sceneId, narrativeStage, visualIntent }) {
  return { sceneId, narrativeStage, visualIntent };
}

describe('buildVisualSceneBriefs', () => {
  test('B: un brief real por escena, mismo orden/longitud que "scenes"', () => {
    const scenes = [
      scene({ sceneId: 'scene-1', narrativeStage: 'HOOK', visualIntent: 'CONCEPT_OPENING' }),
      scene({ sceneId: 'scene-2', narrativeStage: 'STORY', visualIntent: 'AUDIENCE_CONTEXT' }),
      scene({ sceneId: 'scene-3', narrativeStage: 'PRODUCT', visualIntent: 'PRODUCT_REVEAL' }),
    ];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    assert.equal(briefs.length, scenes.length);
    for (const b of briefs) {
      assert.ok(b.action?.length > 0);
      assert.ok(b.narrativePurpose?.length > 0);
      assert.ok(b.shotType?.length > 0);
      assert.ok(b.cameraAngle?.length > 0);
      assert.ok(b.composition?.length > 0);
    }
  });

  test('escena PRODUCT_REVEAL real -> narrativePurpose real "PRODUCT_REVEAL", incluso si narrativeStage real NO es "PRODUCT" (alignStagesToCount puede perder esa etiqueta, Paso 3)', () => {
    const scenes = [
      scene({ sceneId: 'scene-1', narrativeStage: 'HOOK', visualIntent: 'CONCEPT_OPENING' }),
      // narrativeStage "STORY" real (alineado a 3 escenas, ver
      // creativeStructureEngine.js#alignStagesToCount) pero visualIntent
      // real SIGUE siendo PRODUCT_REVEAL (derivado de section.type, nunca
      // se pierde) -- el brief real debe priorizar visualIntent.
      scene({ sceneId: 'scene-2', narrativeStage: 'STORY', visualIntent: 'PRODUCT_REVEAL' }),
      scene({ sceneId: 'scene-3', narrativeStage: 'CTA', visualIntent: 'CTA_BRAND' }),
    ];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    assert.equal(briefs[1].narrativePurpose, 'PRODUCT_REVEAL');
    assert.match(briefs[1].action, /producto/);
  });

  test('C/I: dos escenas consecutivas reales con el MISMO narrativeStage nunca reciben el mismo action+shotType (rotación real de variante)', () => {
    const scenes = [
      scene({ sceneId: 'scene-1', narrativeStage: 'STORY', visualIntent: 'AUDIENCE_CONTEXT' }),
      scene({ sceneId: 'scene-2', narrativeStage: 'STORY', visualIntent: 'AUDIENCE_CONTEXT' }),
      scene({ sceneId: 'scene-3', narrativeStage: 'STORY', visualIntent: 'AUDIENCE_CONTEXT' }),
    ];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    for (let i = 1; i < briefs.length; i += 1) {
      const igual = briefs[i].action === briefs[i - 1].action && briefs[i].shotType === briefs[i - 1].shotType;
      assert.equal(igual, false, `escena ${i} real repite acción+encuadre de la escena ${i - 1} real (mismo narrativeStage "STORY")`);
    }
  });

  test('D: shot/composition reales varían entre HOOK/PROBLEM/PRODUCT/CTA (funciones narrativas reales distintas -> briefs reales distintos)', () => {
    const scenes = [
      scene({ sceneId: 'scene-1', narrativeStage: 'HOOK', visualIntent: 'CONCEPT_OPENING' }),
      scene({ sceneId: 'scene-2', narrativeStage: 'PROBLEM', visualIntent: 'AUDIENCE_CONTEXT' }),
      scene({ sceneId: 'scene-3', narrativeStage: 'PRODUCT', visualIntent: 'PRODUCT_REVEAL' }),
      scene({ sceneId: 'scene-4', narrativeStage: 'CTA', visualIntent: 'CTA_BRAND' }),
    ];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    const combos = briefs.map((b) => `${b.action}|${b.shotType}|${b.composition}`);
    assert.equal(new Set(combos).size, combos.length, 'cada función narrativa real produce un brief real distinto');
  });

  test('continuityConstraints real: mismo valor real para TODAS las escenas (Paso 1: contexto global heredado)', () => {
    const scenes = [
      scene({ sceneId: 'scene-1', narrativeStage: 'HOOK', visualIntent: 'CONCEPT_OPENING' }),
      scene({ sceneId: 'scene-2', narrativeStage: 'CTA', visualIntent: 'CTA_BRAND' }),
    ];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    assert.deepEqual(briefs[0].continuityConstraints, briefs[1].continuityConstraints);
    assert.ok(briefs[0].continuityConstraints.some((c) => c.includes('female')));
    assert.ok(briefs[0].continuityConstraints.some((c) => c.includes('oficina moderna')));
  });

  test('narrativeStage real desconocido/ausente -> fallback real coherente (nunca lanza, nunca "sin acción")', () => {
    const scenes = [scene({ sceneId: 'scene-1', narrativeStage: undefined, visualIntent: 'AUDIENCE_CONTEXT' })];
    const briefs = buildVisualSceneBriefs({ scenes, visualContinuityContext: CONTEXT_REAL });
    assert.ok(briefs[0].action?.length > 0);
  });
});
