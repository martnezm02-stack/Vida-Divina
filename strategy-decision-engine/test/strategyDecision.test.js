import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createStrategyDecision, DECISIONS, EXECUTION_STATUSES } from '../src/strategyDecision.js';

function validFields(overrides = {}) {
  return {
    strategyFeedbackId: 'sf-1', decision: 'ACCEPT', decisionReason: 'La recomendación cumple evidencia mínima.',
    evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' }, confidence: 'HIGH', evidenceCount: 12,
    scope: 'instagram:format=video (N=12)', scopeType: 'FORMAT', expectedImpact: 'MEDIUM', risk: 'LOW',
    ...overrides,
  };
}

describe('StrategyDecision — contrato (Fase 2/3)', () => {
  test('decision debe ser ACCEPT/REJECT/DEFER', () => {
    assert.deepEqual(DECISIONS, ['ACCEPT', 'REJECT', 'DEFER']);
    assert.throws(() => createStrategyDecision(validFields({ decision: 'MAYBE' })), /decision/);
  });

  test('executionStatus fijo en NOT_EXECUTED -- estructuralmente imposible crear otro valor en esta fase (§17/§25/§29)', () => {
    assert.deepEqual(EXECUTION_STATUSES, ['NOT_EXECUTED']);
    const d = createStrategyDecision(validFields());
    assert.equal(d.executionStatus, 'NOT_EXECUTED');
    assert.throws(() => createStrategyDecision(validFields({ executionStatus: 'EXECUTED' })), /executionStatus/);
  });

  test('REJECT exige contradictions o supersedes reales -- nunca por datos insuficientes (Fase 15)', () => {
    assert.throws(() => createStrategyDecision(validFields({ decision: 'REJECT', contradictions: [] })), /REJECT/);
    assert.doesNotThrow(() => createStrategyDecision(validFields({ decision: 'REJECT', contradictions: [{ learningId: 'x' }] })));
    assert.doesNotThrow(() => createStrategyDecision(validFields({ decision: 'REJECT', supersedes: 'prior-id' })));
  });

  test('rechaza lenguaje causal en decisionReason', () => {
    assert.throws(() => createStrategyDecision(validFields({ decisionReason: 'Este formato causa mejores resultados.' })), /causal/);
  });

  test('scopeType debe ser uno de los 6 valores mínimos', () => {
    assert.throws(() => createStrategyDecision(validFields({ scopeType: 'REGION' })), /scopeType/);
  });

  test('confidence reutiliza HIGH/MEDIUM/LOW/UNKNOWN (Fase 6, sin segundo modelo)', () => {
    assert.throws(() => createStrategyDecision(validFields({ confidence: 'CERTAIN' })), /confidence/);
  });

  test('id/createdAt reales, objeto inmutable, status ACTIVE por defecto', () => {
    const d = createStrategyDecision(validFields());
    assert.ok(d.id);
    assert.ok(d.createdAt);
    assert.equal(d.status, 'ACTIVE');
    assert.throws(() => { d.decision = 'REJECT'; }, TypeError);
  });
});
