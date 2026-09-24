// actorsAssetsEvidenceMetrics.test.ts — MI-1: relación con actor, assets,
// evidencia, métricas (con NULL para "desconocido", nunca 0) y análisis IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  attachAsset,
  listAssetsForItem,
  addEvidence,
  listEvidenceForItem,
  recordMetrics,
  getLatestMetrics,
  listMetricsHistory,
  saveAiAnalysis,
  listAiAnalysesForItem,
} from "../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("actor relation: un item queda ligado a su actor (anunciante/creador)", () => {
  const { project, source } = setup();
  const actor = upsertActor({
    project_id: project.id,
    source_id: source.id,
    external_id: "advertiser-1",
    display_name: "Vida Divina",
    type: "advertiser",
  });

  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    actor_id: actor.id,
    external_id: "item-with-actor",
    content_type: "ad",
  });

  assert.equal(item.actor_id, actor.id);
});

test("upsertActor es idempotente por (project_id, source_id, external_id)", () => {
  const { project, source } = setup();
  const first = upsertActor({
    project_id: project.id,
    source_id: source.id,
    external_id: "same-advertiser",
    display_name: "Nombre inicial",
  });
  const second = upsertActor({
    project_id: project.id,
    source_id: source.id,
    external_id: "same-advertiser",
    display_name: "Nombre actualizado",
  });

  assert.equal(second.id, first.id);
  assert.equal(second.display_name, "Nombre actualizado");
});

test("asset relation: thumbnail/video quedan ligados al item", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "item-with-assets",
    content_type: "ad",
  });

  attachAsset({ item_id: item.id, kind: "thumbnail", url: "https://example.com/thumb.jpg" });
  attachAsset({ item_id: item.id, kind: "video", local_path: "/data/media/ad1.mp4" });

  const assets = listAssetsForItem(item.id);
  assert.equal(assets.length, 2);
  assert.ok(assets.some((a) => a.kind === "thumbnail"));
  assert.ok(assets.some((a) => a.kind === "video" && a.local_path === "/data/media/ad1.mp4"));
});

test("evidence: fragmentos de transcript y URLs quedan ligados al item", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "item-with-evidence",
    content_type: "video",
  });

  addEvidence({ item_id: item.id, kind: "transcript_fragment", content: "En 30 días bajé 5 kilos" });
  addEvidence({ item_id: item.id, kind: "source_url", url: "https://tiktok.com/@marca/video/123" });

  const evidence = listEvidenceForItem(item.id);
  assert.equal(evidence.length, 2);
  assert.ok(evidence.some((e) => e.kind === "transcript_fragment"));
});

test("metrics: snapshots en el tiempo, 'desconocido' se guarda como NULL, nunca como 0", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "item-with-metrics",
    content_type: "ad",
  });

  recordMetrics({ item_id: item.id, views: 1000, likes: 50, captured_at: 1_700_000_000 });
  recordMetrics({ item_id: item.id, views: 5000, likes: 300, shares: 12, captured_at: 1_700_100_000 });

  const latest = getLatestMetrics(item.id);
  assert.equal(latest?.views, 5000);
  assert.equal(latest?.comments, null, "un campo nunca reportado debe ser NULL, no 0");

  const history = listMetricsHistory(item.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].views, 1000, "el historial debe conservar el orden temporal");
});

test("ai analysis: se guarda estructurado y extensible por analysis_type", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "item-with-ai",
    content_type: "ad",
  });

  saveAiAnalysis({
    item_id: item.id,
    analysis_type: "creative_breakdown",
    model: "claude-sonnet-5",
    result: { hook_strength: "alto", predicted_ctr: 0.032 },
  });

  const analyses = listAiAnalysesForItem(item.id, "creative_breakdown");
  assert.equal(analyses.length, 1);
  assert.deepEqual(JSON.parse(analyses[0].result_json), { hook_strength: "alto", predicted_ctr: 0.032 });
});
