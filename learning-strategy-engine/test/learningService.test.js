import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { seedPublication, seedAttributionRecord } from '../../marketing-intelligence-engine/test/helpers/seed.js';
import { createLearningRecord } from '../src/learningRecord.js';
import {
  generateLearning, generateAndPersistLearning, listLearningRecords, summarizeLearning, listStrategyFeedback,
} from '../src/learningService.js';

describe('LearningService — Fase 17', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'lse-service-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('store vacío -- INSUFFICIENT_DATA explícito, resultado válido', () => {
    const result = generateLearning({ store });
    assert.equal(result.status, 'INSUFFICIENT_DATA');
    assert.deepEqual(result.learningRecords, []);
  });

  test('con datos reales: LearningRecord + StrategyFeedback, incluye DATA_QUALITY_LEARNING para las condiciones sin evidencia (Fase 22: atribución real es toda UNKNOWN)', () => {
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'video', product_ref: 'TéDivina', likes: 50 + i, views: 1000 });
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'image', likes: 3, views: 1000 });
    const outlier = seedPublication(store, { platform: 'instagram', format: 'video', likes: 5, views: 1000 });
    seedAttributionRecord(store, { contentId: outlier.content_id, platform: 'instagram', attributionType: 'UNKNOWN' });

    const result = generateLearning({ store });
    assert.equal(result.status, 'OK');
    assert.ok(result.learningRecords.length > 0);
    const types = new Set(result.learningRecords.map((r) => r.learningType));
    assert.ok(types.has('DATA_QUALITY_LEARNING'), 'atribución real UNKNOWN debe producir DATA_QUALITY_LEARNING, nunca un COMMERCIAL_LEARNING fabricado');
    assert.ok(!result.learningRecords.some((r) => r.learningType === 'COMMERCIAL_LEARNING'), 'sin evidencia de conversión/revenue real, nunca se inventa un COMMERCIAL_LEARNING');
    for (const lr of result.learningRecords) assert.doesNotMatch(lr.observation, /\bcausa\b/i);
  });

  test('idempotencia (Fase 17/23): dos corridas seguidas no duplican learning_record ni strategy_feedback', () => {
    const first = generateAndPersistLearning({ store });
    assert.ok(first.savedLearning.length > 0);
    const totalLearningAfterFirst = store.loadAll('learning_record').length;
    const totalFeedbackAfterFirst = store.loadAll('strategy_feedback').length;

    const second = generateAndPersistLearning({ store });
    assert.equal(second.savedLearning.length, 0);
    assert.equal(second.savedFeedback.length, 0);
    assert.equal(store.loadAll('learning_record').length, totalLearningAfterFirst);
    assert.equal(store.loadAll('strategy_feedback').length, totalFeedbackAfterFirst);
  });

  test('StrategyFeedback persistido referencia el id REAL y persistido del LearningRecord, nunca un id descartable de una regeneración en memoria', () => {
    const feedback = store.loadAll('strategy_feedback');
    const learning = store.loadAll('learning_record');
    const learningIds = new Set(learning.map((l) => l.id));
    for (const sf of feedback) assert.ok(learningIds.has(sf.learningId), `strategy_feedback.learningId ${sf.learningId} debe existir en learning_record`);
  });

  test('filtros de la API (Fase 18): learningType/confidence/product/format/platform', () => {
    const byType = listLearningRecords({ store, learningType: 'FORMAT_LEARNING' });
    assert.ok(byType.every((r) => r.learningType === 'FORMAT_LEARNING'));
    const byProduct = listLearningRecords({ store, product: 'TéDivina' });
    assert.ok(byProduct.every((r) => r.product === 'TéDivina'));
    const byFormat = listLearningRecords({ store, format: 'video' });
    assert.ok(byFormat.every((r) => r.format === 'video'));
  });

  test('GET de solo lectura nunca genera como efecto secundario (Fase 18/20)', () => {
    const beforeCount = store.loadAll('learning_record').length;
    listLearningRecords({ store });
    summarizeLearning({ store });
    listStrategyFeedback({ store });
    assert.equal(store.loadAll('learning_record').length, beforeCount);
  });

  test('summary agrega por tipo/confidence sobre lo ya persistido', () => {
    const summary = summarizeLearning({ store });
    assert.equal(summary.status, 'OK');
    assert.ok(summary.totalRecords > 0);
  });

  test('regresión: DataQualitySignal distintos que comparten scope/platform (ej. CONVERSION vs REVENUE ambos MISSING_ATTRIBUTION) no colisionan entre sí -- cada uno persiste como DATA_QUALITY_LEARNING propio', () => {
    const dataQuality = store.loadAll('learning_record').filter((lr) => lr.learningType === 'DATA_QUALITY_LEARNING');
    const keys = new Set(dataQuality.map((lr) => `${lr.scope}::${lr.platform}::${lr.evidence.category}`));
    assert.equal(keys.size, dataQuality.length, 'cada DATA_QUALITY_LEARNING (distinto category) debe persistir por separado, ninguno debe perderse por colisión de clave');
  });

  test('regresión: recomendaciones idénticas de texto sobre publicaciones DISTINTAS (ej. varios TOP_PERFORMER de la misma plataforma) generan StrategyFeedback separados, ninguno se pierde', () => {
    const totalGeneratedThisRun = generateLearning({ store }).strategyFeedback.length;
    const totalPersisted = store.loadAll('strategy_feedback').length;
    // idempotente: todo lo generado en una corrida limpia ya debe estar persistido -- ninguna recomendación real se pierde por compartir texto/scope/plataforma con otra de contenido distinto.
    assert.equal(totalGeneratedThisRun, totalPersisted);
  });

  test('regresión: CONTENT_LEARNING/ENGAGEMENT_LEARNING (publicación puntual) NUNCA se marcan supersededBy entre sí aunque compartan plataforma+producto -- no son la misma afirmación reevaluada, son publicaciones distintas', () => {
    const perContent = store.loadAll('learning_record').filter((lr) => ['CONTENT_LEARNING', 'ENGAGEMENT_LEARNING', 'PERFORMANCE_LEARNING'].includes(lr.learningType));
    assert.ok(perContent.length > 0, 'la corrida real de este test debe haber producido al menos un CONTENT_LEARNING/ENGAGEMENT_LEARNING');
    const annotated = listLearningRecords({ store }).filter((lr) => ['CONTENT_LEARNING', 'ENGAGEMENT_LEARNING', 'PERFORMANCE_LEARNING'].includes(lr.learningType));
    assert.ok(annotated.every((lr) => lr.supersededBy === null), 'ningún registro por-publicación debe tener supersededBy asignado');
  });
});

