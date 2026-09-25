// deterministicEnrichment.test.ts — MI-3: enriquecimiento determinista
// (creative/actor/asset/performance), persistencia, provenance, versiones,
// métricas derivadas y "lo desconocido permanece desconocido".
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  attachAsset,
  addEvidence,
  recordMetrics,
  analyzeItems,
  getAnalysisRun,
  listAnalysisRunsForItem,
  creativeAnalysisProvider,
  actorAnalysisProvider,
  assetAnalysisProvider,
  performanceAnalysisProvider,
} from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("creative analysis: enriquecimiento determinista, observado, se persiste con evidencia", async () => {
  const { project, source } = setup();
  const actor = upsertActor({
    project_id: project.id,
    source_id: source.id,
    external_id: "adv-1",
    display_name: "Vida Divina",
  });
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    actor_id: actor.id,
    external_id: "creative-1",
    content_type: "ad",
    hook: "Llevo 30 días tomando esto",
    cta: "Pide el tuyo ahora",
  });
  const ev = addEvidence({ item_id: item.id, kind: "transcript_fragment", content: "Llevo 30 días..." });

  const { run, cached } = await analyzeItems(
    {
      project_id: project.id,
      itemIds: [item.id],
      analysisType: "creative_summary",
    },
    creativeAnalysisProvider
  );

  assert.equal(cached, false);
  assert.equal(run.provider, "deterministic-creative");
  assert.equal(run.item_ids.length, 1);
  assert.equal(run.item_ids[0], item.id);

  const result = JSON.parse(run.result_json);
  assert.equal(result.observed.items[item.id].hook, "Llevo 30 días tomando esto");
  assert.deepEqual(result.inferred, {}, "un provider determinista nunca debe poblar inferred");

  const stored = getAnalysisRun(run.id);
  assert.equal(stored?.analysis_type, "creative_summary");

  const forItem = listAnalysisRunsForItem(item.id);
  assert.equal(forItem.length, 1);
  void ev;
});

test("actor analysis: normaliza y expone el actor asociado al item; sin actor -> null", async () => {
  const { project, source } = setup();
  const actor = upsertActor({
    project_id: project.id,
    source_id: source.id,
    external_id: "adv-2",
    handle: "@marca",
    display_name: "Marca X",
    type: "advertiser",
  });
  const { item: withActor } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    actor_id: actor.id,
    external_id: "actor-item-1",
    content_type: "ad",
  });
  const { item: withoutActor } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "actor-item-2",
    content_type: "ad",
  });

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [withActor.id, withoutActor.id], analysisType: "actor_summary" },
    actorAnalysisProvider
  );

  const result = JSON.parse(run.result_json);
  assert.equal(result.observed.items[withActor.id].display_name, "Marca X");
  assert.equal(result.observed.items[withoutActor.id], null);
});

test("asset analysis: expone tipo/dimensiones/duración de los assets del item", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "asset-item-1",
    content_type: "ad",
  });
  attachAsset({
    item_id: item.id,
    kind: "video",
    url: "https://cdn.example.com/v.mp4",
    metadata: { width: 1080, height: 1920, duration_seconds: 30 },
  });

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "asset_summary" },
    assetAnalysisProvider
  );
  const result = JSON.parse(run.result_json);
  const assets = result.observed.items[item.id];
  assert.equal(assets.length, 1);
  assert.equal(assets[0].width, 1080);
  assert.equal(assets[0].duration_seconds, 30);
});

test("performance analysis: deltas/velocity/engagement solo cuando los snapshots lo permiten", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "perf-item-1",
    content_type: "ad",
  });
  recordMetrics({ item_id: item.id, views: 1000, likes: 50, comments: 5, shares: 2, captured_at: 1_700_000_000 });
  recordMetrics({
    item_id: item.id,
    views: 5000,
    likes: 300,
    comments: 40,
    shares: 20,
    captured_at: 1_700_000_000 + 5 * 86400,
  });

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "performance_delta" },
    performanceAnalysisProvider
  );

  const result = JSON.parse(run.result_json);
  const perf = result.observed.items[item.id];
  assert.equal(perf.deltas.views.delta, 4000);
  assert.equal(perf.velocity_per_day.views, 800);
  assert.ok(typeof perf.engagement_rate === "number");
});

test("métricas ausentes permanecen ausentes: un solo snapshot -> sin deltas ni ranking inventado", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "perf-item-single-snapshot",
    content_type: "ad",
  });
  recordMetrics({ item_id: item.id, views: 1000, captured_at: 1_700_000_000 });

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "performance_delta" },
    performanceAnalysisProvider
  );
  const result = JSON.parse(run.result_json);
  const perf = result.observed.items[item.id];
  assert.equal(perf.deltas, undefined, "con un solo snapshot no hay delta que calcular");
  assert.equal(perf.engagement_rate, undefined, "faltan likes/comments/shares -- no se inventa la tasa");
});

test("Fase 4: engagement_rate se calcula con los campos REALMENTE disponibles (caso Instagram real -- sin shares)", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "perf-item-no-shares",
    content_type: "video",
  });
  // Instagram vía ScrapeCreators nunca entrega shares (confirmado contra
  // el conector real, instagram.py#_parse_items) -- solo views/likes/comments.
  recordMetrics({ item_id: item.id, views: 1000, likes: 80, comments: 20, captured_at: 1_700_000_000 });

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "performance_delta" },
    performanceAnalysisProvider
  );
  const perf = JSON.parse(run.result_json).observed.items[item.id];

  // (80+20)/1000 = 0.1 -- nunca se sustituye shares ausente por 0 dentro de la suma faltante,
  // simplemente no aporta: la tasa sale de lo que SÍ se observó.
  assert.ok(Math.abs(perf.engagement_rate - 0.1) < 1e-9, `esperaba ~0.1, obtuvo ${perf.engagement_rate}`);
  assert.deepEqual(perf.engagement_rate_basis, ["likes", "comments"], "provenance: de qué campos observados salió la tasa");
});

test("múltiples versiones: reanalizar con force:true crea una fila nueva con versión incrementada", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "version-item-1",
    content_type: "ad",
    hook: "hook original",
  });

  const first = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  const second = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary", force: true },
    creativeAnalysisProvider
  );

  assert.equal(first.run.version, 1);
  assert.equal(second.run.version, 2);
  assert.notEqual(first.run.id, second.run.id, "no debe sobrescribir la fila anterior");

  const history = listAnalysisRunsForItem(item.id);
  assert.equal(history.length, 2);
});
