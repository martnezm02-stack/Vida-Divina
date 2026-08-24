import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceObservation, normalizeMetric, NOT_AVAILABLE } from '../src/performanceObservation.js';

function base(overrides = {}) {
  return {
    content_id: 'content-1', platform: 'instagram', metric: 'views', value: 1000,
    observed_at: '2026-08-05T00:00:00Z', confidence: 0.9, confidence_basis: 'dato directo de la plataforma', source: 'synthetic_fixture',
    ...overrides,
  };
}

describe('PerformanceObservation — contrato válido', () => {
  test('crea una observación válida con basis OBSERVADO y requires_human_review=true', () => {
    const obs = createPerformanceObservation(base());
    assert.equal(obs.basis, 'OBSERVADO');
    assert.equal(obs.requires_human_review, true);
  });

  test('rechaza métrica no soportada', () => {
    assert.throws(() => createPerformanceObservation(base({ metric: 'sentiment_score' })));
  });

  test('rechaza "source" inválido — todo dato debe declararse real o sintético explícitamente', () => {
    assert.throws(() => createPerformanceObservation(base({ source: 'guessed' })));
  });

  test('source correcto se preserva exactamente ("platform_observed" vs "synthetic_fixture")', () => {
    const real = createPerformanceObservation(base({ source: 'platform_observed' }));
    const synthetic = createPerformanceObservation(base({ source: 'synthetic_fixture' }));
    assert.equal(real.source, 'platform_observed');
    assert.equal(synthetic.source, 'synthetic_fixture');
  });
});

describe('PerformanceObservation — métrica ausente NUNCA es cero (§2)', () => {
  test('acepta NOT_AVAILABLE como value explícito, distinto de 0', () => {
    const obs = createPerformanceObservation(base({ value: NOT_AVAILABLE }));
    assert.equal(obs.value, NOT_AVAILABLE);
    assert.notEqual(obs.value, 0);
  });

  test('rechaza cualquier value que no sea número real ni el sentinel NOT_AVAILABLE (nunca null/undefined silencioso)', () => {
    assert.throws(() => createPerformanceObservation(base({ value: null })));
    assert.throws(() => createPerformanceObservation(base({ value: undefined })));
    assert.throws(() => createPerformanceObservation(base({ value: 'n/a' })));
  });

  test('un OBSERVADO=0 real sigue siendo válido y distinguible de NOT_AVAILABLE', () => {
    const zeroObs = createPerformanceObservation(base({ value: 0 }));
    assert.equal(zeroObs.value, 0);
    assert.notEqual(zeroObs.value, NOT_AVAILABLE);
  });
});

describe('normalizeMetric — sin inventar equivalencias (§3)', () => {
  test('mapea instagram "plays" a normalized_metric "views" con método explícito', () => {
    const n = normalizeMetric({ platform: 'instagram', metric: 'plays', value: 500 });
    assert.equal(n.normalized_metric, 'views');
    assert.equal(n.normalization_method, 'platform_plays_as_views');
    assert.equal(n.raw_metric, 'plays');
  });

  test('sin mapeo confiable, normalized_metric es null y el método lo declara explícitamente', () => {
    const n = normalizeMetric({ platform: 'facebook', metric: 'reactions', value: 10 });
    assert.equal(n.normalized_metric, null);
    assert.equal(n.normalization_method, 'no_confident_mapping');
  });
});
