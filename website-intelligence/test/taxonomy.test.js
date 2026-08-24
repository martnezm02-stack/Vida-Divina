import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, isValidDimension, MARKETING_INTELLIGENCE_DIMENSIONS } from '../src/taxonomy.js';

describe('taxonomy — Website Intelligence', () => {
  test('define exactamente 8 dimensiones, tras eliminar LANDING_STRUCTURE y CONTENT_HIERARCHY por redundantes', () => {
    assert.equal(DIMENSIONS.length, 8);
    assert.ok(!DIMENSIONS.includes('LANDING_STRUCTURE'));
    assert.ok(!DIMENSIONS.includes('CONTENT_HIERARCHY'));
  });

  test('isValidDimension distingue válidas de inventadas', () => {
    assert.equal(isValidDimension('PAGE_STRUCTURE'), true);
    assert.equal(isValidDimension('ALGO_INVENTADO'), false);
  });

  test('ausencia de duplicación: ninguna dimensión de Website Intelligence coincide con una de Marketing Intelligence', () => {
    for (const dim of DIMENSIONS) {
      assert.ok(!MARKETING_INTELLIGENCE_DIMENSIONS.includes(dim), `${dim} duplica una dimensión que ya existe en marketing-intelligence`);
    }
  });
});
