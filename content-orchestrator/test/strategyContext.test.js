// strategyContext.test.js — Fase 11 (Strategy-Aware Content Generation).
// Store aislado real (tmpdir), StrategyDecision/StrategyFeedback
// construidos con los contratos reales de strategy-decision-engine/
// learning-strategy-engine -- ningún fixture inventado fuera de esos
// contratos ya validados.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { createStrategyDecision } from '../../strategy-decision-engine/src/strategyDecision.js';
import { createStrategyFeedback } from '../../learning-strategy-engine/src/strategyFeedback.js';
import { buildStrategyContext } from '../src/strategyContext.js';

function seedFeedback(store, { learningId = 'lr-1', overrides = {} } = {}) {
  const sf = createStrategyFeedback({
    learningId, recommendation: 'Evaluar mayor proporción de este formato.', rationale: 'Existe una señal para priorizar.',
    evidence: { scope: 'x', evidenceCount: 12 }, confidence: 'HIGH', affectedPlatform: 'instagram', expectedDirection: 'IMPROVE',
    ...overrides,
  });
  store.save('strategy_feedback', sf);
  return sf;
}

function seedDecision(store, feedback, overrides = {}) {
  const d = createStrategyDecision({
    strategyFeedbackId: feedback.id, decision: 'ACCEPT', decisionReason: 'La recomendación cumple evidencia mínima.',
    evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' }, confidence: 'HIGH', evidenceCount: 12,
    scope: 'instagram (N=12)', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedDirection: 'IMPROVE',
    expectedImpact: 'MEDIUM', risk: 'LOW',
    ...overrides,
  });
  store.save('strategy_decision', d);
  return d;
}

