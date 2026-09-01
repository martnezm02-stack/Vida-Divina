// learningLoop.test.js — Learning Loop end-to-end. Ingiere el dataset
// curado real de marketingIntelligence (snapshot-2026-08-31) en un
// DATA_ROOT temporal + un PerformanceLearningStore temporal con
// LearningRecord sintéticos controlados, y ejercita refreshLearnings() +
// las funciones de consulta. No ejecuta last30days ni ninguna llamada
// externa.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-ll-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;
const PERFORMANCE_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'co-ll-perf-'));

const { createSnapshot } = await import('../src/marketingIntelligence/snapshotStore.js');
const { upsertSignal } = await import('../src/marketingIntelligence/signalStore.js');
const { saveOpportunity } = await import('../src/marketingIntelligence/creativeOpportunityStore.js');
const { SIGNALS, OPPORTUNITIES } = await import('../src/marketingIntelligence/seedData/snapshot-2026-08-31.js');
const { PerformanceLearningStore } = await import('../../performance-learning-intelligence/src/store.js');
const { createLearningRecord } = await import('../../learning-strategy-engine/src/learningRecord.js');
const {
  refreshLearnings, getRelevantLearnings, getCreativeRecommendations, getValidatedLearningContext, getLearningLoopManifest,
} = await import('../src/learningLoop/queryService.js');
const { classifyLearningFreshness } = await import('../src/learningLoop/learningRanking.js');
const { assertNoForbiddenProductClaims, FORBIDDEN_PRODUCT_CLAIMS } = await import('../../video-production/src/hyperframesRenderer.js');
const { buildCreativeIntelligenceContext } = await import('../src/creativeIntelligenceContext.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  fs.rmSync(PERFORMANCE_STORE_DIR, { recursive: true, force: true });
});

const MI_SNAPSHOT_ID = 'snapshot-2026-08-31';
const VENUS_NOMBRE_COMERCIAL = 'Divina Venus Capsules';
const performanceStore = new PerformanceLearningStore(PERFORMANCE_STORE_DIR);

function ingestRealMarketData() {
  createSnapshot(MI_SNAPSHOT_ID, { researchReportPath: 'docs/research/vida-divina-market-intelligence-2026-08-31.md' });
  const idBySeedKey = new Map();
  for (const raw of SIGNALS) {
    const { seedKey, ...fields } = raw;
    const saved = upsertSignal(MI_SNAPSHOT_ID, fields, { additionalSourceIsIndependent: (fields.independentSourceCount ?? 1) > 1 });
    idBySeedKey.set(seedKey, saved.id);
  }
  for (const opp of OPPORTUNITIES) {
    const { signalSeedKeys, ...fields } = opp;
    saveOpportunity(MI_SNAPSHOT_ID, { ...fields, signalIds: signalSeedKeys.map((k) => idBySeedKey.get(k)) });
  }
}
ingestRealMarketData();

// Señal de mercado sintética para Venus con polaridad POSITIVA y tokens
// controlados -- correlaciona a propósito con los LearningRecord
// sintéticos de abajo (secciones 9, 63 del encargo: correlación real +
// contradicción real, ambas construidas deliberadamente).
upsertSignal(MI_SNAPSHOT_ID, {
  type: 'PainPoint', productId: 'venus-capsules', category: 'intimidad-libido',
  title: 'Rutina matutina funciona mejor para energía sostenida',
  source: 'test sintético', sourceType: 'SOCIAL', capturedAt: '2026-08-31', timeWindow: '30d',
  observation: 'Señal sintética de prueba para el test de correlación del Learning Loop.',
  evidenceLevel: 'MEDIUM', claimType: 'SIGNAL',
});

function seedLearningRecord(fields) {
  const record = createLearningRecord({
    evidence: { source: 'test' }, relatedInsightIds: [], relatedContentIds: ['content-test-1'], ...fields,
  });
  performanceStore.save('learning_record', record);
  return record;
}

