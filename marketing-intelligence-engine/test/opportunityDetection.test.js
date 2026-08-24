import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { analyzePerformance, buildEnrichedPublications } from '../../content-strategy/src/performanceAnalysis/performanceAnalysisService.js';
import { buildOpportunityDetection } from '../src/opportunityDetection.js';
import { seedPublication, seedAttributionRecord } from './helpers/seed.js';

describe('buildOpportunityDetection — Fase 10', () => {
  test('store sin datos -- ninguna oportunidad, nunca fabrica evidencia', () => {
    const result = buildOpportunityDetection({ analysis: { status: 'INSUFFICIENT_DATA' }, enriched: [], attributionRecords: [] });
    assert.deepEqual(result.insights, []);
  });

  test('HIGH_ENGAGEMENT_LOW_CONVERSION y LOW_ENGAGEMENT_HIGH_CONVERSION -- cruce real engagement (benchmark) x conversión (attribution)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mie-opp-1-'));
    const store = new PerformanceLearningStore(dir);
    const baseline = [];
    for (let i = 0; i < 5; i++) baseline.push(seedPublication(store, { platform: 'instagram', likes: 10, views: 1000 }));
    const outlier = seedPublication(store, { platform: 'instagram', likes: 500, views: 1000 });

    // outlier: alto engagement, evaluado por Attribution pero sin conversión real.
    seedAttributionRecord(store, { contentId: outlier.content_id, platform: 'instagram', attributionType: 'UNKNOWN' });
    // uno de los baseline (bajo engagement): sí tiene conversión real.
    seedAttributionRecord(store, { contentId: baseline[0].content_id, platform: 'instagram', attributionType: 'DIRECT', confidence: 'HIGH', leadId: 'lead1' });

    const analysis = analyzePerformance({ store });
    const enriched = buildEnrichedPublications({ store });
    const attributionRecords = store.loadAll('attribution_record');
    const result = buildOpportunityDetection({ analysis, enriched, attributionRecords });

    const high = result.insights.find((i) => i.insightType === 'HIGH_ENGAGEMENT_LOW_CONVERSION');
    const low = result.insights.find((i) => i.insightType === 'LOW_ENGAGEMENT_HIGH_CONVERSION');
    assert.ok(high, 'debe detectar HIGH_ENGAGEMENT_LOW_CONVERSION en el outlier');
    assert.equal(high.relatedContentIds[0], outlier.content_id);
    assert.ok(low, 'debe detectar LOW_ENGAGEMENT_HIGH_CONVERSION en el baseline con conversión real');
    assert.equal(low.relatedContentIds[0], baseline[0].content_id);
    rmSync(dir, { recursive: true, force: true });
  });

  test('HIGH_REVENUE_LOW_REACH -- revenue real con views por debajo del percentil 25 de la plataforma', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mie-opp-2-'));
    const store = new PerformanceLearningStore(dir);
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', likes: 10, views: 1000 });
    const lowReach = seedPublication(store, { platform: 'instagram', likes: 10, views: 1 });
    seedAttributionRecord(store, { contentId: lowReach.content_id, platform: 'instagram', attributionType: 'DIRECT', confidence: 'HIGH', leadId: 'lead1', saleId: 'sale1', revenue: 300 });

    const analysis = analyzePerformance({ store });
    const enriched = buildEnrichedPublications({ store });
    const attributionRecords = store.loadAll('attribution_record');
    const result = buildOpportunityDetection({ analysis, enriched, attributionRecords });

    const opp = result.insights.find((i) => i.insightType === 'HIGH_REVENUE_LOW_REACH');
    assert.ok(opp, 'debe detectar revenue real con reach bajo');
    assert.equal(opp.relatedContentIds[0], lowReach.content_id);
    rmSync(dir, { recursive: true, force: true });
  });

  test('STRONG_PLATFORM_SIGNAL / WEAK_PLATFORM_SIGNAL -- envuelve 1:1 un PLATFORM_COMPARISON de confidence HIGH ya calculado por patternDetection.js', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mie-opp-3-'));
    const store = new PerformanceLearningStore(dir);
    for (let i = 0; i < 10; i++) seedPublication(store, { platform: 'instagram', likes: 100, views: 1000 });
    for (let i = 0; i < 10; i++) seedPublication(store, { platform: 'facebook', likes: 1, views: 1000 });

    const analysis = analyzePerformance({ store });
    const enriched = buildEnrichedPublications({ store });
    const result = buildOpportunityDetection({ analysis, enriched, attributionRecords: [] });

    const strong = result.insights.find((i) => i.insightType === 'STRONG_PLATFORM_SIGNAL');
    const weak = result.insights.find((i) => i.insightType === 'WEAK_PLATFORM_SIGNAL');
    assert.ok(strong || weak, 'con una diferencia grande y N>=10 por plataforma debe alcanzar confidence HIGH en al menos una dirección');
    rmSync(dir, { recursive: true, force: true });
  });
});
