// overviewQueries.test.ts — Data layer del Overview de "AI Marketing
// Intelligence & Growth OS": KPIs reales, aislamiento por proyecto, ausencia
// de datos fabricados (sin actividad -> arrays vacíos, nunca una fuente
// ficticia), y la semántica estricta de "signals por relevancia" (solo
// RELEVANCE_*, nunca signals de frecuencia de MI-4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem, upsertActor, createSignal, createInsight, createPattern } from "../../../src/lib/intelligence";
import { getDb } from "../../../src/lib/intelligence/connection";
import {
  getOverviewKpis,
  getMarketActivity,
  getSignalsByRelevance,
  getSourceActivity,
  getPerformancePredictions,
  getCurrentInsights,
} from "../../../src/lib/intelligence/dashboard/overviewQueries";

function setup() {
  const project = getOrCreateProject(`overview-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("getOverviewKpis: cuenta reales (items/actors/signals/insights), nunca fabricados; briefs no disponibles sin ningún insight vigente", () => {
  const { project, source } = setup();
  const actor = upsertActor({ project_id: project.id, source_id: source.id, handle: "actor-1" });
  // El KPI "actors" cuenta actores con al menos un item asociado (mismo
  // criterio que getActiveActors y el resto de los widgets de Overview
  // basados en actor_id, ver overviewQueries.ts#countActorsWithNonIrrelevantItems)
  // -- un actor sin ningún item no es un "actor activo" real.
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, actor_id: actor.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.intelligenceItems, 2);
  assert.equal(kpis.actors, 1);
  assert.equal(kpis.signals, 0);
  assert.equal(kpis.insights, 0);
  assert.equal(kpis.intelligenceBriefsGeneratedOnDemand, true);
  assert.equal(kpis.intelligenceBriefsAvailable, false, "sin ningún insight vigente, no hay evidencia para un brief");
});

test("getOverviewKpis: proyecto sin ningún dato -> todo en cero, nunca un placeholder inventado", () => {
  const project = getOrCreateProject(`overview-empty-${randomUUID()}`);
  const kpis = getOverviewKpis(project.id);
  assert.deepEqual(kpis, {
    intelligenceItems: 0,
    actors: 0,
    signals: 0,
    insights: 0,
    intelligenceBriefsGeneratedOnDemand: true,
    intelligenceBriefsAvailable: false,
  });
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

// --------------------------------------------------------------------------- Insights vigentes (caso real: 15 versiones históricas del mismo pattern)
function setInsightPatternAndVersion(insightId: number, patternId: number, version: number) {
  getDb().prepare("UPDATE insights SET source_pattern_id = ?, version = ? WHERE id = ?").run(patternId, version, insightId);
}

test("getCurrentInsights: solo la versión MÁS RECIENTE por pattern cuenta -- caso real (15 regeneraciones del mismo pattern -> 1 insight vigente)", () => {
  const project = getOrCreateProject(`overview-insights-${randomUUID()}`);
  const pattern = createPattern({ project_id: project.id, name: "video_vertical repetition", pattern_type: "creative_format_repetition" });

  for (let v = 1; v <= 15; v++) {
    const insight = createInsight({ project_id: project.id, name: `Repetición v${v}` });
    setInsightPatternAndVersion(insight.id, pattern.id, v);
  }

  const current = getCurrentInsights(project.id);
  assert.equal(current.length, 1, "15 versiones históricas del MISMO pattern -> 1 insight vigente, no 15");
  assert.equal(current[0].version, 15, "debe ser la versión más alta");

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.insights, 1);
});

test("getCurrentInsights: insights de patterns DISTINTOS cuentan por separado -- cada uno con su propia última versión", () => {
  const project = getOrCreateProject(`overview-insights-multi-${randomUUID()}`);
  const patternA = createPattern({ project_id: project.id, name: "pattern A", pattern_type: "creative_format_repetition" });
  const patternB = createPattern({ project_id: project.id, name: "pattern B", pattern_type: "creative_cta_repetition" });

  const insightA1 = createInsight({ project_id: project.id, name: "A v1" });
  setInsightPatternAndVersion(insightA1.id, patternA.id, 1);
  const insightA2 = createInsight({ project_id: project.id, name: "A v2" });
  setInsightPatternAndVersion(insightA2.id, patternA.id, 2);
  const insightB1 = createInsight({ project_id: project.id, name: "B v1" });
  setInsightPatternAndVersion(insightB1.id, patternB.id, 1);

  const current = getCurrentInsights(project.id);
  assert.equal(current.length, 2, "un insight vigente por pattern distinto");
  assert.ok(current.some((i) => i.id === insightA2.id), "debe incluir la versión más reciente de A");
  assert.ok(!current.some((i) => i.id === insightA1.id), "nunca la versión superseded de A");
  assert.ok(current.some((i) => i.id === insightB1.id));
});

test("getCurrentInsights: insight sin source_pattern_id (creado fuera de generateInsightsFromPatterns) cuenta individualmente, sin agrupar", () => {
  const project = getOrCreateProject(`overview-insights-nopattern-${randomUUID()}`);
  createInsight({ project_id: project.id, name: "insight suelto 1" });
  createInsight({ project_id: project.id, name: "insight suelto 2" });

  assert.equal(getCurrentInsights(project.id).length, 2);
});

test("getOverviewKpis.intelligenceBriefsAvailable: true solo si hay al menos un insight vigente -- derivado del estado real, nunca llama a generateBrief()", () => {
  const projectEmpty = getOrCreateProject(`overview-briefs-empty-${randomUUID()}`);
  assert.equal(getOverviewKpis(projectEmpty.id).intelligenceBriefsAvailable, false);

  const projectWithInsight = getOrCreateProject(`overview-briefs-ok-${randomUUID()}`);
  createInsight({ project_id: projectWithInsight.id, name: "insight real" });
  assert.equal(getOverviewKpis(projectWithInsight.id).intelligenceBriefsAvailable, true);
});