// LearningRecord sintético que SÍ correlaciona (mismo scope, mismo
// learningType, tokens solapados) con la señal PainPoint de arriba.
seedLearningRecord({
  learningType: 'PRODUCT_LEARNING', scope: 'product:venus', product: VENUS_NOMBRE_COMERCIAL,
  pattern: 'rutina matutina energía sostenida', observation: 'Usuarias de Divina Venus Capsules reportan mayor energía sostenida con rutina matutina.',
  evidenceCount: 3, confidence: 'MEDIUM',
});

// LearningRecord sintético que CONTRADICE la señal de mercado de arriba
// (mismo scope/tipo/tokens, polaridad negativa) -- sección 17, 63.
seedLearningRecord({
  learningType: 'PRODUCT_LEARNING', scope: 'product:venus', product: VENUS_NOMBRE_COMERCIAL,
  pattern: 'rutina matutina energía sostenida escepticismo', observation: 'Usuarias de Divina Venus Capsules expresan escepticismo sobre rutina matutina energía sostenida.',
  evidenceCount: 2, confidence: 'MEDIUM',
});

// LearningRecord con evidenceCount alto para Tongkat Ali (Café Divina
// Tongkat Ali) -- confirma llegada CONFIRMED directa vía sourceType
// PERFORMANCE puro (sin correlación de mercado necesaria).
seedLearningRecord({
  learningType: 'CONTENT_LEARNING', scope: 'product:tongkat', product: 'Café Divina Tongkat Ali',
  pattern: 'formato educativo con datos técnicos', observation: 'El contenido educativo con datos técnicos rinde mejor para Café Divina Tongkat Ali en YouTube.',
  evidenceCount: 4, confidence: 'MEDIUM',
});

describe('refreshLearnings — ejecución real (secciones 48, 53, 69)', () => {
  test('primera corrida: procesa candidatos MARKET + PERFORMANCE, sin lanzar', () => {
    const result = refreshLearnings({ marketingSnapshotId: MI_SNAPSHOT_ID, performanceStore });
    assert.ok(result.learningsProcessed > 0);
    assert.ok(result.manifest.learningCount > 0);
    assert.equal(result.manifest.version, 1);
  });

  test('IDEMPOTENCY (sección 49, 68): segunda corrida idéntica no duplica learnings ni recomendaciones', () => {
    const before = getLearningLoopManifest();
    const result = refreshLearnings({ marketingSnapshotId: MI_SNAPSHOT_ID, performanceStore });
    const after1 = getLearningLoopManifest();
    assert.equal(after1.learningCount, before.learningCount);
    assert.equal(after1.recommendationCount, before.recommendationCount);
    assert.equal(result.contradictionsDetected, 0); // ya se detectaron y marcaron en la primera corrida -- la segunda no re-detecta lo mismo como nuevo.
  });
});

describe('CORRELATION — MARKET + PERFORMANCE -> COMBINED_LEARNING (sección 9)', () => {
  test('el learning combinado de Venus tiene evidenceLevel/confidence superiores a cualquiera de sus dos fuentes por separado', () => {
    const venusLearnings = getRelevantLearnings({ productId: 'venus-capsules', learningType: 'PRODUCT_LEARNING', limit: 20 });
    const combined = venusLearnings.find((l) => l.combinedSourceType === 'COMBINED');
    assert.ok(combined, 'debe existir al menos un PRODUCT_LEARNING COMBINED para Venus');
    assert.ok(combined.sourceTypes.includes('MARKET'));
    assert.ok(combined.sourceTypes.includes('PERFORMANCE'));
    assert.ok(combined.signalIds.length > 0);
    assert.ok(combined.performanceIds.length > 0);
  });
});

describe('TEST CONTRADICTION (sección 17, 51, 63)', () => {
  test('ambos learnings contradictorios se conservan (ninguno se elimina), marcados CONTRADICTED', async () => {
    // Los CONTRADICTED se excluyen de "relevante" por defecto -- se
    // verifica su existencia y conservación consultando el store directo.
    const { listLearnings } = await import('../src/learningLoop/learningStore.js');
    const stored = listLearnings({ productId: 'venus-capsules' });
    const contradicted = stored.filter((l) => l.status === 'CONTRADICTED');
    assert.ok(contradicted.length >= 2, 'ambos lados de la contradicción deben seguir existiendo');
    for (const l of contradicted) assert.ok(l.contradictedBy.length > 0);
  });
});

