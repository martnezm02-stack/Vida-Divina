import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLatestMetrics, metricValue } from '../../src/performanceAnalysis/metricsNormalizer.js';
import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';

describe('normalizeLatestMetrics', () => {
  test('toma la observación MÁS RECIENTE por métrica, no la última insertada', () => {
    const obs = [
      { content_id: 'c1', metric: 'likes', value: 10, observed_at: '2026-08-01T00:00:00Z', source: 'platform_observed', confidence: 0.9 },
      { content_id: 'c1', metric: 'likes', value: 20, observed_at: '2026-08-05T00:00:00Z', source: 'platform_observed', confidence: 0.9 },
      { content_id: 'c2', metric: 'likes', value: 999, observed_at: '2026-08-09T00:00:00Z', source: 'platform_observed', confidence: 0.9 },
    ];
    const { metrics, lastUpdated } = normalizeLatestMetrics('c1', obs);
    assert.equal(metrics.likes.value, 20);
    assert.equal(lastUpdated, '2026-08-05T00:00:00Z');
  });

  test('content_id sin observaciones -- metrics vacío, lastUpdated null', () => {
    const { metrics, lastUpdated } = normalizeLatestMetrics('nunca-existio', []);
    assert.deepEqual(metrics, {});
    assert.equal(lastUpdated, null);
  });
});

describe('metricValue', () => {
  test('NOT_AVAILABLE nunca se convierte en 0', () => {
    const metrics = { shares: { value: NOT_AVAILABLE } };
    assert.equal(metricValue(metrics, 'shares'), NOT_AVAILABLE);
    assert.notEqual(metricValue(metrics, 'shares'), 0);
  });
  test('métrica ausente del todo -- también NOT_AVAILABLE', () => {
    assert.equal(metricValue({}, 'clicks'), NOT_AVAILABLE);
  });
  test('valor real 0 se preserva tal cual (distinto de ausencia)', () => {
    assert.equal(metricValue({ likes: { value: 0 } }, 'likes'), 0);
  });
});
