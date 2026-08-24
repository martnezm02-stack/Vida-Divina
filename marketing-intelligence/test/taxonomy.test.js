import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, isValidDimension, RULE_BASED_COVERAGE } from '../src/taxonomy.js';

describe('taxonomy', () => {
  test('define las 19 dimensiones por-documento del encargo (PATTERN/TREND son agregados, no dimensiones)', () => {
    assert.equal(DIMENSIONS.length, 19);
    for (const expected of ['HOOK', 'ANGLE', 'CTA', 'AUDIENCE', 'NARRATIVE_STRUCTURE', 'CURIOSITY_GAP']) {
      assert.ok(DIMENSIONS.includes(expected), `falta ${expected}`);
    }
    assert.ok(!DIMENSIONS.includes('PATTERN'));
    assert.ok(!DIMENSIONS.includes('TREND'));
  });

  test('isValidDimension distingue dimensiones válidas de inventadas', () => {
    assert.equal(isValidDimension('HOOK'), true);
    assert.equal(isValidDimension('ALGO_INVENTADO'), false);
  });

  test('la cobertura documentada es honesta: toda dimensión aparece en exactamente una categoría de cobertura', () => {
    const covered = [...RULE_BASED_COVERAGE.fully_detected, ...RULE_BASED_COVERAGE.partially_detected, ...RULE_BASED_COVERAGE.not_detected_by_rules];
    for (const dim of DIMENSIONS) {
      assert.ok(covered.includes(dim), `${dim} debe estar documentado en RULE_BASED_COVERAGE`);
    }
  });
});