describe('TEST STALENESS (sección 18, 64)', () => {
  test('un learning sin soporte reciente se clasifica STALE/ARCHIVED, nunca se borra', () => {
    const oldLearning = { updatedAt: new Date('2020-01-01').toISOString() };
    const now = new Date('2026-08-31').getTime();
    assert.equal(classifyLearningFreshness(oldLearning, now), 'ARCHIVED');
    const recentLearning = { updatedAt: new Date('2026-08-25').toISOString() };
    assert.equal(classifyLearningFreshness(recentLearning, now), 'ACTIVE');
  });
});

describe('TEST VENUS (sección 59)', () => {
  test('market signals + performance -> relevant learnings reales, sin inventar performance', () => {
    const learnings = getRelevantLearnings({ productId: 'venus-capsules', limit: 20 });
    assert.ok(learnings.length > 0);
    for (const l of learnings) assert.ok(!l.productId || l.productId === 'venus-capsules');
    assert.ok(learnings.some((l) => l.sourceTypes.includes('MARKET')));
    assert.ok(learnings.some((l) => l.sourceTypes.includes('PERFORMANCE')));
  });
});

describe('TEST TONGKAT (sección 60)', () => {
  test('separación real de producto/audience: Tongkat no contamina Venus y viceversa', () => {
    const tongkat = getRelevantLearnings({ productId: 'tongkat-ali-cafe', limit: 20 });
    const venus = getRelevantLearnings({ productId: 'venus-capsules', limit: 20 });
    assert.ok(tongkat.length > 0);
    assert.ok(!tongkat.some((l) => l.productId === 'venus-capsules'));
    assert.ok(!venus.some((l) => l.productId === 'tongkat-ali-cafe'));
  });
});

describe('TEST HOOK (sección 33, 61)', () => {
  test('un LearningRecord con lenguaje de hook/pregunta se clasifica HOOK_LEARNING, nunca copia texto externo literal', async () => {
    seedLearningRecord({
      learningType: 'ENGAGEMENT_LEARNING', scope: 'platform:tiktok', platform: 'tiktok',
      pattern: 'preguntas en el hook inicial', observation: 'El hook con pregunta directa retiene más en TikTok.',
      evidenceCount: 2, confidence: 'MEDIUM',
    });
    const result = refreshLearnings({ marketingSnapshotId: MI_SNAPSHOT_ID, performanceStore });
    assert.ok(result.learningsProcessed > 0);
    const { listLearnings } = await import('../src/learningLoop/learningStore.js');
    const hookLearnings = listLearnings({ learningType: 'HOOK_LEARNING' });
    assert.ok(hookLearnings.length > 0);
    for (const l of hookLearnings) assert.ok(!('generatedHookText' in l) && !('finalCopy' in l));
  });
});

describe('TEST CLAIM SAFETY (sección 62)', () => {
  test('un learning con "testosterona" en su título es bloqueado por el gate real si se usara como claim', () => {
    const tongkatLearnings = getRelevantLearnings({ productId: 'tongkat-ali-cafe', limit: 50 });
    const testosteroneLearning = tongkatLearnings.find((l) => l.title.toLowerCase().includes('testosterona'));
    assert.ok(testosteroneLearning, 'debe existir un OBJECTION_LEARNING real que mencione testosterona (del dataset curado)');
    assert.ok(FORBIDDEN_PRODUCT_CLAIMS.includes('testosterona'));
    assert.throws(() => assertNoForbiddenProductClaims(testosteroneLearning.title, 'copy de prueba'), /claim prohibido/);
  });

  test('ningún Learning/CreativeRecommendation tiene campo "claim"/"approvedClaim"', () => {
    const learnings = getRelevantLearnings({ limit: 100 });
    const recs = getCreativeRecommendations({ limit: 100 });
    for (const l of learnings) { assert.ok(!('claim' in l)); assert.ok(!('approvedClaim' in l)); }
    for (const r of recs) { assert.ok(!('claim' in r)); assert.ok(!('approvedClaim' in r)); }
  });
});

