import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import {
  generateMarketingIntelligence, generateAndPersistMarketingIntelligence, listMarketingInsights, summarizeMarketingIntelligence,
} from '../src/marketingIntelligenceService.js';
import { seedPublication, seedAttributionRecord } from './helpers/seed.js';

describe('MarketingIntelligenceService — Fase 14', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'mie-service-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('store vacío -- status INSUFFICIENT_DATA explícito, resultado válido (nunca fabrica insights)', () => {
    const result = generateMarketingIntelligence({ store });
    assert.equal(result.status, 'INSUFFICIENT_DATA');
    assert.deepEqual(result.insights, []);
  });

  test('con datos reales multi-plataforma: status OK, agrega Performance + Product + Campaign + Commercial + Opportunity', () => {
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'image', product_ref: 'TéDivina', likes: 50 + i, views: 1000 });
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'facebook', format: 'image', likes: 3, views: 1000 });
    const result = generateMarketingIntelligence({ store });
    assert.equal(result.status, 'OK');
    assert.ok(result.summary.totalInsights > 0);
    const categories = new Set(result.insights.map((i) => i.category));
    assert.ok(categories.has('CONTENT_PERFORMANCE'));
    assert.ok(categories.has('PRODUCT_PERFORMANCE'));
    assert.ok(result.dataQualitySignals.some((s) => s.category === 'CAMPAIGN_PERFORMANCE')); // Fase 8 -- siempre INSUFFICIENT_DATA
  });

  test('filtro por plataforma reduce el análisis a esa plataforma, sin tocar el store', () => {
    const igOnly = generateMarketingIntelligence({ store, platform: 'instagram' });
    assert.ok(igOnly.insights.every((i) => i.platform === null || i.platform === 'instagram' || i.platform === 'all'));
  });

  test('idempotencia (Fase 14/18): generar y persistir dos veces no duplica -- solo agrega evidencia nueva si el scope cambia', () => {
    const first = generateAndPersistMarketingIntelligence({ store });
    assert.ok(first.saved.length > 0, 'primera corrida debe persistir insights reales');
    const totalAfterFirst = store.loadAll('marketing_insight').length;

    const second = generateAndPersistMarketingIntelligence({ store });
    assert.equal(second.saved.length, 0, 'segunda corrida sobre el mismo store no debe persistir nada nuevo');
    assert.ok(second.skipped.length > 0);
    assert.equal(store.loadAll('marketing_insight').length, totalAfterFirst, 'el total persistido no cambia entre corridas idénticas');
  });

  test('GET de solo lectura (listMarketingInsights/summarize) nunca genera como efecto secundario', () => {
    const beforeCount = store.loadAll('marketing_insight').length;
    listMarketingInsights({ store });
    summarizeMarketingIntelligence({ store });
    assert.equal(store.loadAll('marketing_insight').length, beforeCount);
  });

  test('filtros de la API (Fase 16): category/confidence/product/platform', () => {
    const byCategory = listMarketingInsights({ store, category: 'PRODUCT_PERFORMANCE' });
    assert.ok(byCategory.every((i) => i.category === 'PRODUCT_PERFORMANCE'));
    const byProduct = listMarketingInsights({ store, product: 'TéDivina' });
    assert.ok(byProduct.every((i) => i.relatedProductIds.includes('TéDivina')));
    const byConfidence = listMarketingInsights({ store, confidence: 'HIGH' });
    assert.ok(byConfidence.every((i) => i.confidence === 'HIGH'));
    const byPlatform = listMarketingInsights({ store, platform: 'facebook' });
    assert.ok(byPlatform.every((i) => i.platform === 'facebook'));
  });

  test('summary agrega por categoría/confidence sobre lo ya persistido', () => {
    const summary = summarizeMarketingIntelligence({ store });
    assert.equal(summary.status, 'OK');
    assert.ok(summary.totalRecords > 0);
    assert.ok(Object.keys(summary.byCategory).length > 0);
  });

  test('store realmente vacío -- summary INSUFFICIENT_MARKETING_INTELLIGENCE, resultado válido', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'mie-service-empty-'));
    const emptyStore = new PerformanceLearningStore(emptyDir);
    const summary = summarizeMarketingIntelligence({ store: emptyStore });
    assert.equal(summary.status, 'INSUFFICIENT_MARKETING_INTELLIGENCE');
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
