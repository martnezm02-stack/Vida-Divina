// historicalSimilarityPerformancePredictor.test.ts — Performance Predictor:
// OBSERVED (métricas reales) vs PREDICTED (promedio de evidencia real) vs
// CONFIDENCE (suficiencia+consistencia, nunca calidad) vs EVIDENCE
// (trazable a item_ids reales) vs EXPLANATION. insufficient_evidence es un
// resultado válido, nunca un error ni una predicción fabricada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  upsertIntelligenceItem,
  recordMetrics,
  historicalSimilarityPerformancePredictor as predictor,
} from "../../../src/lib/intelligence";

function ingestWithMetrics(
  projectId: number,
  fields: Record<string, string | undefined>,
  metrics: { views: number; likes: number; comments: number; shares: number }
) {
  const { item } = upsertIntelligenceItem({
    project_id: projectId,
    source_id: 1,
    content_type: "video",
    ...fields,
  });
  recordMetrics({ item_id: item.id, ...metrics });
  return item;
}

test("evidencia suficiente: predice engagement_rate a partir de items reales que comparten un elemento, con confidence/evidence/explanation trazables", async () => {
  const project = `predictor-ok-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);

  const a = ingestWithMetrics(projectRow.id, { cta: "Compra ahora con envío gratis." }, { views: 1000, likes: 100, comments: 20, shares: 10 });
  const b = ingestWithMetrics(projectRow.id, { cta: "Compra ahora con envío gratis." }, { views: 2000, likes: 180, comments: 40, shares: 20 });

  const result = await predictor.predict({
    project_id: projectRow.id,
    candidate: { cta: "Compra ahora con envío gratis." },
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;

  assert.equal(result.predictions.length, 1);
  assert.equal(result.predictions[0].metric, "engagement_rate");
  assert.deepEqual(result.predictions[0].basis, ["cta"]);

  // (100+20+10)/1000 = 0.13 ; (180+40+20)/2000 = 0.12 -> promedio = 0.125
  assert.ok(Math.abs(result.predictions[0].value - 0.125) < 1e-9, `esperaba ~0.125, obtuvo ${result.predictions[0].value}`);

  assert.ok(result.confidence > 0 && result.confidence <= 1);
  assert.deepEqual(new Set(result.evidence.item_ids), new Set([a.id, b.id]));
  assert.equal(result.evidence.metric_snapshots_used, 2);
  assert.deepEqual(result.evidence.matched_fields, ["cta"]);
  assert.ok(result.explanation.includes("engagement_rate"));
  assert.ok(result.explanation.toLowerCase().includes("confianza"));
});

test("sin ningún elemento compartido: insufficient_evidence, nunca una predicción fabricada", async () => {
  const project = `predictor-nothing-shared-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  ingestWithMetrics(projectRow.id, { cta: "Escríbenos ahora." }, { views: 500, likes: 50, comments: 5, shares: 2 });

  const result = await predictor.predict({
    project_id: projectRow.id,
    candidate: { cta: "Un CTA completamente distinto que nadie más usa." },
  });

  assert.equal(result.status, "insufficient_evidence");
  if (result.status !== "insufficient_evidence") return;
  assert.equal(result.evidence.item_ids.length, 0);
  assert.ok(result.reason.length > 0);
});

test("elemento compartido pero sin métricas usables suficientes: insufficient_evidence, reporta lo que sí encontró", async () => {
  const project = `predictor-no-metrics-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  // Comparte cta pero SIN metrics registradas -- no debe tratarse como 0.
  upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    cta: "Agenda tu cita hoy.",
  });

  const result = await predictor.predict({
    project_id: projectRow.id,
    candidate: { cta: "Agenda tu cita hoy." },
  });

  assert.equal(result.status, "insufficient_evidence");
  if (result.status !== "insufficient_evidence") return;
  assert.deepEqual(result.evidence.matched_fields, ["cta"], "sí encontró el item que comparte cta -- pero sin métricas usables");
  assert.equal(result.evidence.metric_snapshots_used, 0);
});

test("elemento ausente en el candidato: reduce la evidencia disponible, nunca produce una coincidencia artificial", async () => {
  const project = `predictor-partial-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  ingestWithMetrics(projectRow.id, { hook: "hook real", cta: "cta real" }, { views: 100, likes: 10, comments: 1, shares: 1 });

  // El candidato NO trae hook (ausente) -- solo cta. Debe basarse solo en cta.
  const result = await predictor.predict({
    project_id: projectRow.id,
    candidate: { cta: "cta real" },
    minEvidence: 1,
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.evidence.matched_fields, ["cta"]);
});

test("predicción sobre un item ya existente: se excluye de su propia evidencia histórica", async () => {
  const project = `predictor-self-exclude-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const target = ingestWithMetrics(projectRow.id, { cta: "cta único sin repetición" }, { views: 100, likes: 5, comments: 1, shares: 0 });

  const result = await predictor.predict({ project_id: projectRow.id, itemId: target.id });

  // El único item que comparte ese cta es el propio target -- excluido -> insufficient_evidence.
  assert.equal(result.status, "insufficient_evidence");
});

test("confidence refleja consistencia: evidencia dispersa produce menor confianza que evidencia consistente, con el mismo n", async () => {
  const consistentProject = `predictor-consistent-${randomUUID()}`;
  const consistentRow = getOrCreateProject(consistentProject);
  ingestWithMetrics(consistentRow.id, { angle: "mismo angle" }, { views: 1000, likes: 100, comments: 0, shares: 0 }); // rate 0.1
  ingestWithMetrics(consistentRow.id, { angle: "mismo angle" }, { views: 1000, likes: 100, comments: 0, shares: 0 }); // rate 0.1
  const consistentResult = await predictor.predict({ project_id: consistentRow.id, candidate: { angle: "mismo angle" } });

  const dispersedProject = `predictor-dispersed-${randomUUID()}`;
  const dispersedRow = getOrCreateProject(dispersedProject);
  ingestWithMetrics(dispersedRow.id, { angle: "mismo angle" }, { views: 1000, likes: 10, comments: 0, shares: 0 }); // rate 0.01
  ingestWithMetrics(dispersedRow.id, { angle: "mismo angle" }, { views: 1000, likes: 900, comments: 0, shares: 0 }); // rate 0.9
  const dispersedResult = await predictor.predict({ project_id: dispersedRow.id, candidate: { angle: "mismo angle" } });

  assert.equal(consistentResult.status, "ok");
  assert.equal(dispersedResult.status, "ok");
  if (consistentResult.status !== "ok" || dispersedResult.status !== "ok") return;
  assert.ok(
    consistentResult.confidence > dispersedResult.confidence,
    `evidencia consistente (${consistentResult.confidence}) debe tener más confianza que evidencia dispersa (${dispersedResult.confidence})`
  );
});
