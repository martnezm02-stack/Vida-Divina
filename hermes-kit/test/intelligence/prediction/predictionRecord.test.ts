// predictionRecord.test.ts — Vínculo PerformancePredictor <-> MI-1
// (ai_analyses): una prediction guardada es evidencia histórica inmutable
// (nunca se sobrescribe), comparable después contra el rendimiento real sin
// modificar la prediction original. observed != predicted en todo momento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  upsertIntelligenceItem,
  recordMetrics,
  savePredictionRecord,
  listPredictionRecordsForItem,
  comparePredictionToActual,
} from "../../../src/lib/intelligence";
import type { PerformancePredictionOutcome } from "../../../src/lib/intelligence";

test("savePredictionRecord/listPredictionRecordsForItem: se guarda como ai_analyses, recuperable, nunca se sobrescribe", () => {
  const project = `pred-record-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({ project_id: projectRow.id, source_id: 1, content_type: "video" });

  const okOutcome: PerformancePredictionOutcome = {
    status: "ok",
    predictions: [{ metric: "engagement_rate", value: 0.05, basis: ["cta"] }],
    confidence: 0.7,
    evidence: { item_ids: [999], metric_snapshots_used: 2, matched_fields: ["cta"], source_ids: [1] },
    explanation: "test",
  };
  const record1 = savePredictionRecord(item.id, "historical-similarity-v1", okOutcome);
  assert.equal(record1.analysis_type, "performance_prediction");
  assert.equal(record1.model, "historical-similarity-v1");

  const insufficientOutcome: PerformancePredictionOutcome = {
    status: "insufficient_evidence",
    reason: "test",
    evidence: { item_ids: [], metric_snapshots_used: 0, matched_fields: [], source_ids: [] },
  };
  const record2 = savePredictionRecord(item.id, "historical-similarity-v1", insufficientOutcome);

  const records = listPredictionRecordsForItem(item.id);
  assert.equal(records.length, 2, "ambas predictions coexisten -- nunca se sobrescriben entre sí");
  assert.deepEqual(JSON.parse(records[0].result_json), okOutcome);
  assert.deepEqual(JSON.parse(records[1].result_json), insufficientOutcome);
  assert.notEqual(record1.id, record2.id);
});

test("comparePredictionToActual: predicted != observed, delta/relative_error correctos, prediction original intacta", () => {
  const project = `pred-vs-actual-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({ project_id: projectRow.id, source_id: 1, content_type: "video" });

  const outcome: PerformancePredictionOutcome = {
    status: "ok",
    predictions: [{ metric: "engagement_rate", value: 0.05, basis: ["cta"] }],
    confidence: 0.7,
    evidence: { item_ids: [999], metric_snapshots_used: 2, matched_fields: ["cta"], source_ids: [1] },
    explanation: "predicho ANTES de conocer el resultado real",
  };
  const record = savePredictionRecord(item.id, "historical-similarity-v1", outcome);

  // Rendimiento REAL, registrado DESPUÉS de guardar la prediction -- (60+10)/1000 = 0.07 != 0.05 predicho.
  recordMetrics({ item_id: item.id, views: 1000, likes: 60, comments: 10, captured_at: Math.floor(Date.now() / 1000) });

  const comparisons = comparePredictionToActual(record, item.id);
  assert.equal(comparisons.length, 1);
  const [cmp] = comparisons;
  assert.equal(cmp.metric, "engagement_rate");
  assert.equal(cmp.predicted, 0.05);
  assert.ok(Math.abs(cmp.actual - 0.07) < 1e-9);
  assert.ok(Math.abs(cmp.delta - 0.02) < 1e-9);
  assert.ok(Math.abs((cmp.relative_error ?? 0) - 0.4) < 1e-9);
  assert.equal(cmp.prediction_record_id, record.id);

  // La prediction original guardada sigue exactamente igual -- comparar no la modifica.
  const reloaded = listPredictionRecordsForItem(item.id);
  assert.deepEqual(JSON.parse(reloaded[0].result_json), outcome);
});

test("comparePredictionToActual: sin métrica real observada todavía, no se compara nada (nunca se inventa un actual)", () => {
  const project = `pred-no-actual-yet-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({ project_id: projectRow.id, source_id: 1, content_type: "video" });

  const outcome: PerformancePredictionOutcome = {
    status: "ok",
    predictions: [{ metric: "engagement_rate", value: 0.05, basis: ["cta"] }],
    confidence: 0.7,
    evidence: { item_ids: [999], metric_snapshots_used: 2, matched_fields: ["cta"], source_ids: [1] },
    explanation: "test",
  };
  const record = savePredictionRecord(item.id, "historical-similarity-v1", outcome);

  // Sin recordMetrics todavía -- el item no tiene rendimiento real que comparar.
  const comparisons = comparePredictionToActual(record, item.id);
  assert.equal(comparisons.length, 0);
});

test("comparePredictionToActual: una prediction insufficient_evidence no tiene nada que comparar", () => {
  const project = `pred-insufficient-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({ project_id: projectRow.id, source_id: 1, content_type: "video" });
  recordMetrics({ item_id: item.id, views: 100, likes: 10, comments: 1, captured_at: Math.floor(Date.now() / 1000) });

  const record = savePredictionRecord(item.id, "historical-similarity-v1", {
    status: "insufficient_evidence",
    reason: "test",
    evidence: { item_ids: [], metric_snapshots_used: 0, matched_fields: [], source_ids: [] },
  });

  const comparisons = comparePredictionToActual(record, item.id);
  assert.equal(comparisons.length, 0);
});
