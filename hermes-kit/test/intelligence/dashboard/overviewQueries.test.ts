// overviewQueries.test.ts — Data layer del Overview de "AI Marketing
// Intelligence & Growth OS": KPIs reales, aislamiento por proyecto, ausencia
// de datos fabricados (sin actividad -> arrays vacíos, nunca una fuente
// ficticia), y la semántica estricta de "signals por relevancia" (solo
// RELEVANCE_*, nunca signals de frecuencia de MI-4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem, upsertActor, createSignal } from "../../../src/lib/intelligence";
import {
  getOverviewKpis,
  getMarketActivity,
  getSignalsByRelevance,
  getSourceActivity,
  getPerformancePredictions,
} from "../../../src/lib/intelligence/dashboard/overviewQueries";

function setup() {
  const project = getOrCreateProject(`overview-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("getOverviewKpis: cuenta reales (items/actors/signals/insights), nunca fabricados; briefs siempre 0 con generatedOnDemand", () => {
  const { project, source } = setup();
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  upsertActor({ project_id: project.id, source_id: source.id, handle: "actor-1" });

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.intelligenceItems, 2);
  assert.equal(kpis.actors, 1);
  assert.equal(kpis.signals, 0);
  assert.equal(kpis.insights, 0);
  assert.equal(kpis.intelligenceBriefsGeneratedOnDemand, true);
});

test("getOverviewKpis: proyecto sin ningún dato -> todo en cero, nunca un placeholder inventado", () => {
  const project = getOrCreateProject(`overview-empty-${randomUUID()}`);
  const kpis = getOverviewKpis(project.id);
  assert.deepEqual(kpis, { intelligenceItems: 0, actors: 0, signals: 0, insights: 0, intelligenceBriefsGeneratedOnDemand: true });
});

test("project isolation: los items de un proyecto nunca aparecen en los KPIs de otro proyecto", () => {
  const { project: projectA, source } = setup();
  const projectB = getOrCreateProject(`overview-b-${randomUUID()}`);
  upsertIntelligenceItem({ project_id: projectA.id, source_id: source.id, content_type: "video" });

  assert.equal(getOverviewKpis(projectA.id).intelligenceItems, 1);
  assert.equal(getOverviewKpis(projectB.id).intelligenceItems, 0);
});

test("getMarketActivity: solo fuentes reales con actividad real -- nunca una fuente ficticia para rellenar la gráfica", () => {
  const { project, source } = setup();
  const now = Math.floor(Date.now() / 1000);
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video", first_seen_at: now, last_seen_at: now });

  const activity = getMarketActivity(project.id, 30);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].sourceSlug, source.slug);
  assert.equal(activity[0].count, 1);
});

test("getMarketActivity: sin actividad en la ventana -> array vacío, nunca datos fabricados", () => {
  const project = getOrCreateProject(`overview-noactivity-${randomUUID()}`);
  assert.deepEqual(getMarketActivity(project.id, 30), []);
});

test("getSignalsByRelevance: solo cuenta signals RELEVANCE_* -- signals de frecuencia (MI-4) quedan excluidas, nunca forzadas a un bucket", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  createSignal({
    project_id: project.id,
    item_id: item.id,
    signal_type: "RELEVANCE_DECISION",
    title: "signal de relevancia",
    metadata: { relevance: "HIGH" },
  });
  createSignal({
    project_id: project.id,
    item_id: item.id,
    signal_type: "FORMAT_FREQUENCY",
    title: "signal de frecuencia MI-4, sin relevance",
  });

  const result = getSignalsByRelevance(project.id);
  assert.equal(result.total, 1, "solo la signal RELEVANCE_* cuenta");
  assert.equal(result.buckets.HIGH, 1);
  assert.equal(result.buckets.MEDIUM, 0);
});

test("getSourceActivity: agregación real por fuente, orden por actividad descendente", () => {
  const { project, source: sourceA } = setup();
  const sourceB = getOrCreateSource(`source-b-${randomUUID()}`);
  upsertIntelligenceItem({ project_id: project.id, source_id: sourceA.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: sourceB.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: sourceB.id, content_type: "video" });

  const activity = getSourceActivity(project.id);
  assert.equal(activity[0].sourceSlug, sourceB.slug);
  assert.equal(activity[0].itemCount, 2);
  assert.equal(activity[1].itemCount, 1);
});

test("getPerformancePredictions: sin ai_analyses de tipo performance_prediction -> array vacío, nunca una predicción fabricada", () => {
  const project = getOrCreateProject(`overview-noPred-${randomUUID()}`);
  assert.deepEqual(getPerformancePredictions(project.id), []);
});
