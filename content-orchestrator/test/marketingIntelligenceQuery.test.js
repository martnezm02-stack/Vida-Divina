// marketingIntelligenceQuery.test.js — Prueba el servicio de consulta y
// ranking (queryService.js) contra el dataset curado REAL de
// snapshot-2026-08-31 (seedData/), ingerido en un DATA_ROOT temporal. No
// ejecuta last30days ni ninguna llamada externa -- solo lee el store.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-mi-query-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const { createSnapshot } = await import('../src/marketingIntelligence/snapshotStore.js');
const { upsertSignal } = await import('../src/marketingIntelligence/signalStore.js');
const { saveOpportunity } = await import('../src/marketingIntelligence/creativeOpportunityStore.js');
const { SIGNALS, OPPORTUNITIES } = await import('../src/marketingIntelligence/seedData/snapshot-2026-08-31.js');
const {
  getMarketingIntelligence, getProductIntelligence, getAudienceIntelligence,
  getTrendIntelligence, getCreativeOpportunities, listSnapshots, getSnapshot, compareSnapshots,
} = await import('../src/marketingIntelligence/queryService.js');
const { determineProductFit, computeIntelligenceScore } = await import('../src/marketingIntelligence/ranking.js');
const { classifySignalStaleness } = await import('../src/marketingIntelligence/staleness.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

const SNAPSHOT_ID = 'snapshot-2026-08-31';

function ingestRealSeedData() {
  createSnapshot(SNAPSHOT_ID, {
    researchReportPath: 'docs/research/vida-divina-market-intelligence-2026-08-31.md',
    sourcesUsed: ['X/Twitter', 'YouTube', 'TikTok', 'WebSearch'],
    sourcesUnavailable: ['Instagram (HTTP 404)', 'Reddit (rate-limited)'],
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
}

ingestRealSeedData();

describe('Sin ejecución de research externo (secciones 27, 46, 48)', () => {
  test('listSnapshots solo ve el snapshot ya ingerido, no crea uno nuevo', () => {
    assert.deepEqual(listSnapshots(), [SNAPSHOT_ID]);
  });
});

describe('getMarketingIntelligence — filtros (sección 12)', () => {
  test('filtra por productId (incluye DIRECT_PRODUCT + CATEGORY + GENERAL)', () => {
    const results = getMarketingIntelligence({ productId: 'venus-capsules' });
    assert.ok(results.length > 0);
    for (const r of results) assert.notEqual(determineProductFit(r, 'venus-capsules'), 'NOT_RELEVANT');
  });

  test('filtra por category exacta', () => {
    const results = getMarketingIntelligence({ category: 'intimidad-libido' });
    assert.ok(results.length > 0);
    for (const r of results) assert.equal(r.category, 'intimidad-libido');
  });

  test('filtra por audience exacta', () => {
    const results = getMarketingIntelligence({ audience: 'mujeres-bienestar-hormonal' });
    assert.ok(results.length > 0);
    for (const r of results) assert.equal(r.audience, 'mujeres-bienestar-hormonal');
  });

  test('filtra por type', () => {
    const results = getMarketingIntelligence({ type: 'RegulatoryRisk' });
    assert.equal(results.length, 8);
    for (const r of results) assert.equal(r.type, 'RegulatoryRisk');
  });

  test('filtra por evidenceLevel y minConfidence', () => {
    const highOnly = getMarketingIntelligence({ evidenceLevel: 'HIGH' });
    for (const r of highOnly) assert.equal(r.confidence, 0.8);
    const confident = getMarketingIntelligence({ minConfidence: 0.65 });
    for (const r of confident) assert.ok(r.confidence >= 0.65);
  });

  test('limit trunca DESPUÉS de rankear (el resultado sigue siendo el top-N)', () => {
    const all = getMarketingIntelligence({ type: 'HookPattern' });
    const top3 = getMarketingIntelligence({ type: 'HookPattern', limit: 3 });
    assert.equal(top3.length, 3);
    assert.deepEqual(top3.map((s) => s.id), all.slice(0, 3).map((s) => s.id));
  });
});

describe('Ranking — determinismo, orden, componentes (sección 13)', () => {
  test('resultado ordenado por intelligenceScore descendente', () => {
    const results = getMarketingIntelligence({ type: 'TrendSignal' });
    for (let i = 1; i < results.length; i += 1) {
      assert.ok(results[i - 1].intelligenceScore >= results[i].intelligenceScore);
    }
  });

  test('mismos inputs producen SIEMPRE el mismo score (determinismo)', () => {
    const a = getMarketingIntelligence({ type: 'TrendSignal' });
    const b = getMarketingIntelligence({ type: 'TrendSignal' });
    assert.deepEqual(a.map((s) => s.intelligenceScore), b.map((s) => s.intelligenceScore));
  });

  test('intelligenceScore nunca sale de [0, 1]', () => {
    for (const s of getMarketingIntelligence({})) {
      assert.ok(s.intelligenceScore >= 0 && s.intelligenceScore <= 1);
    }
  });
});

describe('Confidence — se preserva exactamente, nunca se recalcula (sección 16)', () => {
  test('confidence de cada señal sigue el mapeo evidenceLevel ya fijado en schema.js', () => {
    const expected = { HIGH: 0.8, 'MEDIUM-HIGH': 0.65, MEDIUM: 0.5, 'LOW-MEDIUM': 0.35, LOW: 0.2 };
    for (const s of getMarketingIntelligence({})) {
      assert.equal(s.confidence, expected[s.evidenceLevel]);
    }
  });
});

describe('Recency / Staleness (sección 15, 26)', () => {
  test('una señal recién capturada (hoy) es ACTIVE', () => {
    const s = getMarketingIntelligence({ type: 'TrendSignal', limit: 1 })[0];
    assert.equal(s.staleness, classifySignalStaleness(s));
    assert.equal(s.staleness, 'ACTIVE'); // capturedAt = 2026-08-31, snapshot recién ingerido.
  });

  test('filtrar por staleness no borra nada del store, solo excluye del resultado', () => {
    const active = getMarketingIntelligence({ staleness: 'ACTIVE' });
    const archived = getMarketingIntelligence({ staleness: 'ARCHIVED' });
    const all = getMarketingIntelligence({});
    assert.equal(active.length + archived.length, all.length); // todo el dataset actual es ACTIVE o ARCHIVED (ninguno cae en STALE con capturedAt=hoy).
  });
});

describe('Cross-source (sección 17)', () => {
  test('señales con independentSourceCount>=2 tienen crossSourceConfirmed=true', () => {
    const results = getMarketingIntelligence({ type: 'BrandSignal' });
    const crossConfirmed = results.filter((r) => r.independentSourceCount >= 2);
    assert.ok(crossConfirmed.length > 0);
    for (const r of crossConfirmed) assert.equal(r.crossSourceConfirmed, true);
  });
});

describe('Product fit (sección 18)', () => {
  test('DIRECT_PRODUCT, CATEGORY y GENERAL coexisten en los resultados de un producto', () => {
    const results = getMarketingIntelligence({ productId: 'venus-capsules' });
    const fits = new Set(results.map((r) => r.productFit));
    assert.ok(fits.has('DIRECT_PRODUCT'));
    assert.ok(fits.has('CATEGORY') || fits.has('GENERAL'));
  });

  test('una señal de otro producto/categoría específica queda excluida', () => {
    const venusResults = getMarketingIntelligence({ productId: 'venus-capsules' });
    assert.ok(!venusResults.some((r) => r.productId && r.productId !== 'venus-capsules'));
    assert.ok(!venusResults.some((r) => r.category === 'cafe-divina')); // categoría específica de OTRO producto.
  });
});

describe('Deduplication (heredado del store, verificado a nivel de consulta)', () => {
  test('no hay dos señales con el mismo dedupeKey en el resultado', () => {
    const all = getMarketingIntelligence({});
    const keys = all.map((s) => s.dedupeKey);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('getProductIntelligence — Venus (secciones 10, 41)', () => {
  test('devuelve datos reales del snapshot, sin ejecutar research', () => {
    const venus = getProductIntelligence('venus-capsules');
    assert.equal(venus.productId, 'venus-capsules');
    assert.equal(venus.category, 'intimidad-libido');
    assert.equal(venus.snapshotId, SNAPSHOT_ID);
    assert.ok(venus.objections.length > 0);
    assert.ok(venus.painPoints.length > 0);
    assert.ok(venus.trends.length > 0);
    assert.ok(venus.creativeOpportunities.length > 0);
    // Cada bucket viene rankeado y con confidence/source/evidence trazables.
    for (const bucketKey of ['objections', 'painPoints', 'trends']) {
      for (const s of venus[bucketKey]) {
        assert.ok(s.source);
        assert.ok(s.rawReference?.includes('vida-divina-market-intelligence-2026-08-31.md'));
      }
    }
  });

  test('incluye la CatalogDiscrepancy propia de Venus', () => {
    const venus = getProductIntelligence('venus-capsules');
    assert.equal(venus.catalogDiscrepancies.length, 1);
    assert.ok(venus.catalogDiscrepancies[0].tags.includes('PUBLIC_NOT_IN_PROJECT_CATALOG'));
  });
});

describe('getProductIntelligence — Tongkat Ali (secciones 11, 42)', () => {
  test('devuelve señales reales usando únicamente datos almacenados', () => {
    const tongkat = getProductIntelligence('tongkat-ali-cafe');
    assert.equal(tongkat.category, 'cafe-divina');
    assert.ok(tongkat.audienceSignals.length > 0);
    assert.ok(tongkat.hookPatterns.length > 0);
    assert.ok(tongkat.regulatoryRisks.length > 0); // riesgos transversales (GENERAL) también deben aparecer.
  });
});

describe('getAudienceIntelligence', () => {
  test('agrupa pain points/desires/objections/trends por audiencia exacta', () => {
    const result = getAudienceIntelligence('hombres-biohacking-tongkat-ali');
    assert.ok(result.painPoints.length > 0);
    assert.ok(result.desires.length > 0);
  });
});

describe('getTrendIntelligence', () => {
  test('cada tendencia trae direction/confidence/evidencia', () => {
    const trends = getTrendIntelligence();
    assert.equal(trends.length, 7);
    for (const t of trends) {
      assert.ok(['RISING', 'STABLE', 'DECLINING', 'EMERGING', null].includes(t.direction));
      assert.ok(t.rawReference);
    }
  });
});

describe('getCreativeOpportunities — trazabilidad (secciones 20, 21, 29, 43)', () => {
  test('todas tienen signalIds válidos y explicación completa', () => {
    const opportunities = getCreativeOpportunities();
    assert.equal(opportunities.length, 10);
    for (const o of opportunities) {
      assert.ok(o.signalIds.length >= 1);
      assert.equal(o.explanation.what, o.title);
      assert.equal(o.explanation.why, o.rationale);
      assert.ok(o.explanation.evidence.length >= 1);
      assert.equal(o.explanation.confidence, o.confidence);
      assert.ok('angle' in o.explanation.creativeUse);
    }
  });

  test('ordenadas por intelligenceScore descendente', () => {
    const opportunities = getCreativeOpportunities();
    for (let i = 1; i < opportunities.length; i += 1) {
      assert.ok(opportunities[i - 1].intelligenceScore >= opportunities[i].intelligenceScore);
    }
  });

  test('filtro por productId solo incluye oportunidades de ese producto o generales', () => {
    const venusOpps = getCreativeOpportunities({ productId: 'venus-capsules' });
    for (const o of venusOpps) assert.ok(o.product === 'venus-capsules' || o.product === null);
  });
});

describe('Snapshots (sección 24, 44)', () => {
  test('listSnapshots incluye snapshot-2026-08-31', () => {
    assert.ok(listSnapshots().includes(SNAPSHOT_ID));
  });

  test('getSnapshot expone conteos agregados reales, no recalcula el store', () => {
    const snap = getSnapshot(SNAPSHOT_ID);
    assert.equal(snap.snapshotId, SNAPSHOT_ID);
    assert.equal(snap.signalCount, 105);
    assert.equal(snap.opportunityCount, 10);
    assert.equal(snap.byType.RegulatoryRisk, 8);
  });
});

describe('compareSnapshots — honesto cuando solo hay uno (sección 25, 45)', () => {
  test('con un solo snapshot, responde comparisonAvailable=false sin inventar nada', () => {
    const result = compareSnapshots();
    assert.equal(result.comparisonAvailable, false);
    assert.equal(result.reason, 'comparison unavailable — only one snapshot exists');
    assert.deepEqual(result.snapshotsFound, [SNAPSHOT_ID]);
  });

  test('con dos snapshotIds explícitos donde uno no existe, lanza en vez de inventar', () => {
    assert.throws(() => compareSnapshots(SNAPSHOT_ID, 'snapshot-1999-01-01'), /no existe/);
  });
});

describe('Governance — claimType nunca se degrada/asciende (sección 30)', () => {
  test('toda señal conserva su claimType original (FACT/SIGNAL/INFERENCE/RECOMMENDATION)', () => {
    for (const s of getMarketingIntelligence({})) {
      assert.ok(['FACT', 'SIGNAL', 'INFERENCE', 'RECOMMENDATION'].includes(s.claimType));
    }
    // Una señal marcada INFERENCE en el seed data debe seguir siendo INFERENCE al consultarla.
    const inferenceSignal = getMarketingIntelligence({}).find((s) => s.title.includes('Registro de lenguaje distinto por canal'));
    assert.equal(inferenceSignal.claimType, 'INFERENCE');
  });
});

describe('Traceability (sección 29)', () => {
  test('toda señal es trazable a source + rawReference, ninguna huérfana', () => {
    for (const s of getMarketingIntelligence({})) {
      assert.ok(s.source?.length > 0);
      assert.ok(s.rawReference?.length > 0);
    }
  });
});

describe('computeIntelligenceScore — determinismo unitario', () => {
  test('el mismo signal con el mismo `now` produce el mismo score', () => {
    const s = getMarketingIntelligence({ type: 'HookPattern', limit: 1 })[0];
    const fixedNow = new Date('2026-08-31T00:00:00Z').getTime();
    const a = computeIntelligenceScore(s, { now: fixedNow });
    const b = computeIntelligenceScore(s, { now: fixedNow });
    assert.equal(a, b);
  });
});
