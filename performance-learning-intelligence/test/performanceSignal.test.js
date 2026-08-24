import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeBaseline, createPerformanceSignal, MIN_BASELINE_SAMPLE_SIZE } from '../src/performanceSignal.js';
import { NOT_AVAILABLE } from '../src/performanceObservation.js';

function obs(contentId, value, overrides = {}) {
  return { content_id: contentId, platform: 'instagram', metric: 'views', value, ...overrides };
}

const contentTypeOfAllReel = () => 'reel'; // helper: todos los content_id de esta suite son "reel"

describe('Baseline — mediana con >=5 muestras (§5)', () => {
  test(`con exactamente ${MIN_BASELINE_SAMPLE_SIZE} observaciones numéricas, calcula baseline por mediana`, () => {
    const observations = [obs('c1', 10), obs('c2', 20), obs('c3', 30), obs('c4', 40), obs('c5', 50)];
    const baseline = computeBaseline({ observations, platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });
    assert.equal(baseline.insufficient, false);
    assert.equal(baseline.baseline_method, 'median');
    assert.equal(baseline.baseline_value, 30);
    assert.equal(baseline.sample_size, 5);
  });

  test('NOT_AVAILABLE nunca cuenta como 0 en la muestra del baseline (ni infla ni infla-a-la-baja la cuenta de muestras válidas)', () => {
    // 5 valores reales + 2 NOT_AVAILABLE = 7 observaciones, pero la muestra
    // válida del baseline debe ser exactamente 5 (nunca 7, nunca tratando
    // los NOT_AVAILABLE como 0).
    const observations = [obs('c1', 10), obs('c2', NOT_AVAILABLE), obs('c3', 30), obs('c4', 40), obs('c5', 50), obs('c6', 60), obs('c7', NOT_AVAILABLE)];
    const baseline = computeBaseline({ observations, platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });
    assert.equal(baseline.sample_size, 5); // solo los 5 valores numéricos reales, nunca 7
    assert.equal(baseline.insufficient, false);
    assert.equal(baseline.baseline_value, 40); // mediana de [10,30,40,50,60]
  });

  test('si excluir los NOT_AVAILABLE deja menos del mínimo, el baseline es insuficiente aunque el conteo bruto de observaciones sea >=5', () => {
    const observations = [obs('c1', 10), obs('c2', NOT_AVAILABLE), obs('c3', 30), obs('c4', NOT_AVAILABLE), obs('c5', 40)];
    const baseline = computeBaseline({ observations, platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });
    assert.equal(baseline.sample_size, 3); // solo 3 valores reales, aunque hay 5 observaciones en total
    assert.equal(baseline.insufficient, true);
    assert.equal(baseline.baseline_value, null);
  });
});

describe('Baseline — insuficiente (§5)', () => {
  test('con menos de MIN_BASELINE_SAMPLE_SIZE observaciones, no genera un baseline (insufficient=true, baseline_value=null)', () => {
    const observations = [obs('c1', 10), obs('c2', 20), obs('c3', 30)];
    const baseline = computeBaseline({ observations, platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });
    assert.equal(baseline.insufficient, true);
    assert.equal(baseline.baseline_value, null);
    assert.equal(baseline.sample_size, 3);
  });
});

describe('PerformanceSignal — signal_type (ABOVE/BELOW/NORMAL/INSUFFICIENT_DATA), nunca "viral" (§4)', () => {
  const sufficientObservations = [obs('c1', 100), obs('c2', 100), obs('c3', 100), obs('c4', 100), obs('c5', 100)];
  const baseline = computeBaseline({ observations: sufficientObservations, platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });

  test('ABOVE_BASELINE cuando el valor observado supera el umbral (+10%) sobre el baseline', () => {
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: 150, baseline });
    assert.equal(signal.signal_type, 'ABOVE_BASELINE');
    assert.ok(signal.relative_change > 0);
  });

  test('BELOW_BASELINE cuando el valor observado cae por debajo del umbral (-10%) del baseline', () => {
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: 50, baseline });
    assert.equal(signal.signal_type, 'BELOW_BASELINE');
    assert.ok(signal.relative_change < 0);
  });

  test('NORMAL cuando el valor observado está dentro del umbral del baseline', () => {
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: 102, baseline });
    assert.equal(signal.signal_type, 'NORMAL');
  });

  test('INSUFFICIENT_DATA cuando el baseline no tiene suficientes muestras', () => {
    const insufficientBaseline = computeBaseline({ observations: [obs('c1', 10)], platform: 'instagram', contentTypeOf: contentTypeOfAllReel, metric: 'views' });
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: 500, baseline: insufficientBaseline });
    assert.equal(signal.signal_type, 'INSUFFICIENT_DATA');
  });

  test('INSUFFICIENT_DATA cuando el propio valor observado es NOT_AVAILABLE', () => {
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'comments', observed_value: NOT_AVAILABLE, baseline });
    assert.equal(signal.signal_type, 'INSUFFICIENT_DATA');
  });

  test('requires_human_review es siempre true, sin importar el signal_type', () => {
    for (const observed of [150, 50, 102, NOT_AVAILABLE]) {
      const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: observed, baseline });
      assert.equal(signal.requires_human_review, true);
    }
  });

  test('ningún signal_type ni campo del contrato contiene la palabra "viral" — es una inferencia posterior, nunca observada aquí', () => {
    const signal = createPerformanceSignal({ content_id: 'c-new', metric: 'views', observed_value: 150, baseline });
    assert.doesNotMatch(JSON.stringify(signal).toLowerCase(), /viral/);
  });
});
