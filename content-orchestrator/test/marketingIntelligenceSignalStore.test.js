import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-mi-store-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const { saveSignal, upsertSignal, getSignal, listSignals, querySignals, buildIndex, MI_ROOT } = await import('../src/marketingIntelligence/signalStore.js');
const { createSnapshot, getSnapshotManifest, listSnapshots } = await import('../src/marketingIntelligence/snapshotStore.js');
const { saveOpportunity, getOpportunity, listOpportunities } = await import('../src/marketingIntelligence/creativeOpportunityStore.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function trendFields(overrides = {}) {
  return {
    type: 'TrendSignal', title: 'Tendencia de prueba', productId: 'tremella-extract', category: 'extractos-hongos',
    source: 'last30days (TikTok)', sourceType: 'SOCIAL', capturedAt: '2026-08-31', timeWindow: '30d',
    observation: 'Evidencia real observada.', evidenceLevel: 'MEDIUM', claimType: 'SIGNAL',
    ...overrides,
  };
}

describe('Directorio aislado de prueba', () => {
  test('MI_ROOT apunta al directorio temporal', () => {
    assert.ok(MI_ROOT.startsWith(TEST_DATA_ROOT));
  });
});

describe('createSnapshot — snapshot-YYYY-MM-DD, idempotente, no se sobrescribe (sección 37)', () => {
  test('rechaza un snapshotId con formato inválido', () => {
    assert.throws(
      () => createSnapshot('mi-snapshot', { researchReportPath: 'docs/x.md' }),
      /debe seguir el patrón "snapshot-YYYY-MM-DD"/,
    );
  });

  test('rechaza sin researchReportPath — trazabilidad obligatoria a la fuente', () => {
    assert.throws(() => createSnapshot('snapshot-2026-01-01', {}), /"researchReportPath" es obligatorio/);
  });

  test('crea y recupera el manifest', () => {
    const manifest = createSnapshot('snapshot-2026-01-01', {
      researchReportPath: 'docs/research/prueba.md',
      sourcesUsed: ['X'], sourcesUnavailable: ['Instagram'],
    });
    assert.equal(manifest.snapshotId, 'snapshot-2026-01-01');
    const recovered = getSnapshotManifest('snapshot-2026-01-01');
    assert.deepEqual(recovered.sourcesUsed, ['X']);
  });

  test('idempotente: crear el mismo snapshotId dos veces no lo reescribe', () => {
    const first = createSnapshot('snapshot-2026-01-02', { researchReportPath: 'docs/a.md', sourcesUsed: ['X'] });
    const second = createSnapshot('snapshot-2026-01-02', { researchReportPath: 'docs/b.md', sourcesUsed: ['Y'] });
    assert.equal(first.createdAt, second.createdAt);
    assert.equal(second.researchReportPath, 'docs/a.md'); // conserva el original, no el segundo intento.
  });

  test('listSnapshots — histórico: dos snapshots distintos coexisten (sección 38)', () => {
    createSnapshot('snapshot-2026-02-01', { researchReportPath: 'docs/feb.md' });
    const snapshots = listSnapshots();
    assert.ok(snapshots.includes('snapshot-2026-01-01'));
    assert.ok(snapshots.includes('snapshot-2026-02-01'));
  });
});

describe('saveSignal / getSignal / listSignals', () => {
  test('guarda y recupera una señal real con todos los campos de gobernanza', () => {
    createSnapshot('snapshot-2026-03-01', { researchReportPath: 'docs/mar.md' });
    const signal = saveSignal('snapshot-2026-03-01', trendFields());
    assert.equal(signal.type, 'TrendSignal');
    assert.equal(signal.confidence, 0.5);
    const recovered = getSignal('snapshot-2026-03-01', signal.id);
    assert.equal(recovered.title, 'Tendencia de prueba');
  });

  test('getSignal lanza para un id inexistente, nunca inventa un registro', () => {
    assert.throws(() => getSignal('snapshot-2026-03-01', 'no-existe'), /no existe la señal/);
  });
});

