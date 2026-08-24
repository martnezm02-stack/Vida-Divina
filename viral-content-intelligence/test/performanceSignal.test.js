import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceSignalObservation } from '../src/performanceSignal.js';

function metrics(overrides = {}) {
  return { views: 474512, views_available: true, views_reason: 'x', likes: null, likes_available: false, ...overrides };
}

describe('PerformanceSignal — separación estricta de las dimensiones de marketing', () => {
  test('dimension es SIEMPRE literalmente "PERFORMANCE_SIGNAL", nunca un valor de taxonomy.DIMENSIONS', async () => {
    const obs = createPerformanceSignalObservation({ raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'views', metrics: metrics() });
    assert.equal(obs.dimension, 'PERFORMANCE_SIGNAL');

    const { DIMENSIONS } = await import('../../marketing-intelligence/src/taxonomy.js');
    assert.ok(!DIMENSIONS.includes('PERFORMANCE_SIGNAL'), 'PERFORMANCE_SIGNAL nunca debe agregarse a taxonomy.DIMENSIONS de marketing-intelligence');
    assert.ok(!DIMENSIONS.includes(obs.dimension));
  });

  test('metric_value contiene el número real observado, value contiene el TIPO de métrica', () => {
    const obs = createPerformanceSignalObservation({ raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'views', metrics: metrics() });
    assert.equal(obs.value, 'views');
    assert.equal(obs.metric_value, 474512);
  });

  test('requires_human_review es siempre true — nunca se promueve a hecho de negocio automáticamente', () => {
    const obs = createPerformanceSignalObservation({ raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'views', metrics: metrics() });
    assert.equal(obs.requires_human_review, true);
    assert.equal(obs.basis, 'OBSERVADO');
  });
});

describe('PerformanceSignal — nunca inventa un número', () => {
  test('rechaza si la métrica no fue observada de forma verificable (views_available=false)', () => {
    assert.throws(() => createPerformanceSignalObservation({
      raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'views',
      metrics: { views: null, views_available: false },
    }));
  });

  test('rechaza métricas no soportadas en este piloto (ej. likes)', () => {
    assert.throws(() => createPerformanceSignalObservation({
      raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'likes',
      metrics: { likes: 100, likes_available: true },
    }));
  });

  test('rechaza sin raw_id — nunca una señal sin fuente trazable', () => {
    assert.throws(() => createPerformanceSignalObservation({ url: 'https://youtube.com/watch?v=x', metricName: 'views', metrics: metrics() }));
  });
});
