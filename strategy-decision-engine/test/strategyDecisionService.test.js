import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { CONSISTENCY_SAMPLE_SIZE } from '../src/decisionRules.js';
import { evaluateFeedback, generateStrategyDecisions, generateAndPersistStrategyDecisions, listStrategyDecisions, summarizeStrategyDecisions } from '../src/strategyDecisionService.js';
import { createStrategyDecision } from '../src/strategyDecision.js';
import { makeLearning, makeFeedback } from './helpers/fixtures.js';
import { seedPublication, seedAttributionRecord } from '../../marketing-intelligence-engine/test/helpers/seed.js';
import { generateAndPersistLearning } from '../../learning-strategy-engine/src/learningService.js';

describe('evaluateFeedback — Fase 4-17 (reglas determinísticas, sin ML/LLM)', () => {
  test('ACCEPT: confidence HIGH + evidenceCount suficiente + sin contradicciones -- executionStatus NOT_EXECUTED, expiresAt fijado (Fase 17/18)', () => {
    const lr = makeLearning({ confidence: 'HIGH', evidenceCount: 12 });
    const sf = makeFeedback(lr);
    const d = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });
    assert.equal(d.decision, 'ACCEPT');
    assert.equal(d.executionStatus, 'NOT_EXECUTED');
    assert.ok(d.expiresAt);
    assert.equal(d.risk, 'LOW'); // FORMAT_LEARNING
  });

  test('DEFER: confidence LOW (Fase 6)', () => {
    const lr = makeLearning({ confidence: 'LOW', evidenceCount: 12 });
    const sf = makeFeedback(lr);
    assert.equal(evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] }).decision, 'DEFER');
  });

  test('DEFER: confidence UNKNOWN (Fase 6)', () => {
    const lr = makeLearning({ confidence: 'UNKNOWN', evidenceCount: 1 });
    const sf = makeFeedback(lr, { confidence: 'UNKNOWN' });
    assert.equal(evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] }).decision, 'DEFER');
  });

  test('DEFER: evidenceCount por debajo del mínimo real (Fase 5/7) -- "todavía no sabemos", nunca REJECT', () => {
    const lr = makeLearning({ confidence: 'HIGH', evidenceCount: 2 });
    const sf = makeFeedback(lr);
    const d = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr], minSampleSize: 5 });
    assert.equal(d.decision, 'DEFER');
    assert.equal(d.evidence.deferRequirements.requiredSampleSize, 5);
  });

  test('DEFER: confidence MEDIUM sin consistencia adicional (Fase 6/8)', () => {
    const lr = makeLearning({ confidence: 'MEDIUM', evidenceCount: CONSISTENCY_SAMPLE_SIZE - 1 });
    const sf = makeFeedback(lr, { confidence: 'MEDIUM' });
    assert.equal(evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] }).decision, 'DEFER');
  });

  test('ACCEPT: confidence MEDIUM CON consistencia (evidenceCount >= 2xmin) -- candidato real (Fase 6/8)', () => {
    const lr = makeLearning({ confidence: 'MEDIUM', evidenceCount: CONSISTENCY_SAMPLE_SIZE });
    const sf = makeFeedback(lr, { confidence: 'MEDIUM' });
    assert.equal(evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] }).decision, 'ACCEPT');
  });

  test('DEFER: evidencia contradictoria comparable -- nunca acepta ni rechaza automáticamente ninguna de las dos (Fase 9)', () => {
    const a = makeLearning({ learningType: 'FORMAT_LEARNING', format: 'video', confidence: 'HIGH', evidenceCount: 12, evidence: { delta: 0.3, expectedDirection: 'IMPROVE' } });
    const b = makeLearning({ learningType: 'OPPORTUNITY_LEARNING', format: 'video', confidence: 'HIGH', evidenceCount: 14, evidence: { expectedDirection: 'INVESTIGATE' }, relatedContentIds: ['c9'] });
    const sf = makeFeedback(a);
    const d = evaluateFeedback({ feedback: sf, learningRecord: a, allLearningRecords: [a, b] });
    assert.equal(d.decision, 'DEFER');
    assert.equal(d.contradictions.length, 1);
  });

  test('REJECT: contradicción dominada por evidencia sustancialmente más fuerte (Fase 15)', () => {
    const weak = makeLearning({ learningType: 'FORMAT_LEARNING', format: 'video', confidence: 'MEDIUM', evidenceCount: CONSISTENCY_SAMPLE_SIZE, evidence: { delta: 0.15, expectedDirection: 'IMPROVE' } });
    const strong = makeLearning({ learningType: 'OPPORTUNITY_LEARNING', format: 'video', confidence: 'HIGH', evidenceCount: CONSISTENCY_SAMPLE_SIZE * 3, evidence: { expectedDirection: 'REDUCE' }, relatedContentIds: ['c9'] });
    const sf = makeFeedback(weak, { confidence: 'MEDIUM' });
    const d = evaluateFeedback({ feedback: sf, learningRecord: weak, allLearningRecords: [weak, strong] });
    assert.equal(d.decision, 'REJECT');
    assert.equal(d.contradictions.length, 1);
  });

  test('DEFER: COMMERCIAL_LEARNING sin evidencia real de atribución -- UNKNOWN attribution nunca es evidencia positiva (Fase 10)', () => {
    const lr = makeLearning({ learningType: 'COMMERCIAL_LEARNING', confidence: 'HIGH', evidenceCount: 12, evidence: { expectedDirection: 'IMPROVE' } });
    const sf = makeFeedback(lr);
    const d = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });
    assert.equal(d.decision, 'DEFER');
    assert.equal(d.evidence.reasonCode, 'UNKNOWN_ATTRIBUTION');
  });

  test('ACCEPT: COMMERCIAL_LEARNING CON evidencia real de atribución (Fase 10)', () => {
    const lr = makeLearning({ learningType: 'COMMERCIAL_LEARNING', confidence: 'HIGH', evidenceCount: 12, evidence: { expectedDirection: 'IMPROVE', nonUnknownCount: 3 } });
    const sf = makeFeedback(lr);
    const d = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });
    assert.equal(d.decision, 'ACCEPT');
    assert.equal(d.evidence.commercialEvidenceConfirmed, true);
    assert.equal(d.risk, 'HIGH'); // COMMERCIAL_LEARNING
  });

  test('DEFER: LearningRecord de origen no encontrado (defensivo)', () => {
    const lr = makeLearning();
    const sf = makeFeedback(lr);
    assert.equal(evaluateFeedback({ feedback: sf, learningRecord: null, allLearningRecords: [] }).decision, 'DEFER');
  });

  test('determinismo (Fase 4/27): misma entrada produce la misma decisión, siempre (sin ML/LLM)', () => {
    const lr = makeLearning({ confidence: 'HIGH', evidenceCount: 12 });
    const sf = makeFeedback(lr);
    const d1 = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });
    const d2 = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });
    assert.equal(d1.decision, d2.decision);
    assert.equal(d1.risk, d2.risk);
    assert.equal(d1.expectedImpact, d2.expectedImpact);
    assert.deepEqual(d1.contradictions, d2.contradictions);
  });
});

