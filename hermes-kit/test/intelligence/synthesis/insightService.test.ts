// insightService.test.ts — MI-5: creación/persistencia de insights,
// vínculo pattern->insight, evidencia/provenance, separación evidence/
// finding/interpretation/recommendation, versionado, caching/reuse,
// aislamiento por proyecto, evidencia insuficiente, ejecución query-driven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  detectPatterns,
  generateInsights,
  generateInsightsFromPatterns,
  getInsight,
  getInsightSupportingItems,
  getInsightSupportingActors,
  getInsightSupportingPatterns,
  listInsightsByProject,
} from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

/** 3 actores, 5 anuncios -- hook compartido por 2 actores (mercado). */
function realisticFixture() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "Vida Divina" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b", display_name: "Competidor B" });
  const advertiserC = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-c", display_name: "Competidor C" });

  const sharedHook = "llevo 30 días tomando esto";
  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "ad-1", content_type: "ad", hook: sharedHook,
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 3 * 86400,
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "ad-2", content_type: "ad", hook: sharedHook,
    first_seen_at: 1_700_100_000, last_seen_at: 1_700_100_000 + 3 * 86400,
  });
  const { item: item3 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserC.id,
    external_id: "ad-3", content_type: "ad", hook: "otro hook",
    first_seen_at: 1_700_200_000, last_seen_at: 1_700_200_000 + 3 * 86400,
  });

  return { project, source, advertiserA, advertiserB, advertiserC, item1, item2, item3, sharedHook };
}

// 1-2. insight creation + persistence
test("insight creation + persistence: generateInsights produce un insight persistido y recuperable", async () => {
  const { project, item1, item2, item3 } = realisticFixture();

  const outcome = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  assert.ok(outcome.insights.length > 0);
  const first = outcome.insights[0];
  const reloaded = getInsight(first.id);
  assert.ok(reloaded);
  assert.equal(reloaded?.project_id, project.id);
});

// 3. pattern → insight linkage
test("pattern → insight linkage: el insight queda ligado al pattern que lo originó", async () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const outcome = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const insight = outcome.insights[0];
  assert.ok(insight.source_pattern_id !== null);
  const linkedPatterns = getInsightSupportingPatterns(insight.id);
  assert.deepEqual(linkedPatterns, [insight.source_pattern_id]);
});

// 4. evidence/provenance
test("evidence/provenance: getInsightSupportingItems/Actors devuelven referencias reales, no texto suelto", async () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const outcome = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const hookInsight = outcome.insights.find((i) => JSON.parse(i.content_json!).evidence.pattern_type === "creative_hook_repetition");
  assert.ok(hookInsight);
  const items = getInsightSupportingItems(hookInsight!.id);
  assert.deepEqual([...items].sort(), [item1.id, item2.id].sort());
  const actors = getInsightSupportingActors(hookInsight!.id);
  assert.equal(actors.length, 2);
});

// 5. observed vs derived vs inferred vs recommended separation
test("separación evidence/finding/interpretation/recommendation: nunca se mezclan, recommendation siempre marcada", async () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const outcome = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const content = JSON.parse(outcome.insights[0].content_json!);
  assert.ok(content.evidence && typeof content.evidence === "object");
  assert.ok(content.finding && typeof content.finding.statement === "string");
  assert.ok(content.interpretation && content.interpretation.is_recommendation === false);
  assert.ok(content.recommendation && content.recommendation.is_recommendation === true);
  assert.notEqual(content.interpretation.text, content.recommendation.text);
});

// 10. query-driven execution
test("query-driven execution: generateInsights con `query` en vez de itemIds resuelve vía búsqueda existente", async () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const outcome = await generateInsights({ project_id: project.id, query: { project_id: project.id, content_type: "ad" } });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.ok(outcome.items.some((i) => i.id === item1.id));
  assert.ok(outcome.items.some((i) => i.id === item2.id));
  assert.ok(outcome.items.some((i) => i.id === item3.id));
});

// 11. reuse of existing intelligence
test("reuse of existing intelligence: generateInsightsFromPatterns reutiliza patterns ya detectados, sin re-ingesta", async () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const detection = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.ok(detection.patterns.length > 0);

  const outcome = await generateInsightsFromPatterns({
    project_id: project.id,
    patternIds: detection.patterns.map((p) => p.id),
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.insights.length, detection.patterns.length);
});

// 12-13. versioning + caching/reuse
test("versioning + caching: repetir la misma generación reutiliza la versión; force:true crea una nueva", async () => {
  const { project, item1, item2, item3 } = realisticFixture();

  const first = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  const second = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  if (first.status !== "ok" || second.status !== "ok") return;

  assert.equal(first.insights[0].id, second.insights[0].id, "sin cambios, debe reutilizar el mismo insight");
  assert.equal(second.insights[0].version, 1);

  const forced = await generateInsights({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id], force: true });
  assert.equal(forced.status, "ok");
  if (forced.status !== "ok") return;
  assert.notEqual(forced.insights[0].id, first.insights[0].id);
  assert.equal(forced.insights[0].version, 2);

  const history = listInsightsByProject(project.id).filter((i) => i.source_pattern_id === first.insights[0].source_pattern_id);
  assert.equal(history.length, 2, "no debe sobrescribir la versión anterior");
});

// 14. project isolation
test("project isolation: insights de un proyecto no contaminan a otro", async () => {
  const fixtureA = realisticFixture();
  const fixtureB = realisticFixture();

  const outcomeA = await generateInsights({ project_id: fixtureA.project.id, itemIds: [fixtureA.item1.id, fixtureA.item2.id, fixtureA.item3.id] });
  const outcomeB = await generateInsights({ project_id: fixtureB.project.id, itemIds: [fixtureB.item1.id, fixtureB.item2.id, fixtureB.item3.id] });
  assert.equal(outcomeA.status, "ok");
  assert.equal(outcomeB.status, "ok");
  if (outcomeA.status !== "ok" || outcomeB.status !== "ok") return;

  for (const i of outcomeA.insights) assert.equal(i.project_id, fixtureA.project.id);
  for (const i of outcomeB.insights) assert.equal(i.project_id, fixtureB.project.id);
});

// 20. insufficient-evidence behavior
test("insufficient evidence: sin patrones detectables, el resultado es INSUFFICIENT_EVIDENCE, nunca un insight fabricado", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, external_id: "solo-item", content_type: "ad", hook: "hook solitario",
  });

  const outcome = await generateInsights({ project_id: project.id, itemIds: [item.id] });
  assert.equal(outcome.status, "insufficient_evidence");

  const emptyQuery = await generateInsights({ project_id: project.id, itemIds: [999999999] });
  assert.equal(emptyQuery.status, "insufficient_evidence");
});