describe('Historial / supersesión (Fase 20) -- nunca se muta ni se borra el store', () => {
  test('un LearningRecord más reciente sobre el MISMO subject (learningType+platform+format+product) marca al anterior como supersededBy, sin eliminarlo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lse-history-'));
    const store = new PerformanceLearningStore(dir);

    const older = createLearningRecord({
      learningType: 'FORMAT_LEARNING', scope: 'instagram:format=video (N=5)', observation: 'Rendimiento inferior observado.',
      evidence: { delta: -0.15 }, evidenceCount: 5, confidence: 'MEDIUM', implication: 'x', recommendation: 'y',
      platform: 'instagram', format: 'video', relatedInsightIds: ['a'], relatedContentIds: ['c1'],
    });
    store.save('learning_record', older);

    const newer = createLearningRecord({
      learningType: 'FORMAT_LEARNING', scope: 'instagram:format=video (N=12)', observation: 'Rendimiento superior observado con más evidencia.',
      evidence: { delta: 0.30 }, evidenceCount: 12, confidence: 'HIGH', implication: 'x', recommendation: 'y',
      platform: 'instagram', format: 'video', relatedInsightIds: ['b'], relatedContentIds: ['c1', 'c2', 'c3'],
    });
    store.save('learning_record', newer);

    const records = listLearningRecords({ store });
    assert.equal(records.length, 2, 'ambos siguen existiendo -- nunca se borra el histórico');
    const olderRead = records.find((r) => r.id === older.id);
    const newerRead = records.find((r) => r.id === newer.id);
    assert.equal(olderRead.supersededBy, newer.id);
    assert.equal(newerRead.supersededBy, null);

    // el archivo real en disco nunca se reescribe -- ambos registros persisten tal cual se guardaron.
    const raw = store.loadAll('learning_record');
    assert.equal(raw.length, 2);
    assert.equal(raw[0].id, older.id);
    rmSync(dir, { recursive: true, force: true });
  });
});
