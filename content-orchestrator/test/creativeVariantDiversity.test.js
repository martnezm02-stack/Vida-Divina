// creativeVariantDiversity.test.js — Corrección "Cierre del Creative
// Director" (2026-08-28). Cobertura real determinista de diversityScore.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiversityScore } from '../src/creativeVariantDiversity.js';

function v({ angle, hookType, hook, structure = 'S1', treatment = 'T1' }) {
  return { primaryAngle: { id: angle }, hookType: { id: hookType }, hook, structureId: structure, visualTreatment: treatment };
}

describe('computeDiversityScore', () => {
  test('DIVERSO real: ángulos/hooks/tipos distintos -> diversityScore real alto', () => {
    const variants = [
      v({ angle: 'routine', hookType: 'story', hook: 'Hook uno real.' }),
      v({ angle: 'aspiration', hookType: 'contrarian', hook: 'Hook dos real.' }),
      v({ angle: 'mechanism', hookType: 'curiosity', hook: 'Hook tres real.' }),
    ];
    const r = computeDiversityScore(variants);
    assert.ok(r.diversityScore > 0.7, `diversityScore real ${r.diversityScore} debía ser alto`);
    assert.equal(r.distinctAngles, 3);
    assert.equal(r.distinctHookTypes, 3);
  });

  test('DUPLICADO EXACTO real: mismo hook literal repetido -> exactDuplicateHooks real > 0, diversityScore real bajo', () => {
    const variants = [
      v({ angle: 'routine', hookType: 'question', hook: '¿Tienes una rutina consistente?' }),
      v({ angle: 'routine', hookType: 'question', hook: '¿Tienes una rutina consistente?' }),
    ];
    const r = computeDiversityScore(variants);
    assert.equal(r.exactDuplicateHooks, 1);
    assert.ok(r.diversityScore <= 0.5, `diversityScore real ${r.diversityScore} debía quedar en el piso real de un par 100% duplicado`);
  });

  test('DUPLICADO NORMALIZADO real: mismo hook con signos de puntuación distintos cuenta como duplicado real', () => {
    const variants = [
      v({ angle: 'routine', hookType: 'question', hook: '¿Tienes una rutina consistente?' }),
      v({ angle: 'routine', hookType: 'question', hook: 'Tienes una rutina consistente' }),
    ];
    const r = computeDiversityScore(variants);
    assert.equal(r.exactDuplicateHooks, 1);
  });

  test('UNA sola variante real: diversityScore real = 1 (nada que comparar)', () => {
    const r = computeDiversityScore([v({ angle: 'routine', hookType: 'story', hook: 'x' })]);
    assert.equal(r.diversityScore, 1);
  });

  test('rechaza sin variantes reales', () => {
    assert.throws(() => computeDiversityScore([]), /variants/);
  });
});
