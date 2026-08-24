import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentExperiment } from '../src/contentExperiment.js';

function base(overrides = {}) {
  return { variable: 'hook', control: 'statement', variant: 'question', success_metric: 'completion_rate', expected_signal: 'ABOVE_BASELINE', ...overrides };
}

describe('ContentExperiment — UNA sola variable principal (§4)', () => {
  test('crea un experimento válido', () => {
    const exp = createContentExperiment(base());
    assert.equal(exp.variable, 'hook');
    assert.equal(exp.status, 'PROPOSED');
    assert.equal(exp.requires_human_review, true);
  });

  test('rechaza control === variant — no hay experimento si no cambia nada', () => {
    assert.throws(() => createContentExperiment(base({ control: 'question', variant: 'question' })));
  });

  test('rechaza expected_signal inválido (reutiliza el enum real de performance-learning-intelligence)', () => {
    assert.throws(() => createContentExperiment(base({ expected_signal: 'VIRAL' })));
  });

  test('variable debe ser un único string, nunca un arreglo de variables', () => {
    assert.throws(() => createContentExperiment(base({ variable: ['hook', 'format'] })));
  });
});
