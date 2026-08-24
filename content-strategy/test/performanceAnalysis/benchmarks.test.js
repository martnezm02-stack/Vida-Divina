import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeBenchmarkStats, buildBenchmarks, MIN_BASELINE_SAMPLE_SIZE } from '../../src/performanceAnalysis/benchmarks.js';

describe('computeBenchmarkStats', () => {
  test('menos del mínimo de muestra -- INSUFFICIENT_DATA explícito, nunca calcula estadísticas débiles', () => {
    const r = computeBenchmarkStats([1, 2]);
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.match(r.reason, new RegExp(String(MIN_BASELINE_SAMPLE_SIZE)));
  });

  test('mediana/percentiles/mean/max con muestra suficiente', () => {
    const r = computeBenchmarkStats([10, 20, 30, 40, 50]);
    assert.equal(r.status, 'OK');
    assert.equal(r.sample_size, 5);
    assert.equal(r.median, 30);
    assert.equal(r.mean, 30);
    assert.equal(r.max, 50);
    assert.equal(r.min, 10);
    assert.ok(r.p25 <= r.median && r.median <= r.p75);
  });
});

describe('buildBenchmarks', () => {
  test('separa por plataforma y, dentro de cada una, por groupKey (formato) cuando alcanza el mínimo', () => {
    const entries = [
      ...Array(5).fill(0).map((_, i) => ({ platform: 'instagram', groupKey: 'image', value: 10 + i })),
      ...Array(2).fill(0).map((_, i) => ({ platform: 'instagram', groupKey: 'video', value: 100 + i })), // insuficiente
      ...Array(5).fill(0).map((_, i) => ({ platform: 'facebook', groupKey: 'image', value: 5 + i })),
    ];
    const result = buildBenchmarks(entries);
    assert.equal(result.instagram.overall.status, 'OK');
    assert.equal(result.instagram.overall.sample_size, 7);
    assert.equal(result.instagram.byGroup.image.status, 'OK');
    assert.equal(result.instagram.byGroup.video.status, 'INSUFFICIENT_DATA');
    assert.equal(result.facebook.overall.status, 'OK');
    assert.equal(result.facebook.byGroup.image.status, 'OK');
  });
});
