// hypothesisBatch.test.js — Creative Factory: generación incremental/masiva
// por batch (2026-08-23). Root cause real corregido: "Sugerir variantes"
// era stateless -- selectVariantBlueprints(count) siempre devolvía los
// mismos N primeros VARIANT_BLUEPRINTS, sin memoria entre llamadas.
//
// 100% local: sin red, sin Voice Engine, sin ffmpeg. Usa un directorio
// temporal aislado (CREATIVE_INTELLIGENCE_DATA_ROOT) para nunca escribir
// batches de prueba dentro de creative-intelligence/data/ real -- mismo
// criterio que cycleStore.test.js/productionArtifactStore pattern.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hypothesis-batch-test-'));
// Aísla SOLO el store de Batches (independiente de CREATIVE_INTELLIGENCE_DATA_ROOT
// -- ver hypothesisBatchStore.js) para no interferir con los CreativeCells
// reales que otros módulos de creative-intelligence puedan leer en el
// mismo proceso.
process.env.HYPOTHESIS_BATCH_DATA_ROOT = TEST_DATA_ROOT;

const { buildProductGroundedEvidence } = await import('../src/productGroundedEvidence.js');
const { buildHypothesisExperiment } = await import('../src/hypothesisCreativeEngine.js');
const {
  saveBatch, listBatchesForCampaign, getCampaignBatchState,
} = await import('../../creative-intelligence/src/hypothesisBatchStore.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

const CAMPAIGN_ID = 'ripped-capsules';
const evidence = buildProductGroundedEvidence(CAMPAIGN_ID);

/** Simula exactamente lo que hace handleSuggestHypothesisVariants: lee el estado real de la campaña, genera, y persiste el batch resultante. */
function generateAndSaveBatch(variantCount) {
  const { nextBatchNumber, blueprintOffset, usedFingerprints } = getCampaignBatchState(CAMPAIGN_ID);
  const result = buildHypothesisExperiment({
    productGroundedEvidence: evidence, variantCount, batchOffset: blueprintOffset, excludeFingerprints: usedFingerprints,
  });
  assert.equal(result.status, 'HYPOTHESIS_EXPERIMENT_READY');
  const fingerprints = result.variantsDetail.map((v) => v.fingerprint);
  const saved = saveBatch({
    batchId: `batch-${nextBatchNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    campaignId: CAMPAIGN_ID,
    batchNumber: nextBatchNumber,
    generationId: `gen-${nextBatchNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    variantCount: result.variantsDetail.length,
    blueprintOffsetStart: blueprintOffset,
    fingerprints,
    variantsDetail: result.variantsDetail,
  });
  return { result, batchNumber: nextBatchNumber, batchId: saved.batchId, fingerprints };
}

describe('Creative Factory — generación incremental por batch', () => {
  test('Test 1: primer batch genera N variantes reales', () => {
    const { result } = generateAndSaveBatch(5);
    assert.equal(result.variantsDetail.length, 5);
  });

  test('Test 2: segundo batch genera N variantes NUEVAS', () => {
    const { result } = generateAndSaveBatch(5);
    assert.equal(result.variantsDetail.length, 5);
  });

  test('Test 3: Batch #2 no contiene duplicados de Batch #1', () => {
    const batches = listBatchesForCampaign(CAMPAIGN_ID);
    assert.equal(batches.length, 2);
    const fps1 = new Set(batches[0].fingerprints);
    const fps2 = batches[1].fingerprints;
    const overlap = fps2.filter((fp) => fps1.has(fp));
    assert.deepEqual(overlap, []);
  });

  test('Test 4: tercer batch evita duplicados de los dos anteriores', () => {
    const before = listBatchesForCampaign(CAMPAIGN_ID);
    const allPreviousFps = new Set(before.flatMap((b) => b.fingerprints));
    const { result } = generateAndSaveBatch(5);
    const newFps = result.variantsDetail.map((v) => v.fingerprint);
    const overlap = newFps.filter((fp) => allPreviousFps.has(fp));
    assert.deepEqual(overlap, []);
    assert.equal(new Set(newFps).size, newFps.length); // sin duplicados internos tampoco
  });

  test('Test 5: las variantes de los batches anteriores permanecen disponibles (persistidas, no reemplazadas)', () => {
    const batches = listBatchesForCampaign(CAMPAIGN_ID);
    assert.equal(batches.length, 3);
    assert.equal(batches[0].batchNumber, 1);
    assert.equal(batches[1].batchNumber, 2);
    assert.equal(batches[2].batchNumber, 3);
    // Cada batch conserva su propio variantsDetail completo, real, no un resumen vacío.
    for (const b of batches) {
      assert.equal(b.variantsDetail.length, 5);
      assert.ok(b.variantsDetail[0].copy.hook?.length > 0);
    }
  });

  test('Test 6: generationId/batchId son distintos entre batches', () => {
    const batches = listBatchesForCampaign(CAMPAIGN_ID);
    const batchIds = batches.map((b) => b.batchId);
    const generationIds = batches.map((b) => b.generationId);
    assert.equal(new Set(batchIds).size, batchIds.length);
    assert.equal(new Set(generationIds).size, generationIds.length);
  });

  test('Test 7: el batch size configurable funciona (no hardcodeado a 3)', () => {
    const campaignId2 = 'te-divina';
    const evidence2 = buildProductGroundedEvidence(campaignId2);
    const r10 = buildHypothesisExperiment({ productGroundedEvidence: evidence2, variantCount: 10, batchOffset: 0 });
    assert.equal(r10.variantsDetail.length, 10);
    const r20 = buildHypothesisExperiment({ productGroundedEvidence: evidence2, variantCount: 20, batchOffset: 100 });
    assert.equal(r20.variantsDetail.length, 20);
  });

  test('otra campaña (producto distinto) empieza su propio batch #1, sin heredar el historial de "ripped-capsules"', () => {
    const otherCampaignId = 'cappuccino';
    const state = getCampaignBatchState(otherCampaignId);
    assert.equal(state.nextBatchNumber, 1);
    assert.equal(state.blueprintOffset, 0);
    assert.equal(state.usedFingerprints.size, 0);
  });

  test('getCampaignBatchState refleja el offset acumulado real (3 batches de 5 -> offset 15)', () => {
    const state = getCampaignBatchState(CAMPAIGN_ID);
    assert.equal(state.nextBatchNumber, 4);
    assert.equal(state.blueprintOffset, 15);
    assert.ok(state.usedFingerprints.size >= 15);
  });
});
