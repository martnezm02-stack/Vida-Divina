import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { createStrategyDecision } from '../../strategy-decision-engine/src/strategyDecision.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../performance-learning-intelligence/src/performanceSignal.js';
import { computeAutoPublishReadiness } from '../src/autoPublishReadiness.js';

function fakePublicationStore(records = []) {
  return { list: () => records };
}
function seedDecision(store, { confidence = 'HIGH' } = {}) {
  store.save('strategy_decision', createStrategyDecision({
    strategyFeedbackId: 'sf-1', decision: 'ACCEPT', decisionReason: 'x', evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' },
    confidence, evidenceCount: 12, scope: 'x', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'MEDIUM', risk: 'LOW',
  }));
}

describe('computeAutoPublishReadiness — Fase 13, Parte 12/13 (reutiliza umbrales YA existentes, nunca inventa uno nuevo)', () => {
  test('store real vacío -> NOT_READY con las 3 razones reales explícitas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apr-empty-'));
    const store = new PerformanceLearningStore(dir);
    const result = computeAutoPublishReadiness({ store, publicationStore: fakePublicationStore([]) });
    assert.equal(result.readiness, 'NOT_READY');
    assert.equal(result.reasons.length, 3);
    assert.ok(result.reasons.some((r) => r.includes('Insufficient real performance data')));
    assert.ok(result.reasons.some((r) => r.includes('Insufficient publication history')));
    assert.ok(result.reasons.some((r) => r.includes('Insufficient strategy confidence')));
    rmSync(dir, { recursive: true, force: true });
  });

  test('evidencia suficiente en las 3 capas -> READY, mensaje del encargo exacto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apr-ready-'));
    const store = new PerformanceLearningStore(dir);
    for (let i = 0; i < MIN_BASELINE_SAMPLE_SIZE; i++) {
      store.save('published_content', createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'video', topic: 'x' }));
    }
    seedDecision(store, { confidence: 'HIGH' });
    const result = computeAutoPublishReadiness({ store, publicationStore: fakePublicationStore([{ status: 'PUBLISHED' }]) });
    assert.equal(result.readiness, 'READY');
    assert.deepEqual(result.reasons, ['Required evidence and execution prerequisites satisfied.']);
    rmSync(dir, { recursive: true, force: true });
  });

  test('solo confidence MEDIUM (nunca HIGH) -- sigue NOT_READY, MEDIUM no es evidencia suficiente para este umbral', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apr-medium-'));
    const store = new PerformanceLearningStore(dir);
    for (let i = 0; i < MIN_BASELINE_SAMPLE_SIZE; i++) {
      store.save('published_content', createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'video', topic: 'x' }));
    }
    seedDecision(store, { confidence: 'MEDIUM' });
    const result = computeAutoPublishReadiness({ store, publicationStore: fakePublicationStore([{ status: 'PUBLISHED' }]) });
    assert.equal(result.readiness, 'NOT_READY');
    assert.ok(result.reasons.some((r) => r.includes('Insufficient strategy confidence')));
    rmSync(dir, { recursive: true, force: true });
  });

  test('umbral de muestra reutiliza MIN_BASELINE_SAMPLE_SIZE tal cual, sin inventar un número nuevo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apr-threshold-'));
    const store = new PerformanceLearningStore(dir);
    const result = computeAutoPublishReadiness({ store, publicationStore: fakePublicationStore([]) });
    assert.equal(result.evidence.minRequired, MIN_BASELINE_SAMPLE_SIZE);
    rmSync(dir, { recursive: true, force: true });
  });
});
