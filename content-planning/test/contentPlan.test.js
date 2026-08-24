import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createContentPlan, EXECUTION_MODES, CONTENT_PLAN_STATUSES, DEFAULT_EXECUTION_MODE } from '../src/contentPlan.js';

describe('ContentPlan — contrato (Fase 2)', () => {
  test('executionMode por defecto es PREPARE_ONLY (el más seguro)', () => {
    assert.equal(DEFAULT_EXECUTION_MODE, 'PREPARE_ONLY');
    const plan = createContentPlan({ strategyDecisionIds: [], status: 'PLANNED' });
    assert.equal(plan.executionMode, 'PREPARE_ONLY');
  });

  test('rechaza executionMode/status inválidos', () => {
    assert.throws(() => createContentPlan({ strategyDecisionIds: [], status: 'PLANNED', executionMode: 'MAGIC' }), /executionMode/);
    assert.throws(() => createContentPlan({ strategyDecisionIds: [], status: 'MADE_UP' }), /status/);
  });

  test('exactamente 3 modos de ejecución, AUTO_PUBLISH incluido pero nunca por defecto', () => {
    assert.deepEqual(EXECUTION_MODES, ['PREPARE_ONLY', 'HUMAN_REVIEW', 'AUTO_PUBLISH']);
  });

  test('vocabulario de estados incluye los estados de fallo explícitos (Fase 20)', () => {
    for (const s of ['QUALITY_FAILED', 'FAILED_GENERATION', 'MEDIA_HOSTING_FAILED', 'PUBLISH_FAILED', 'AUTO_PUBLISH_DISABLED']) {
      assert.ok(CONTENT_PLAN_STATUSES.includes(s));
    }
  });

  test('strategyDecisionIds debe ser un arreglo (vacío permitido -- sin StrategyContext aplicable es válido)', () => {
    assert.throws(() => createContentPlan({ strategyDecisionIds: null, status: 'PLANNED' }), /strategyDecisionIds/);
    assert.doesNotThrow(() => createContentPlan({ strategyDecisionIds: [], status: 'PLANNED' }));
  });

  test('id/createdAt reales, objeto inmutable', () => {
    const plan = createContentPlan({ strategyDecisionIds: ['d1'], status: 'READY_FOR_REVIEW' });
    assert.ok(plan.id);
    assert.ok(plan.createdAt);
    assert.throws(() => { plan.status = 'PUBLISHED'; }, TypeError);
  });
});
