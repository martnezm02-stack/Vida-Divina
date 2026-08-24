import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { buildCommercialIntelligence } from '../src/commercialIntelligence.js';
import { seedPublication, seedAttributionRecord } from './helpers/seed.js';

describe('buildCommercialIntelligence — Fase 9', () => {
  test('sin AttributionRecord -- MISSING_ATTRIBUTION en CONVERSION/REVENUE, AUDIENCE_SIGNAL siempre INSUFFICIENT_DATA', () => {
    const result = buildCommercialIntelligence({ attributionRecords: [] });
    assert.equal(result.insights.length, 0);
    const byCategory = Object.fromEntries(result.dataQualitySignals.map((s) => [s.category, s.reason]));
    assert.equal(byCategory.CONVERSION, 'MISSING_ATTRIBUTION');
    assert.equal(byCategory.REVENUE, 'MISSING_ATTRIBUTION');
    assert.equal(byCategory.AUDIENCE_SIGNAL, 'INSUFFICIENT_DATA');
  });

  test('todos UNKNOWN (estado real actual del proyecto): MISSING_ATTRIBUTION, nunca fabrica una conversión', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mie-comm-1-'));
    const store = new PerformanceLearningStore(dir);
    const c1 = seedPublication(store, { platform: 'instagram', likes: 10 });
    seedAttributionRecord(store, { contentId: c1.content_id, platform: 'instagram', attributionType: 'UNKNOWN' });
    const result = buildCommercialIntelligence({ attributionRecords: store.loadAll('attribution_record') });
    assert.equal(result.insights.length, 0);
    assert.ok(result.dataQualitySignals.some((s) => s.category === 'CONVERSION' && s.reason === 'MISSING_ATTRIBUTION'));
    rmSync(dir, { recursive: true, force: true });
  });

  test('engagement != conversión: contenido con evidencia comercial real genera CONVERSION y REVENUE, separados y trazables, multi-plataforma', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mie-comm-2-'));
    const store = new PerformanceLearningStore(dir);
    const ig = seedPublication(store, { platform: 'instagram', likes: 1 }); // bajo engagement
    const fb = seedPublication(store, { platform: 'facebook', likes: 1 });
    seedAttributionRecord(store, { contentId: ig.content_id, platform: 'instagram', attributionType: 'DIRECT', confidence: 'HIGH', leadId: 'lead1', saleId: 'sale1', revenue: 300 });
    seedAttributionRecord(store, { contentId: fb.content_id, platform: 'facebook', attributionType: 'INDIRECT', confidence: 'LOW', leadId: 'lead2' });

    const records = store.loadAll('attribution_record');
    const result = buildCommercialIntelligence({ attributionRecords: records });

    const conversionInsights = result.insights.filter((i) => i.category === 'CONVERSION');
    const revenueInsights = result.insights.filter((i) => i.category === 'REVENUE');
    assert.ok(conversionInsights.length >= 2, 'debe reportar conversión al menos overall + por plataforma con datos'); // overall + instagram + facebook
    assert.ok(revenueInsights.length >= 1, 'debe reportar revenue -- solo instagram tiene revenue real');
    assert.ok(revenueInsights.every((i) => i.metrics.attributedRevenue === 300), 'todo el revenue real proviene de la publicación de instagram');
    assert.equal(revenueInsights.some((i) => i.platform === 'facebook'), false, 'facebook no tiene revenue real -- nunca se fabrica un insight de REVENUE para esa plataforma');

    const igConversion = conversionInsights.find((i) => i.platform === 'instagram');
    assert.equal(igConversion.confidence, 'HIGH'); // reutiliza el confidence YA calculado por attributionConfidence.js, no lo recalcula
    rmSync(dir, { recursive: true, force: true });
  });
});
