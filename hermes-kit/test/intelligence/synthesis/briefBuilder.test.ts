// briefBuilder.test.ts — MI-5: generación de brief, Creative Intelligence
// contract, competitor landscape (sin rankings) e inteligencia temporal
// (reciente vs. persistente).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  recordMetrics,
  generateBrief,
  buildCreativeIntelligenceBrief,
} from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function realisticFixture() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "Vida Divina" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b", display_name: "Competidor B" });

  const sharedHook = "llevo 30 días tomando esto";
  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "ad-1", content_type: "ad", hook: sharedHook, market: "MX",
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 3 * 86400,
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "ad-2", content_type: "ad", hook: sharedHook, market: "MX",
    first_seen_at: 1_700_100_000, last_seen_at: 1_700_100_000 + 3 * 86400,
  });
  recordMetrics({ item_id: item1.id, views: 1000, captured_at: 1_700_000_000 });

  return { project, source, advertiserA, advertiserB, item1, item2, sharedHook };
}

// 6. brief generation
test("brief generation: generateBrief produce un IntelligenceBrief serializable con todas sus secciones", async () => {
  const { project, item1, item2, sharedHook } = realisticFixture();

  const outcome = await generateBrief({
    project_id: project.id,
    itemIds: [item1.id, item2.id],
    query: { project_id: project.id, content_type: "ad" },
    market: "MX",
    objective: "Investigar competidores de control de peso en MX",
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const brief = outcome.brief;
  assert.equal(brief.market_context.market, "MX");
  assert.ok(brief.key_findings.length > 0);
  assert.ok(brief.opportunities.length > 0);
  assert.ok(brief.patterns.length > 0);
  assert.ok(brief.insights.length > 0);
  assert.ok(brief.creative_signals.hooks.includes(sharedHook));
  assert.ok(brief.provenance.item_ids.length > 0);
  assert.ok(brief.provenance.pattern_ids.length > 0);

  // Serializable de verdad -- sin funciones/referencias circulares.
  const serialized = JSON.stringify(brief);
  assert.ok(serialized.length > 0);
  assert.deepEqual(JSON.parse(serialized).market_context, brief.market_context);
});

// 7. Creative Intelligence contract
test("Creative Intelligence contract: se deriva del brief, desacoplado de cualquier UI de Creative Studio", async () => {
  const { project, item1, item2 } = realisticFixture();
  const outcome = await generateBrief({
    project_id: project.id,
    itemIds: [item1.id, item2.id],
    query: { project_id: project.id },
    campaign_context: { campaign: "lanzamiento-q2" },
    target_problem: "perdida_de_peso_dificil",
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const creative = buildCreativeIntelligenceBrief(outcome.brief, {
    campaign_context: { campaign: "lanzamiento-q2" },
    target_problem: "perdida_de_peso_dificil",
  });
  assert.deepEqual(creative.campaign_context, { campaign: "lanzamiento-q2" });
  assert.equal(creative.target_problem, "perdida_de_peso_dificil");
  assert.equal(creative.relevant_patterns.length, outcome.brief.patterns.length);
  assert.deepEqual(creative.evidence.item_ids, outcome.brief.provenance.item_ids);
  // No genera ni publica anuncios -- solo estructura de entrada.
  assert.ok(!("ad_copy" in creative));
  assert.ok(!("published" in creative));
});

// 8. competitor landscape (sin rankings)
test("competitor landscape: representa evidencia por actor, nunca declara ganador/perdedor", async () => {
  const { project, item1, item2, advertiserA, advertiserB } = realisticFixture();
  const outcome = await generateBrief({ project_id: project.id, itemIds: [item1.id, item2.id], query: { project_id: project.id } });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const landscape = outcome.brief.competitor_landscape;
  assert.ok(landscape.some((e) => e.actor_id === advertiserA.id));
  assert.ok(landscape.some((e) => e.actor_id === advertiserB.id));
  for (const entry of landscape) {
    assert.ok(!("rank" in entry));
    assert.ok(!("score" in entry));
    assert.ok(!("winner" in entry));
    assert.ok(typeof entry.items_observed === "number");
  }
  const withPerf = landscape.find((e) => e.actor_id === advertiserA.id);
  assert.equal(withPerf?.has_performance_data, true);
  const withoutPerf = landscape.find((e) => e.actor_id === advertiserB.id);
  assert.equal(withoutPerf?.has_performance_data, false);
});

// 9. temporal intelligence: recent vs persistent
test("temporal intelligence: un patrón reciente (<7 días) se distingue de uno persistente (>=7 días)", async () => {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-recent-a" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-recent-b" });

  const { item: recent1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "recent-1", content_type: "ad", hook: "hook reciente",
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 2 * 86400,
  });
  const { item: recent2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "recent-2", content_type: "ad", hook: "hook reciente",
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 2 * 86400,
  });

  const outcomeRecent = await generateBrief({ project_id: project.id, itemIds: [recent1.id, recent2.id], query: { project_id: project.id } });
  assert.equal(outcomeRecent.status, "ok");
  if (outcomeRecent.status !== "ok") return;
  const recentInsight = outcomeRecent.brief.insights[0];
  assert.equal(JSON.parse(recentInsight.content_json!).finding.temporal_maturity, "recent");
  assert.notEqual(recentInsight.insight_type, "trend");

  const { project: projectPersistent, source: sourcePersistent } = setup();
  const advertiserC = upsertActor({ project_id: projectPersistent.id, source_id: sourcePersistent.id, external_id: "adv-persist-a" });
  const advertiserD = upsertActor({ project_id: projectPersistent.id, source_id: sourcePersistent.id, external_id: "adv-persist-b" });
  const { item: persist1 } = upsertIntelligenceItem({
    project_id: projectPersistent.id, source_id: sourcePersistent.id, actor_id: advertiserC.id,
    external_id: "persist-1", content_type: "ad", hook: "hook persistente",
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 20 * 86400,
  });
  const { item: persist2 } = upsertIntelligenceItem({
    project_id: projectPersistent.id, source_id: sourcePersistent.id, actor_id: advertiserD.id,
    external_id: "persist-2", content_type: "ad", hook: "hook persistente",
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 20 * 86400,
  });
  const outcomePersistent = await generateBrief({
    project_id: projectPersistent.id,
    itemIds: [persist1.id, persist2.id],
    query: { project_id: projectPersistent.id },
  });
  assert.equal(outcomePersistent.status, "ok");
  if (outcomePersistent.status !== "ok") return;
  const persistentInsight = outcomePersistent.brief.insights[0];
  assert.equal(JSON.parse(persistentInsight.content_json!).finding.temporal_maturity, "persistent");
});
