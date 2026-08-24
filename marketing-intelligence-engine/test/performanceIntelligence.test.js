import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { analyzePerformance, buildEnrichedPublications } from '../../content-strategy/src/performanceAnalysis/performanceAnalysisService.js';
import { buildPerformanceIntelligence } from '../src/performanceIntelligence.js';
import { seedPublication } from './helpers/seed.js';

describe('buildPerformanceIntelligence — Fases 4/5/6 (Content/Platform/Format Intelligence)', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'mie-perf-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('store sin datos suficientes -- INSUFFICIENT_DATA como DataQualitySignal, nunca fabrica un insight', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'mie-perf-empty-'));
    const emptyStore = new PerformanceLearningStore(emptyDir);
    const analysis = analyzePerformance({ store: emptyStore });
    const result = buildPerformanceIntelligence(analysis, []);
    assert.equal(result.insights.length, 0);
    assert.equal(result.dataQualitySignals[0].reason, 'INSUFFICIENT_DATA');
    rmSync(emptyDir, { recursive: true, force: true });
  });

  test('con volumen real suficiente: genera TOP_PERFORMER/UNDERPERFORMER (Content) + FORMAT_PATTERN (Format) + PLATFORM_COMPARISON (Platform)', () => {
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'image', likes: 50 + i * 10, comments: 5, shares: 5, saves: 5, views: 1000 });
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'video', likes: 5, comments: 1, shares: 0, saves: 0, views: 1000 });
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'facebook', format: 'image', likes: 2, comments: 0, shares: 0, saves: 0, views: 1000 });

    const analysis = analyzePerformance({ store });
    assert.equal(analysis.status, 'OK');
    const enriched = buildEnrichedPublications({ store });
    const result = buildPerformanceIntelligence(analysis, enriched);

    const categories = new Set(result.insights.map((i) => i.category));
    assert.ok(categories.has('CONTENT_PERFORMANCE'), 'debe incluir Content Intelligence (TOP_PERFORMER/UNDERPERFORMER)');
    assert.ok(categories.has('FORMAT_PERFORMANCE'), 'debe incluir Format Intelligence (image vs video en instagram)');
    assert.ok(categories.has('PLATFORM_PERFORMANCE'), 'debe incluir Platform Intelligence (instagram vs facebook)');

    for (const insight of result.insights) {
      assert.ok(insight.relatedContentIds.length >= 1);
      assert.ok(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(insight.confidence));
      assert.doesNotMatch(insight.summary, /\bcausa\b/i);
    }
  });

  test('nunca reimplementa el scoring: el value del insight de Content Performance coincide con performanceScore.js', () => {
    const analysis = analyzePerformance({ store });
    const enriched = buildEnrichedPublications({ store });
    const result = buildPerformanceIntelligence(analysis, enriched);
    const topInsight = result.insights.find((i) => i.insightType === 'TOP_PERFORMER');
    const matchingTopPerformer = analysis.topPerformers.find((p) => p.contentId === topInsight.relatedContentIds[0]);
    assert.equal(topInsight.metrics.score, matchingTopPerformer.score);
  });
});
