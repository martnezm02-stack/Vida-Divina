import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AWARENESS_STAGES, isValidAwarenessStage, assertValidAwarenessStage } from '../src/awareness.js';

describe('awareness — Pillar 3, principio central', () => {
  test('son exactamente los 5 stages del framework, en orden', () => {
    assert.deepEqual(AWARENESS_STAGES, ['Unaware', 'Problem Aware', 'Solution Aware', 'Product Aware', 'Most Aware']);
  });

  test('isValidAwarenessStage rechaza valores fuera de los 5 fijos', () => {
    assert.equal(isValidAwarenessStage('Unaware'), true);
    assert.equal(isValidAwarenessStage('Confused'), false);
    assert.equal(isValidAwarenessStage('mindset:analytical'), false);
  });

  test('assertValidAwarenessStage lanza para un valor inválido', () => {
    assert.throws(() => assertValidAwarenessStage('Curious'));
  });
});