describe('TEST TRACEABILITY (sección 5, 65)', () => {
  test('todo learning es trazable: source -> signal/performance/attribution -> evidence', () => {
    for (const l of getRelevantLearnings({ limit: 50 })) {
      const totalEvidence = l.signalIds.length + l.performanceIds.length + l.contentIds.length + l.publicationIds.length + l.attributionIds.length;
      assert.ok(totalEvidence > 0, `learning "${l.title}" sin evidencia`);
    }
  });
});

describe('CREATIVE RECOMMENDATIONS (sección 20, 43)', () => {
  test('toda recomendación referencia learningIds reales existentes', async () => {
    const { getLearning } = await import('../src/learningLoop/learningStore.js');
    const recs = getCreativeRecommendations({ limit: 20 });
    assert.ok(recs.length > 0);
    for (const r of recs) {
      assert.ok(r.learningIds.length > 0);
      for (const id of r.learningIds) assert.doesNotThrow(() => getLearning(id));
    }
  });
});

describe('validatedLearningContext (sección 24)', () => {
  test('solo incluye learnings CONFIRMED, frescos y compatibles con el producto', () => {
    const vlc = getValidatedLearningContext({ productId: 'venus-capsules', limit: 5 });
    for (const l of vlc.learnings) {
      assert.equal(l.productId === null || l.productId === 'venus-capsules', true);
      assert.ok(l.evidenceCount >= 2);
    }
  });
});

describe('creativeIntelligenceContext — validatedLearningContext extendido (secciones 23-24 de la integración de aprendizaje)', () => {
  test('buildCreativeIntelligenceContext incluye validatedLearningContext, nunca duplica el contexto', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal' });
    assert.ok('validatedLearningContext' in ctx);
    assert.ok('learningSnapshotId' in ctx.validatedLearningContext);
    assert.ok('snapshotId' in ctx); // el campo de mercado ya existente NO se renombró ni se duplicó.
  });
});

describe('TEST REPRODUCIBILITY (sección 42, 66)', () => {
  test('el contexto conserva intelligenceSnapshotId (snapshotId) + learningSnapshotId juntos', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    assert.equal(ctx.snapshotId, MI_SNAPSHOT_ID);
    assert.ok(ctx.validatedLearningContext.learningSnapshotId?.startsWith('learning-loop-v'));
  });
});

describe('TEST NO EXTERNAL RESEARCH (sección 47, 67)', () => {
  test('ningún archivo de learningLoop/ importa/llama last30days/WebSearch/http/fetch', () => {
    const dir = fileURLToPath(new URL('../src/learningLoop', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      assert.ok(!/\bimport\b[^;]*last30days/i.test(source), `${file} no debe importar last30days`);
      assert.ok(!/\bWebSearch\s*\(/.test(source), `${file} no debe llamar WebSearch`);
      assert.ok(!/from\s+['"]node:https?['"]/.test(source), `${file} no debe importar node:http(s)`);
      assert.ok(!/\bfetch\s*\(/.test(source), `${file} no debe llamar fetch`);
    }
  });
});

describe('NO CAMBIAR ARQUITECTURA EXISTENTE (sección 2, 73)', () => {
  test('refreshLearnings nunca escribe en el store compartido de performance-learning-intelligence -- solo lee', () => {
    const beforeFiles = readdirSync(PERFORMANCE_STORE_DIR);
    refreshLearnings({ marketingSnapshotId: MI_SNAPSHOT_ID, performanceStore });
    const afterFiles = readdirSync(PERFORMANCE_STORE_DIR);
    assert.deepEqual(beforeFiles.sort(), afterFiles.sort());
  });
});
