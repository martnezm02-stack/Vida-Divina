import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHypothesis, validateHypothesis, renderHypothesisStatementEN, renderHypothesisStatementES } from '../src/hypothesis.js';

function baseArgs(overrides = {}) {
  return {
    creativeCellId: 'cell-123',
    targetPersona: 'Madre trabajadora con digestión lenta',
    awareness: 'Problem Aware',
    angle: 'La hinchazón después de comer no es normal',
    format: 'Pharmacist / authority figure in-studio',
    expectedOutcome: 'mayor tasa de guardado y comentarios preguntando por el producto',
    mechanism: 'reencuadrar un síntoma normalizado como señal real genera curiosidad urgente',
    ...overrides,
  };
}

describe('Hypothesis — Prompt 9', () => {
  test('crea una Hypothesis válida, marcada explícitamente type: HYPOTHESIS', () => {
    const h = createHypothesis(baseArgs());
    assert.equal(h.type, 'HYPOTHESIS');
    assert.ok(h.hypothesisId);
  });

  test('una hypothesis NO es un result — rechaza si se cuela un campo de resultado medido', () => {
    assert.throws(() => createHypothesis(baseArgs({ result: 'funcionó' })), /nunca es un resultado/);
    assert.throws(() => createHypothesis(baseArgs({ actualOutcome: '1000 reach' })));
    assert.throws(() => createHypothesis(baseArgs({ performanceSnapshotId: 'snap-1' })));
  });

  test('exige mechanism y expectedOutcome — nunca una hipótesis sin "because"', () => {
    assert.throws(() => createHypothesis(baseArgs({ mechanism: '' })), /mechanism/);
    assert.throws(() => createHypothesis(baseArgs({ expectedOutcome: '' })), /expectedOutcome/);
  });

  test('validateHypothesis revalida un objeto ya construido', () => {
    assert.equal(validateHypothesis(createHypothesis(baseArgs())), true);
  });

  test('renderHypothesisStatementEN produce la fórmula exacta del framework', () => {
    const statement = renderHypothesisStatementEN(createHypothesis(baseArgs()));
    assert.match(statement, /^If we ship .+ in .+ targeting .+ at .+, we expect .+ because .+\.$/);
  });

  test('renderHypothesisStatementES produce la variante en español dada en esta fase', () => {
    const statement = renderHypothesisStatementES(createHypothesis(baseArgs()), { concepto: 'un carrete de autoridad farmacéutica', pain: 'hinchazón normalizada' });
    assert.match(statement, /^Si producimos .+ para .+, utilizando .+ y .+ en .+ para .+, esperamos .+ porque .+\.$/);
  });
});