describe('StrategyDecisionService — integración real (Fase 21/26)', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'sde-service-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('store vacío -- INSUFFICIENT_DATA explícito, resultado válido', () => {
    assert.equal(generateStrategyDecisions({ store }).status, 'INSUFFICIENT_DATA');
  });

  test('con datos reales (vía learning-strategy-engine real): mezcla de decisiones, ninguna fabricada, nunca ejecutada', () => {
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'video', product_ref: 'TéDivina', likes: 50 + i, views: 1000 });
    for (let i = 0; i < 6; i++) seedPublication(store, { platform: 'instagram', format: 'image', likes: 3, views: 1000 });
    const outlier = seedPublication(store, { platform: 'instagram', format: 'video', likes: 5, views: 1000 });
    seedAttributionRecord(store, { contentId: outlier.content_id, platform: 'instagram', attributionType: 'UNKNOWN' });
    generateAndPersistLearning({ store });

    const result = generateStrategyDecisions({ store });
    assert.equal(result.status, 'OK');
    assert.ok(result.decisions.length > 0);
    assert.ok(result.decisions.every((d) => d.executionStatus === 'NOT_EXECUTED'));
    assert.ok(result.decisions.every((d) => ['ACCEPT', 'REJECT', 'DEFER'].includes(d.decision)));
  });

  test('regresión: TOP_PERFORMER/UNDERPERFORMER (CONTENT_LEARNING de publicaciones distintas) nunca producen REJECT por "SUPERSEDED_BY_CONTRADICTING_EVIDENCE" solo por compartir plataforma+producto -- en este dataset (sin contradicción estratégica real) no debe aparecer ese reasonCode en absoluto', () => {
    const result = generateStrategyDecisions({ store });
    assert.equal(result.decisions.filter((d) => d.evidence.reasonCode === 'SUPERSEDED_BY_CONTRADICTING_EVIDENCE').length, 0);
  });

  test('idempotencia (Fase 19): dos corridas seguidas no duplican strategy_decision', () => {
    const first = generateAndPersistStrategyDecisions({ store });
    assert.ok(first.saved.length > 0);
    const totalAfterFirst = store.loadAll('strategy_decision').length;
    const second = generateAndPersistStrategyDecisions({ store });
    assert.equal(second.saved.length, 0);
    assert.equal(store.loadAll('strategy_decision').length, totalAfterFirst);
  });

  test('regresión de colisión (Fase 19): dos StrategyDecision de scope/plataforma/riesgo idénticos pero strategyFeedbackId DISTINTO nunca colapsan entre sí', () => {
    const d1 = createStrategyDecision({ strategyFeedbackId: 'sf-A', decision: 'DEFER', decisionReason: 'x', evidence: { reasonCode: 'CONFIDENCE_LOW' }, confidence: 'LOW', evidenceCount: 3, scope: 'instagram (N=3)', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'UNKNOWN', risk: 'LOW' });
    const d2 = createStrategyDecision({ strategyFeedbackId: 'sf-B', decision: 'DEFER', decisionReason: 'x', evidence: { reasonCode: 'CONFIDENCE_LOW' }, confidence: 'LOW', evidenceCount: 3, scope: 'instagram (N=3)', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'UNKNOWN', risk: 'LOW' });
    const dedupeDir = mkdtempSync(join(tmpdir(), 'sde-collision-'));
    const dedupeStore = new PerformanceLearningStore(dedupeDir);
    dedupeStore.save('strategy_decision', d1);
    dedupeStore.save('strategy_decision', d2);
    const all = dedupeStore.loadAll('strategy_decision');
    assert.equal(all.length, 2, 'ambas decisiones son reales y distintas (feedback distinto) -- scope/platform/decision idénticos no deben colapsarlas');
    rmSync(dedupeDir, { recursive: true, force: true });
  });

  test('filtros de la API (Fase 22): decision/risk/confidence/scope', () => {
    const accepted = listStrategyDecisions({ store, decision: 'ACCEPT' });
    assert.ok(accepted.every((d) => d.decision === 'ACCEPT'));
    const byRisk = listStrategyDecisions({ store, risk: 'LOW' });
    assert.ok(byRisk.every((d) => d.risk === 'LOW'));
  });

  test('GET de solo lectura nunca genera como efecto secundario, y ninguna decisión tiene otro executionStatus que NOT_EXECUTED (Fase 20/24)', () => {
    const beforeCount = store.loadAll('strategy_decision').length;
    listStrategyDecisions({ store });
    summarizeStrategyDecisions({ store });
    assert.equal(store.loadAll('strategy_decision').length, beforeCount);
    assert.ok(listStrategyDecisions({ store }).every((d) => d.executionStatus === 'NOT_EXECUTED'));
  });

  test('preservación histórica (Fase 18/20): ninguna decisión previa se pierde ni se muta al agregar una nueva sobre el mismo feedback con evidencia distinta', () => {
    const lineageDir = mkdtempSync(join(tmpdir(), 'sde-lineage-'));
    const lineageStore = new PerformanceLearningStore(lineageDir);
    const old = createStrategyDecision({ strategyFeedbackId: 'sf-X', decision: 'DEFER', decisionReason: 'x', evidence: { reasonCode: 'SAMPLE_SIZE_INSUFFICIENT' }, confidence: 'MEDIUM', evidenceCount: 4, scope: 's', scopeType: 'FORMAT', expectedImpact: 'UNKNOWN', risk: 'LOW' });
    lineageStore.save('strategy_decision', old);

    const lr = makeLearning({ evidenceCount: 12, confidence: 'HIGH' });
    // Simula una nueva evaluación con MÁS evidencia para el MISMO StrategyFeedback real (sf-X).
    const sf = { id: 'sf-X', confidence: 'HIGH', affectedPlatform: 'instagram', affectedFormat: 'video', affectedProduct: null, expectedDirection: 'IMPROVE', evidence: { scope: lr.scope, evidenceCount: 12 } };
    const fresh = evaluateFeedback({ feedback: sf, learningRecord: lr, allLearningRecords: [lr] });

    // Persistimos manualmente igual que lo haría el service (sin depender de generateStrategyDecisions, que no conoce este feedback sintético).
    const existing = lineageStore.loadAll('strategy_decision');
    const withLineage = { ...fresh, supersedes: existing[0].id };
    lineageStore.save('strategy_decision', withLineage);

    const all = lineageStore.loadAll('strategy_decision');
    assert.equal(all.length, 2, 'la decisión anterior nunca se borra');
    assert.equal(all[0].id, old.id, 'el registro anterior permanece intacto en disco');
    assert.equal(all[1].supersedes, old.id, 'la nueva decisión declara su lineage hacia la anterior');
    rmSync(lineageDir, { recursive: true, force: true });
  });
});
