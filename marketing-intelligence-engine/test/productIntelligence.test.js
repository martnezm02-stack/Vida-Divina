import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { buildEnrichedPublications } from '../../content-strategy/src/performanceAnalysis/performanceAnalysisService.js';
import { buildProductIntelligence } from '../src/productIntelligence.js';
import { seedPublication, seedAttributionRecord } from './helpers/seed.js';

describe('buildProductIntelligence — Fase 7', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'mie-product-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('sin ningún product_ref registrado -- INSUFFICIENT_DATA, nunca inventa una relación', () => {
    seedPublication(store, { platform: 'instagram', likes: 10 }); // sin product_ref
    const enriched = buildEnrichedPublications({ store });
    const result = buildProductIntelligence({ enriched, attributionRecords: [] });
    assert.equal(result.insights.length, 0);
    assert.equal(result.dataQualitySignals[0].category, 'PRODUCT_PERFORMANCE');
    assert.equal(result.dataQualitySignals[0].reason, 'INSUFFICIENT_DATA');
  });

  test('con product_ref real: une engagement + leads/ventas/revenue atribuidos exclusivamente por contentId', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'mie-product-2-'));
    const store2 = new PerformanceLearningStore(emptyDir);
    const c1 = seedPublication(store2, { platform: 'instagram', product_ref: 'TéDivina', likes: 10, views: 100 });
    const c2 = seedPublication(store2, { platform: 'instagram', product_ref: 'TéDivina', likes: 20, views: 100 });
    seedPublication(store2, { platform: 'instagram', product_ref: 'ColágenoDivino', likes: 5, views: 100 });

    seedAttributionRecord(store2, { contentId: c1.content_id, platform: 'instagram', attributionType: 'DIRECT', confidence: 'HIGH', leadId: 'lead1', saleId: 'sale1', revenue: 500 });
    seedAttributionRecord(store2, { contentId: c2.content_id, platform: 'instagram', attributionType: 'UNKNOWN' }); // no debe contar como conversión

    const enriched = buildEnrichedPublications({ store: store2 });
    const attributionRecords = store2.loadAll('attribution_record');
    const result = buildProductIntelligence({ enriched, attributionRecords });

    const teDivina = result.insights.find((i) => i.relatedProductIds.includes('TéDivina'));
    assert.ok(teDivina, 'debe generar un insight para TéDivina');
    assert.equal(teDivina.evidenceCount, 2);
    assert.equal(teDivina.attributionSummary.attributedLeads, 1);
    assert.equal(teDivina.attributionSummary.attributedSales, 1);
    assert.equal(teDivina.attributionSummary.attributedRevenue, 500);

    const colageno = result.insights.find((i) => i.relatedProductIds.includes('ColágenoDivino'));
    assert.ok(colageno);
    assert.equal(colageno.attributionSummary, null, 'sin AttributionRecord para este producto -- nunca inventa atribución');
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
