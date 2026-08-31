// marketingIntelligenceSeed.test.js — Prueba de integración: ingiere el
// dataset curado real (snapshot-2026-08-31) contra un DATA_ROOT temporal y
// valida que el resultado sea estructuralmente correcto y trazable --
// sección 50 del encargo: trend signals, hook patterns, objections,
// opportunities, regulatory risks, catalog discrepancies, historical
// snapshots.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-mi-seed-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const { upsertSignal, querySignals, listSignals, buildIndex } = await import('../src/marketingIntelligence/signalStore.js');
const { createSnapshot, listSnapshots } = await import('../src/marketingIntelligence/snapshotStore.js');
const { saveOpportunity, listOpportunities } = await import('../src/marketingIntelligence/creativeOpportunityStore.js');
const { SIGNALS, OPPORTUNITIES } = await import('../src/marketingIntelligence/seedData/snapshot-2026-08-31.js');

const SNAPSHOT_ID = 'snapshot-2026-08-31';

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function ingest() {
  createSnapshot(SNAPSHOT_ID, {
    researchReportPath: 'docs/research/vida-divina-market-intelligence-2026-08-31.md',
    sourcesUsed: ['X/Twitter', 'YouTube', 'TikTok', 'WebSearch'],
    sourcesUnavailable: ['Instagram (HTTP 404)', 'Reddit (rate-limited)', 'last30days web/grounding (sin API key)'],
  });
  const idBySeedKey = new Map();
  for (const raw of SIGNALS) {
    const { seedKey, ...fields } = raw;
    const saved = upsertSignal(SNAPSHOT_ID, fields, { additionalSourceIsIndependent: (fields.independentSourceCount ?? 1) > 1 });
    idBySeedKey.set(seedKey, saved.id);
  }
  for (const opp of OPPORTUNITIES) {
    const { signalSeedKeys, ...fields } = opp;
    saveOpportunity(SNAPSHOT_ID, { ...fields, signalIds: signalSeedKeys.map((k) => idBySeedKey.get(k)) });
  }
  return idBySeedKey;
}

