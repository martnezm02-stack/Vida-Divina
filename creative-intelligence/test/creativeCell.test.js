import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCreativeCell, validateCreativeCell, attachHypothesis, evaluateStarringCriteria } from '../src/creativeCell.js';
import { createHypothesis } from '../src/hypothesis.js';

function baseArgs(overrides = {}) {
  return {
    personaId: 'persona-123',
    painId: 'pain-456',
    awareness: 'Problem Aware',
    angleId: 'angle-789',
    formatId: 'format-abc',
    mechanism: 'reencuadrar síntoma normalizado como señal real',
    ...overrides,
  };
}

describe('CreativeCell validation — Pillar 5 synthesis', () => {
  test('crea una CreativeCell válida, sin hypothesisId todavía (no es un anuncio)', () => {
    const cell = createCreativeCell(baseArgs());
    assert.ok(cell.creativeCellId);
    assert.equal(cell.hypothesisId, null);
    assert.equal(cell.priority, 'UNKNOWN');
  });

  test('rechaza sin awareness válido', () => {
    assert.throws(() => createCreativeCell(baseArgs({ awareness: 'Curious' })));
  });

  test('rechaza priority fuera del enum', () => {
    assert.throws(() => createCreativeCell(baseArgs({ priority: 'super_urgent' })));
  });

  test('validateCreativeCell revalida un objeto ya construido', () => {
    assert.equal(validateCreativeCell(createCreativeCell(baseArgs())), true);
  });

  test('attachHypothesis vincula solo una Hypothesis que realmente pertenece a esta celda', () => {
    const cell = createCreativeCell(baseArgs());
    const hypothesis = createHypothesis({
      creativeCellId: cell.creativeCellId,
      targetPersona: 'x', awareness: 'Problem Aware', angle: 'x', format: 'x',
      expectedOutcome: 'x', mechanism: 'x',
    });
    const updated = attachHypothesis(cell, hypothesis);
    assert.equal(updated.hypothesisId, hypothesis.hypothesisId);
  });

  test('attachHypothesis rechaza una Hypothesis de otra celda', () => {
    const cell = createCreativeCell(baseArgs());
    const foreignHypothesis = createHypothesis({
      creativeCellId: 'otra-celda-999',
      targetPersona: 'x', awareness: 'Problem Aware', angle: 'x', format: 'x',
      expectedOutcome: 'x', mechanism: 'x',
    });
    assert.throws(() => attachHypothesis(cell, foreignHypothesis));
  });

  test('evaluateStarringCriteria cuenta los criterios cumplidos del Prompt 9, sin decidir automáticamente', () => {
    const result = evaluateStarringCriteria({
      hasHighestVerbatimSourceMatch: true,
      hasStructurallyDistinctFormat: true,
      isNewEntityId: false,
      isUnderservedPersona: true,
      isFastExecutableFormat: false,
    });
    assert.equal(result.count, 3);
    assert.deepEqual(result.criteriaMet, ['highest_verbatim_source_match', 'structurally_distinct_format', 'underserved_persona']);
  });
});
