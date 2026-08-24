import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLearningHypothesis } from '../src/learningHypothesis.js';

function base(overrides = {}) {
  return {
    dimension: 'HOOK_TYPE', hypothesis: 'Probar más contenidos con hook interrogativo podría mejorar completion_rate respecto al baseline actual.',
    based_on_insight_id: 'insight-1', testable_prediction: 'Si se publican 5 posts adicionales con hook interrogativo, se espera que su completion_rate mediano sea ABOVE_BASELINE respecto al corpus actual.',
    ...overrides,
  };
}

describe('LearningHypothesis — nunca presentada como hecho (§7)', () => {
  test('crea una hipótesis válida con basis HIPOTESIS y requires_human_review=true', () => {
    const hyp = createLearningHypothesis(base());
    assert.equal(hyp.basis, 'HIPOTESIS');
    assert.equal(hyp.requires_human_review, true);
  });

  test('exige testable_prediction — sin ella no podría comprobarse después', () => {
    assert.throws(() => createLearningHypothesis(base({ testable_prediction: undefined })));
  });

  test('exige based_on_insight_id — toda hipótesis debe originarse en un insight real, nunca aparecer sin fuente', () => {
    assert.throws(() => createLearningHypothesis(base({ based_on_insight_id: undefined })));
  });

  test('rechaza lenguaje causal tanto en "hypothesis" como en "testable_prediction"', () => {
    assert.throws(() => createLearningHypothesis(base({ hypothesis: 'El hook interrogativo causa más ventas.' })));
    assert.throws(() => createLearningHypothesis(base({ testable_prediction: 'Esto garantiza mejor completion_rate.' })));
  });
});