describe('buildStrategyContext — Fases 2-7', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'sc-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('sin ninguna StrategyDecision -- applied:false, resultado válido (nunca fabrica contexto)', () => {
    const ctx = buildStrategyContext({ store });
    assert.equal(ctx.applied, false);
    assert.equal(ctx.reason, 'NO_ACCEPT_DECISIONS');
  });

  test('ACCEPT scope PLATFORM (instagram) -> preferredPlatformProfile=INSTAGRAM_REEL, evidencia/confidence preservados tal cual (Fase 7: nunca causalidad)', () => {
    const sf = seedFeedback(store);
    const d = seedDecision(store, sf);
    const ctx = buildStrategyContext({ store });
    assert.equal(ctx.applied, true);
    assert.equal(ctx.preferredPlatformProfile, 'INSTAGRAM_REEL');
    assert.equal(ctx.confidence, 'HIGH');
    assert.equal(ctx.strategicDirection, 'IMPROVE');
    assert.equal(ctx.priority, 'HIGH');
    assert.deepEqual(ctx.strategyDecisionIds, [d.id]);
    assert.deepEqual(ctx.learningIds, [sf.learningId]);
    assert.doesNotMatch(ctx.rationale, /\bcausa\b/i);
  });

  test('ACCEPT scope FORMAT -- se conserva format en el contexto (informativo/trazable), preferredPlatformProfile queda null', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-format-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sf = seedFeedback(store2, { affectedPlatform: null });
    seedDecision(store2, sf, { scopeType: 'FORMAT', affectedPlatform: null, affectedFormat: 'video', scope: 'instagram:format=video (N=12)' });
    const ctx = buildStrategyContext({ store: store2 });
    assert.equal(ctx.applied, true);
    assert.equal(ctx.format, 'video');
    assert.equal(ctx.preferredPlatformProfile, null);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('ACCEPT scope PRODUCT -- solo aplica cuando productName (nombreComercial) coincide (Fase 4: no ampliar el alcance)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-product-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sf = seedFeedback(store2, { affectedPlatform: null, learningId: 'lr-product' });
    seedDecision(store2, sf, { scopeType: 'PRODUCT', affectedPlatform: null, affectedProduct: 'TéDivina', scope: 'product=TéDivina (N=11)' });

    assert.equal(buildStrategyContext({ store: store2, productId: 'tedivina', productName: 'OtroProducto' }).applied, false);
    const ctx = buildStrategyContext({ store: store2, productId: 'tedivina', productName: 'TéDivina' });
    assert.equal(ctx.applied, true);
    assert.equal(ctx.product, 'TéDivina');
    rmSync(dir2, { recursive: true, force: true });
  });

  test('regresión (hallazgo real de la Fase 19): productId (slug, "tedivina") NUNCA se usa para matchear scope PRODUCT -- StrategyDecision.affectedProduct guarda el nombreComercial real ("TéDivina"), no el slug', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-vocab-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sf = seedFeedback(store2, { affectedPlatform: null, learningId: 'lr-vocab' });
    seedDecision(store2, sf, { scopeType: 'PRODUCT', affectedPlatform: null, affectedProduct: 'TéDivina', scope: 'product=TéDivina' });

    // Pasar solo productId (slug) sin productName NUNCA debe matchear -- aunque "se refieran al mismo producto", no se asume una equivalencia por normalización de texto.
    assert.equal(buildStrategyContext({ store: store2, productId: 'tedivina' }).applied, false);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('DEFER nunca alimenta el contexto (Fase 5)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-defer-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sf = seedFeedback(store2, { confidence: 'LOW' });
    store2.save('strategy_decision', createStrategyDecision({
      strategyFeedbackId: sf.id, decision: 'DEFER', decisionReason: 'x', evidence: { reasonCode: 'CONFIDENCE_LOW' },
      confidence: 'LOW', evidenceCount: 3, scope: 'x', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'UNKNOWN', risk: 'LOW',
    }));
    assert.equal(buildStrategyContext({ store: store2 }).applied, false);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('REJECT nunca alimenta el contexto (Fase 5)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-reject-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sf = seedFeedback(store2);
    store2.save('strategy_decision', createStrategyDecision({
      strategyFeedbackId: sf.id, decision: 'REJECT', decisionReason: 'x', evidence: { reasonCode: 'DOMINATED_BY_STRONGER_CONTRADICTION' },
      confidence: 'MEDIUM', evidenceCount: 6, scope: 'x', scopeType: 'PLATFORM', affectedPlatform: 'instagram', expectedImpact: 'UNKNOWN', risk: 'LOW',
      contradictions: [{ learningId: 'other' }],
    }));
    assert.equal(buildStrategyContext({ store: store2 }).applied, false);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('múltiples ACCEPT: PRODUCT (más específico) gana sobre PLATFORM cuando productName coincide (Fase 6, sin LLM)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-priority-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sfPlatform = seedFeedback(store2, { learningId: 'lr-platform' });
    seedDecision(store2, sfPlatform, { scopeType: 'PLATFORM', affectedPlatform: 'facebook' });
    const sfProduct = seedFeedback(store2, { learningId: 'lr-product', affectedPlatform: null });
    seedDecision(store2, sfProduct, { scopeType: 'PRODUCT', affectedPlatform: null, affectedProduct: 'TéDivina', scope: 'product=TéDivina' });

    const ctx = buildStrategyContext({ store: store2, productId: 'tedivina', productName: 'TéDivina' });
    assert.equal(ctx.scopeType, 'PRODUCT');
    rmSync(dir2, { recursive: true, force: true });
  });

  test('mayor confidence gana entre dos ACCEPT del mismo scopeType (Fase 6 §2)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-confidence-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sfLow = seedFeedback(store2, { learningId: 'lr-low', confidence: 'MEDIUM' });
    seedDecision(store2, sfLow, { affectedPlatform: 'facebook', confidence: 'MEDIUM' });
    const sfHigh = seedFeedback(store2, { learningId: 'lr-high' });
    seedDecision(store2, sfHigh, { affectedPlatform: 'instagram', confidence: 'HIGH' });

    const ctx = buildStrategyContext({ store: store2 });
    assert.equal(ctx.confidence, 'HIGH');
    assert.equal(ctx.platform, 'instagram');
    rmSync(dir2, { recursive: true, force: true });
  });

  test('plataforma sin traducción utilizable (ej. youtube_shorts) -- se prueba la siguiente candidata, nunca inventa un Output Profile', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'sc-untranslatable-'));
    const store2 = new PerformanceLearningStore(dir2);
    const sfYt = seedFeedback(store2, { learningId: 'lr-yt' });
    seedDecision(store2, sfYt, { affectedPlatform: 'youtube_shorts', confidence: 'HIGH', evidenceCount: 20 });
    const sfIg = seedFeedback(store2, { learningId: 'lr-ig' });
    seedDecision(store2, sfIg, { affectedPlatform: 'instagram', confidence: 'LOW', evidenceCount: 5 });

    const ctx = buildStrategyContext({ store: store2 });
    assert.equal(ctx.applied, true);
    assert.equal(ctx.platform, 'instagram'); // la de youtube_shorts (mejor ranking) no tiene traducción -- se descarta y se usa la siguiente
    rmSync(dir2, { recursive: true, force: true });
  });
});
