import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../../performance-learning-intelligence/src/store.js';
import { createPublishedContent } from '../../../performance-learning-intelligence/src/publishedContent.js';
import { createPerformanceObservation } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { analyzePerformance } from '../../src/performanceAnalysis/performanceAnalysisService.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../src/performanceAnalysis/benchmarks.js';

function seedPublication(store, { platform, format, likes, reach, externalPostId }) {
  const content = createPublishedContent({ platform, published_at: new Date().toISOString(), content_type: 'social_post', format, topic: 'x', external_post_id: externalPostId });
  store.save('published_content', content);
  store.save('performance_observation', createPerformanceObservation({ content_id: content.content_id, platform, metric: 'likes', value: likes, observed_at: new Date().toISOString(), confidence: 0.9, confidence_basis: 'test', source: 'platform_observed' }));
  store.save('performance_observation', createPerformanceObservation({ content_id: content.content_id, platform, metric: 'reach', value: reach, observed_at: new Date().toISOString(), confidence: 0.9, confidence_basis: 'test', source: 'platform_observed' }));
  return content;
}

describe('analyzePerformance', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'perf-analysis-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('store vacío -- INSUFFICIENT_DATA explícito, nunca inventa resultados', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'perf-analysis-empty-'));
    const emptyStore = new PerformanceLearningStore(emptyDir);
    const r = analyzePerformance({ store: emptyStore });
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    rmSync(emptyDir, { recursive: true, force: true });
  });

  test('con datos reales de dos plataformas: status OK, summary correcto, filtro por plataforma funciona', () => {
    for (let i = 0; i < MIN_BASELINE_SAMPLE_SIZE; i++) seedPublication(store, { platform: 'instagram', format: 'image', likes: 10 + i, reach: 100 });
    for (let i = 0; i < MIN_BASELINE_SAMPLE_SIZE; i++) seedPublication(store, { platform: 'facebook', format: 'image', likes: 3 + i, reach: 50 });

    const all = analyzePerformance({ store });
    assert.equal(all.status, 'OK');
    assert.equal(all.summary.totalPublications, MIN_BASELINE_SAMPLE_SIZE * 2);
    assert.deepEqual([...all.summary.platforms].sort(), ['facebook', 'instagram']);
    assert.ok(all.topPerformers.length > 0);
    assert.ok(all.benchmarks.likes.instagram.overall.status === 'OK');

    const igOnly = analyzePerformance({ store, platform: 'instagram' });
    assert.equal(igOnly.summary.totalPublications, MIN_BASELINE_SAMPLE_SIZE);
    assert.deepEqual(igOnly.summary.platforms, ['instagram']);
  });

  test('idempotencia: correr el análisis dos veces sobre el mismo store da el mismo resultado (solo lectura)', () => {
    const r1 = analyzePerformance({ store, platform: 'instagram' });
    const r2 = analyzePerformance({ store, platform: 'instagram' });
    assert.deepEqual(r1.summary, r2.summary);
    assert.equal(r1.topPerformers.length, r2.topPerformers.length);
  });

  test('platform sin ninguna publicación registrada -- INSUFFICIENT_DATA', () => {
    const r = analyzePerformance({ store, platform: 'nonexistent_platform' });
    assert.equal(r.status, 'INSUFFICIENT_DATA');
  });
});