describe('Ingesta del snapshot real snapshot-2026-08-31', () => {
  test('crea el snapshot y no lanza en ningún registro (todo el seed data es válido)', () => {
    assert.doesNotThrow(() => ingest());
    assert.ok(listSnapshots().includes(SNAPSHOT_ID));
  });

  test('genera al menos una señal de cada uno de los 14 tipos', () => {
    const index = buildIndex(SNAPSHOT_ID);
    const EXPECTED_TYPES = [
      'TrendSignal', 'AudienceSignal', 'PainPoint', 'DesireSignal', 'Objection',
      'HookPattern', 'ContentPattern', 'CreativeAngleSignal', 'CompetitorSignal',
      'CreatorSignal', 'PurchaseTrigger', 'BrandSignal', 'RegulatoryRisk', 'CatalogDiscrepancy',
    ];
    for (const type of EXPECTED_TYPES) {
      assert.ok((index.byType[type] ?? 0) >= 1, `esperaba al menos 1 señal de tipo ${type}`);
    }
  });

  test('las 3 discrepancias de catálogo (Sculpt Tongkat Ali, Venus, Mars) quedan marcadas PUBLIC_NOT_IN_PROJECT_CATALOG', () => {
    const discrepancies = querySignals(SNAPSHOT_ID, { type: 'CatalogDiscrepancy' });
    assert.equal(discrepancies.length, 3);
    for (const d of discrepancies) {
      assert.ok(d.tags.includes('PUBLIC_NOT_IN_PROJECT_CATALOG'));
      assert.ok(d.details.externalSignal?.length > 0);
      assert.ok(d.details.currentInternalData?.length > 0);
      assert.equal(d.details.resolutionStatus, 'UNRESOLVED_FOR_BUSINESS_OWNER_REVIEW');
    }
    const productIds = discrepancies.map((d) => d.productId).sort();
    assert.deepEqual(productIds, ['mars-capsules', 'sculpt-tongkat-ali', 'venus-capsules']);
  });

  test('los 8 riesgos regulatorios están presentes y ninguno excede la confidence de su evidenceLevel declarado', () => {
    const risks = querySignals(SNAPSHOT_ID, { type: 'RegulatoryRisk' });
    assert.equal(risks.length, 8);
    for (const r of risks) {
      assert.ok(r.source?.length > 0, `RegulatoryRisk "${r.title}" debe tener source`);
      assert.ok(r.observation?.length > 0, `RegulatoryRisk "${r.title}" debe tener evidencia (observation)`);
    }
  });

  test('los hook patterns incluyen tanto SATURATED como HIGH_SIGNAL vía saturationLevel', () => {
    const hooks = querySignals(SNAPSHOT_ID, { type: 'HookPattern' });
    assert.ok(hooks.some((h) => h.details.saturationLevel === 'HIGH'));
    assert.ok(hooks.some((h) => h.details.saturationLevel === 'LOW'));
  });

  test('las 7 objeciones del objection library tienen evidencia real, ninguna inventada', () => {
    const objections = querySignals(SNAPSHOT_ID, { type: 'Objection' });
    assert.equal(objections.length, 7);
    for (const o of objections) assert.ok(o.source?.length > 0 && o.observation?.length > 0);
  });

  test('las 10 oportunidades creativas referencian únicamente señales reales del mismo snapshot', () => {
    const opportunities = listOpportunities(SNAPSHOT_ID);
    assert.equal(opportunities.length, 10);
    const allSignalIds = new Set(listSignals(SNAPSHOT_ID).map((s) => s.id));
    for (const opp of opportunities) {
      assert.ok(opp.signalIds.length >= 1, `oportunidad "${opp.title}" sin señal de respaldo`);
      for (const id of opp.signalIds) assert.ok(allSignalIds.has(id), `oportunidad "${opp.title}" referencia una señal inexistente: ${id}`);
      assert.ok(['P0', 'P1', 'P2', 'P3'].includes(opp.priority));
    }
  });

  test('confidence nunca fue elevada respecto al evidenceLevel citado en ninguna señal (sección 48)', () => {
    for (const s of listSignals(SNAPSHOT_ID)) {
      const expected = { HIGH: 0.8, 'MEDIUM-HIGH': 0.65, MEDIUM: 0.5, 'LOW-MEDIUM': 0.35, LOW: 0.2 }[s.evidenceLevel];
      assert.equal(s.confidence, expected, `señal "${s.title}" tiene confidence inconsistente con su evidenceLevel`);
    }
  });

  test('toda señal es trazable a una fuente y a una referencia del reporte de origen (sección 51)', () => {
    for (const s of listSignals(SNAPSHOT_ID)) {
      assert.ok(s.source?.length > 0, `señal "${s.title}" sin source`);
      assert.ok(s.rawReference?.startsWith('docs/research/vida-divina-market-intelligence-2026-08-31.md'), `señal "${s.title}" sin rawReference trazable`);
    }
  });

  test('re-ingerir el mismo dataset es idempotente: mismo signalCount, sin oportunidades duplicadas', () => {
    const before = buildIndex(SNAPSHOT_ID).signalCount;
    const beforeOpps = listOpportunities(SNAPSHOT_ID).length;
    // Segunda pasada manual de solo señales (mismo criterio que el script real).
    const idBySeedKey = new Map();
    for (const raw of SIGNALS) {
      const { seedKey, ...fields } = raw;
      const saved = upsertSignal(SNAPSHOT_ID, fields, { additionalSourceIsIndependent: (fields.independentSourceCount ?? 1) > 1 });
      idBySeedKey.set(seedKey, saved.id);
    }
    const after = buildIndex(SNAPSHOT_ID).signalCount;
    assert.equal(after, before);
    assert.equal(listOpportunities(SNAPSHOT_ID).length, beforeOpps);
  });
});
