import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { generateAttributionForPublication, generateAttributionForAllPublications, computeCommercialMetrics } from '../src/attributionService.js';

function fakeCrm(opportunitiesByCall) {
  // opportunitiesByCall: array de oportunidades a devolver en CADA llamada (mismo resultado para las 3 ventanas, simplifica los tests)
  return { opportunities: { listCreatedBetween: async () => opportunitiesByCall } };
}

describe('generateAttributionForPublication', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'attr-service-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('sin external_post_id -- ERROR explícito, nunca intenta atribuir', async () => {
    const pc = createPublishedContent({ platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x' });
    const r = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([]), store, windows: ['1d'] });
    assert.equal(r.status, 'ERROR');
    assert.match(r.error, /external_post_id/);
  });

  test('sin candidatos comerciales -- UNKNOWN por ventana, nunca inventa un vínculo', async () => {
    const pc = createPublishedContent({ platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_1' });
    const r = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([]), store, windows: ['1d', '7d'] });
    assert.equal(r.status, 'OK');
    assert.equal(r.saved.length, 2); // 1 UNKNOWN por ventana
    assert.ok(r.saved.every((rec) => rec.attributionType === 'UNKNOWN'));
  });

  test('candidato con producto coincidente -- INDIRECT con evidencia y revenue si es venta', async () => {
    const pc = createPublishedContent({ platform: 'facebook', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', product_ref: 'TéDivina', external_post_id: 'fb_1' });
    const opp = { opportunityId: 'opp1', conversationId: 'conv1', productoId: 'TéDivina', estado: 'PedidoProcesado', total: '450.00' };
    const r = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([opp]), store, windows: ['7d'] });
    assert.equal(r.status, 'OK');
    const rec = r.saved.find((x) => x.attributionType === 'INDIRECT');
    assert.ok(rec);
    assert.equal(rec.leadId, 'opp1');
    assert.equal(rec.saleId, 'opp1');
    assert.equal(rec.revenue, 450);
    assert.equal(rec.confidence, 'LOW');
  });

  test('candidato sin coincidencia de producto -- UNKNOWN (nunca por sola proximidad)', async () => {
    const pc = createPublishedContent({ platform: 'facebook', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', product_ref: 'TéDivina', external_post_id: 'fb_2' });
    const opp = { opportunityId: 'opp2', conversationId: 'conv2', productoId: 'CaféDivina', estado: 'PrecioEnviado', total: null };
    const r = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([opp]), store, windows: ['7d'] });
    assert.equal(r.saved[0].attributionType, 'UNKNOWN');
    assert.equal(r.saved[0].revenue, null);
  });

  test('idempotencia: correr dos veces no duplica registros', async () => {
    const pc = createPublishedContent({ platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_idem' });
    const first = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([]), store, windows: ['1d'] });
    assert.equal(first.saved.length, 1);
    const second = await generateAttributionForPublication({ publishedContent: pc, crm: fakeCrm([]), store, windows: ['1d'] });
    assert.equal(second.saved.length, 0);
    assert.equal(second.skipped[0].reason, 'ALREADY_RECORDED');
    const all = store.loadAll('attribution_record').filter((r) => r.publicationId === pc.content_id);
    assert.equal(all.length, 1);
  });
});

describe('generateAttributionForAllPublications', () => {
  test('procesa múltiples plataformas de forma secuencial', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'attr-service-all-'));
    const store = new PerformanceLearningStore(dir);
    const ig = createPublishedContent({ platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_multi' });
    const fb = createPublishedContent({ platform: 'facebook', published_at: '2026-08-01T00:00:00Z', content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'fb_multi' });
    store.save('published_content', ig);
    store.save('published_content', fb);
    const results = await generateAttributionForAllPublications({ crm: fakeCrm([]), store, windows: ['1d'] });
    assert.equal(results.length, 2);
    assert.deepEqual(new Set(results.map((r) => r.platform)), new Set(['instagram', 'facebook']));
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('computeCommercialMetrics', () => {
  test('sin datos -- todo null/0, nunca divide por cero', () => {
    const m = computeCommercialMetrics([]);
    assert.equal(m.attributedLeads, 0);
    assert.equal(m.conversionRate, null);
    assert.equal(m.attributedRevenue, null);
  });

  test('con leads y ventas atribuidas -- calcula tasas reales', () => {
    const records = [
      { attributionType: 'INDIRECT', leadId: 'l1', saleId: 'l1', revenue: 100, publicationId: 'p1' },
      { attributionType: 'INDIRECT', leadId: 'l2', saleId: null, revenue: null, publicationId: 'p1' },
      { attributionType: 'UNKNOWN', leadId: null, saleId: null, revenue: null, publicationId: 'p2' },
    ];
    const m = computeCommercialMetrics(records);
    assert.equal(m.attributedLeads, 2);
    assert.equal(m.attributedSales, 1);
    assert.equal(m.attributedRevenue, 100);
    assert.equal(m.conversionRate, 0.5);
    assert.equal(m.revenuePerLead, 50);
  });
});
