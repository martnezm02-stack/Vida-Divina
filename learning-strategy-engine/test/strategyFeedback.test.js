import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createStrategyFeedback } from '../src/strategyFeedback.js';

function validFields(overrides = {}) {
  return {
    learningId: 'lr-1', recommendation: 'Evaluar mayor proporción de este formato en futuras estrategias.',
    rationale: 'Existe una señal para priorizar este formato.', evidence: { scope: 'x', evidenceCount: 8 },
    confidence: 'HIGH', affectedPlatform: 'instagram', affectedFormat: 'video', expectedDirection: 'IMPROVE',
    ...overrides,
  };
}

describe('StrategyFeedback — contrato (Fase 13/14)', () => {
  test('requiere learningId/recommendation/rationale/evidence', () => {
    for (const field of ['learningId', 'recommendation', 'rationale', 'evidence']) {
      const fields = validFields();
      delete fields[field];
      assert.throws(() => createStrategyFeedback(fields), new RegExp(field));
    }
  });

  test('status por defecto PROPOSED -- nunca se auto-aprueba (§13)', () => {
    const sf = createStrategyFeedback(validFields());
    assert.equal(sf.status, 'PROPOSED');
  });

  test('rechaza status inválido y expectedDirection inválida', () => {
    assert.throws(() => createStrategyFeedback(validFields({ status: 'AUTO_APPLIED' })), /status/);
    assert.throws(() => createStrategyFeedback(validFields({ expectedDirection: 'GUARANTEED' })), /expectedDirection/);
  });

  test('rechaza lenguaje causal en recommendation/rationale', () => {
    assert.throws(() => createStrategyFeedback(validFields({ recommendation: 'Esto garantiza más ventas.' })), /causal/);
    assert.throws(() => createStrategyFeedback(validFields({ rationale: 'El formato causa el resultado.' })), /causal/);
  });

  test('estructura WHAT/WHY/EVIDENCE/CONFIDENCE/SCOPE/EXPECTED_DIRECTION completa y explicable', () => {
    const sf = createStrategyFeedback(validFields());
    assert.equal(sf.recommendation, validFields().recommendation); // WHAT
    assert.equal(sf.rationale, validFields().rationale); // WHY
    assert.deepEqual(sf.evidence, validFields().evidence); // EVIDENCE
    assert.equal(sf.confidence, 'HIGH'); // CONFIDENCE
    assert.equal(sf.affectedPlatform, 'instagram'); // SCOPE
    assert.equal(sf.expectedDirection, 'IMPROVE'); // EXPECTED_DIRECTION
  });
});
