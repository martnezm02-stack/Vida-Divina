import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { createStrategyDecision } from '../../strategy-decision-engine/src/strategyDecision.js';
import { isAutoPublishEligible, MAX_AUTO_PUBLISH_PER_PLATFORM_PER_DAY } from '../src/autoPublishEligibility.js';

const enabledConfig = { enabled: true, actorId: 'Manuel Martínez' };
const disabledConfig = { enabled: false, actorId: null };
const readyReadiness = { readiness: 'READY', reasons: [] };

function seedRealAcceptDecision(store, overrides = {}) {
  const decision = createStrategyDecision({
    strategyFeedbackId: 'sf-1', decision: 'ACCEPT', decisionReason: 'x', evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' },
    confidence: 'HIGH', evidenceCount: 12, scope: 'x', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'MEDIUM', risk: 'LOW',
    ...overrides,
  });
  store.save('strategy_decision', decision);
  return decision;
}

describe('isAutoPublishEligible — Fase 13, Parte 11 (determinístico, sin ML/LLM)', () => {
  let dir, store, decisionId, validPlan;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'ape-'));
    store = new PerformanceLearningStore(dir);
    decisionId = seedRealAcceptDecision(store).id;
    validPlan = (overrides = {}) => ({
      strategyDecisionIds: [decisionId], executionMode: 'AUTO_PUBLISH', status: 'READY_FOR_REVIEW',
      assetPackageId: 'req-1', publicationId: null, platform: 'INSTAGRAM_REEL', product: 'TéDivina',
      requireHumanReview: false, ...overrides,
    });
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('#1 política deshabilitada bloquea', () => {
    const r = isAutoPublishEligible(validPlan(), { store, autoPublishConfig: disabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.some((x) => x.includes('disabled')));
  });

  test('#2 executionMode distinto de AUTO_PUBLISH bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ executionMode: 'HUMAN_REVIEW' }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('#3/#4 sin StrategyDecision real asociada bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ strategyDecisionIds: ['no-existe'] }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.some((x) => x.includes('StrategyDecision')));
  });

  test('#3/#4 StrategyDecision real pero no ACCEPT bloquea', () => {
    const deferred = seedRealAcceptDecision(store, { decision: 'DEFER', confidence: 'LOW' });
    const r = isAutoPublishEligible(validPlan({ strategyDecisionIds: [deferred.id] }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.some((x) => x.includes('not ACCEPT')));
  });

  test('#6 sin AssetPackage completo bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ assetPackageId: null }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('#7 Quality Gate FAIL bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ status: 'QUALITY_FAILED' }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('#8 plataforma no soportada bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ platform: 'WHATSAPP_VIDEO' }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('#10 publicación previa ya existente bloquea (idempotencia)', () => {
    const r = isAutoPublishEligible(validPlan({ publicationId: 'ya-existe' }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('#14 HumanReview marcado REQUIRED bloquea', () => {
    const r = isAutoPublishEligible(validPlan({ requireHumanReview: true }), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, false);
  });

  test('todas las condiciones satisfechas -> eligible=true, sin razones', () => {
    const r = isAutoPublishEligible(validPlan(), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness });
    assert.equal(r.eligible, true);
    assert.deepEqual(r.reasons, []);
  });

  test('#12 rate limit por plataforma bloquea al alcanzar el máximo (Parte 21)', () => {
    const now = new Date();
    for (let i = 0; i < MAX_AUTO_PUBLISH_PER_PLATFORM_PER_DAY; i++) {
      store.save('content_plan', { id: `p${i}`, createdAt: now.toISOString(), executionMode: 'AUTO_PUBLISH', publicationId: `pub${i}`, platform: 'INSTAGRAM_REEL', product: null });
    }
    const r = isAutoPublishEligible(validPlan(), { store, autoPublishConfig: enabledConfig, readiness: readyReadiness, now });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.some((x) => x.includes('Límite de plataforma')));
  });
});