describe('upsertSignal — deduplicación por dedupeKey (sección 32)', () => {
  test('la primera vez crea, la segunda vez con el mismo type+title fusiona (no duplica)', () => {
    createSnapshot('snapshot-2026-04-01', { researchReportPath: 'docs/abr.md' });
    const first = upsertSignal('snapshot-2026-04-01', trendFields({ title: 'Misma tendencia' }));
    const second = upsertSignal('snapshot-2026-04-01', trendFields({ title: 'Misma tendencia', source: 'last30days (X)' }), { additionalSourceIsIndependent: true });
    assert.equal(first.id, second.id, 'debe ser el MISMO registro, no uno nuevo');
    assert.equal(second.sourceCount, 2);
    assert.equal(second.independentSourceCount, 2);
    assert.equal(second.crossSourceConfirmed, true);
    const all = listSignals('snapshot-2026-04-01');
    assert.equal(all.filter((s) => s.title === 'Misma tendencia').length, 1);
  });

  test('fusionar nunca eleva evidenceLevel/confidence del registro original', () => {
    createSnapshot('snapshot-2026-04-02', { researchReportPath: 'docs/abr2.md' });
    const first = upsertSignal('snapshot-2026-04-02', trendFields({ title: 'Tendencia B', evidenceLevel: 'LOW' }));
    const second = upsertSignal('snapshot-2026-04-02', trendFields({ title: 'Tendencia B', evidenceLevel: 'HIGH' }));
    assert.equal(second.evidenceLevel, 'LOW');
    assert.equal(second.confidence, 0.2);
    assert.equal(first.id, second.id);
  });
});

describe('querySignals — asociación por producto/categoría/audiencia/tipo (secciones 13, 14, 36)', () => {
  test('filtra por productId, category, type y minConfidence combinados', () => {
    const snap = 'snapshot-2026-05-01';
    createSnapshot(snap, { researchReportPath: 'docs/may.md' });
    saveSignal(snap, trendFields({ title: 'Venus A', productId: 'venus-capsules', category: 'intimidad-libido', evidenceLevel: 'HIGH' }));
    saveSignal(snap, trendFields({ title: 'Venus B', type: 'PainPoint', productId: 'venus-capsules', category: 'intimidad-libido', evidenceLevel: 'LOW' }));
    saveSignal(snap, trendFields({ title: 'Tremella A', productId: 'extracto-tremella', category: 'extractos-hongos' }));

    const venusSignals = querySignals(snap, { productId: 'venus-capsules' });
    assert.equal(venusSignals.length, 2);

    const venusTrends = querySignals(snap, { productId: 'venus-capsules', type: 'TrendSignal' });
    assert.equal(venusTrends.length, 1);
    assert.equal(venusTrends[0].title, 'Venus A');

    const highConfidenceOnly = querySignals(snap, { productId: 'venus-capsules', minConfidence: 0.5 });
    assert.equal(highConfidenceOnly.length, 1);
    assert.equal(highConfidenceOnly[0].title, 'Venus A');
  });

  test('buildIndex agrega conteos por tipo/producto/categoría', () => {
    const index = buildIndex('snapshot-2026-05-01');
    assert.equal(index.signalCount, 3);
    assert.equal(index.byProduct['venus-capsules'], 2);
    assert.equal(index.byType.TrendSignal, 2);
  });
});

describe('CreativeOpportunity — nunca huérfana (sección 42, 51)', () => {
  test('rechaza signalIds vacío', () => {
    const snap = 'snapshot-2026-06-01';
    createSnapshot(snap, { researchReportPath: 'docs/jun.md' });
    assert.throws(
      () => saveOpportunity(snap, {
        title: 'Oportunidad sin señal', signalIds: [], angle: 'x', evidenceLevel: 'MEDIUM', priority: 'P1', rationale: 'x',
      }),
      /al menos una señal real/,
    );
  });

  test('rechaza un signalId que no existe en el snapshot', () => {
    const snap = 'snapshot-2026-06-02';
    createSnapshot(snap, { researchReportPath: 'docs/jun2.md' });
    assert.throws(
      () => saveOpportunity(snap, {
        title: 'Oportunidad huérfana', signalIds: ['no-existe'], angle: 'x', evidenceLevel: 'MEDIUM', priority: 'P1', rationale: 'x',
      }),
      /no existe la señal/,
    );
  });

  test('crea una oportunidad válida referenciando una señal real', () => {
    const snap = 'snapshot-2026-06-03';
    createSnapshot(snap, { researchReportPath: 'docs/jun3.md' });
    const signal = saveSignal(snap, trendFields({ title: 'Señal base' }));
    const opp = saveOpportunity(snap, {
      title: 'Oportunidad real', signalIds: [signal.id], audience: 'a', product: 'p',
      angle: 'ángulo de contenido', evidenceLevel: 'MEDIUM', priority: 'P1', rationale: 'justificación trazable',
    });
    assert.equal(opp.confidence, 0.5);
    assert.deepEqual([...opp.signalIds], [signal.id]);
    const recovered = getOpportunity(snap, opp.id);
    assert.equal(recovered.title, 'Oportunidad real');
    assert.equal(listOpportunities(snap).length, 1);
  });
});
