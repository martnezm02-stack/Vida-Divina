// realisticAdFixture.test.ts — MI-1: fixture realista de un anuncio
// (TikTok, Vida Divina) que recorre el flujo completo del Intelligence
// Store de punta a punta, tal como lo usaría una ingesta real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  getIntelligenceItemById,
  withActiveDays,
  recordMetrics,
  getLatestMetrics,
  attachAsset,
  listAssetsForItem,
  addEvidence,
  listEvidenceForItem,
  saveAiAnalysis,
  listAiAnalysesForItem,
  createSignal,
  searchIntelligenceItems,
  _resetConnectionForTests,
} from "../../src/lib/intelligence";

test("fixture: anuncio de TikTok de Vida Divina, de la ingesta al análisis, sobreviviendo un reinicio", () => {
  const project = getOrCreateProject(`marketing-intelligence-${randomUUID()}`, "Marketing Intelligence");
  const tiktok = getOrCreateSource("tiktok", "TikTok");

  const advertiser = upsertActor({
    project_id: project.id,
    source_id: tiktok.id,
    external_id: `vida-divina-ads-${randomUUID()}`,
    display_name: "Vida Divina",
    type: "advertiser",
    url: "https://tiktok.com/@vidadivina.oficial",
  });

  const firstSeen = 1_705_000_000; // fecha de primera detección
  const lastSeen = firstSeen + 12 * 86400; // visto de nuevo 12 días después

  const { item, created } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: tiktok.id,
    actor_id: advertiser.id,
    external_id: `tiktok-ad-${randomUUID()}`,
    canonical_url: "https://tiktok.com/@vidadivina.oficial/video/999",
    content_type: "ad",
    title: "Sculpt Max — transformación en 30 días",
    description: "Anuncio de conversión para control de peso",
    published_at: firstSeen - 86400,
    first_seen_at: firstSeen,
    last_seen_at: lastSeen,
    format: "video_vertical",
    style: "ugc",
    theme: "transformacion",
    market: "MX",
    audience: "mujeres_35_55",
    objective: "conversion",
    product: "sculpt-max",
    funnel_stage: "cold",
    hook: "Llevo 30 días tomando esto y no lo puedo creer",
    angle: "testimonio_personal",
    problem: "perdida_de_peso_dificil",
    mechanism: "control_de_apetito_natural",
    cta: "Pide el tuyo ahora",
    offer: "envio_gratis",
    social_proof: "testimonio_con_video",
    tags: ["sculpt-max", "control-de-peso", "ugc"],
  });
  assert.equal(created, true);

  const withDerived = withActiveDays(item);
  assert.equal(withDerived.active_days, 12, "días activos = last_seen_at - first_seen_at en días");

  attachAsset({
    item_id: item.id,
    kind: "thumbnail",
    url: "https://tiktok.com/thumb/999.jpg",
  });
  const assets = listAssetsForItem(item.id);
  assert.equal(assets.length, 1);

  addEvidence({
    item_id: item.id,
    kind: "transcript_fragment",
    content: "Llevo 30 días tomando Sculpt Max y ya no me quedan las tallas viejas",
  });
  const evidence = listEvidenceForItem(item.id);
  assert.equal(evidence.length, 1);

  recordMetrics({
    item_id: item.id,
    views: 84200,
    likes: 6100,
    comments: 340,
    shares: 512,
    engagement: 0.083,
    captured_at: lastSeen,
  });
  const metrics = getLatestMetrics(item.id);
  assert.equal(metrics?.views, 84200);
  assert.equal(metrics?.reach, null, "reach desconocido en TikTok orgánico -- NULL, no 0");

  saveAiAnalysis({
    item_id: item.id,
    analysis_type: "creative_breakdown",
    model: "claude-sonnet-5",
    result: {
      hook_type: "resultado_personal",
      predicted_fatigue_days: 21,
      recommendation: "reutilizar_angulo_en_otros_productos",
    },
  });
  assert.equal(listAiAnalysesForItem(item.id).length, 1);

  createSignal({
    project_id: project.id,
    item_id: item.id,
    actor_id: advertiser.id,
    signal_type: "creative_longevity",
    title: "Anuncio con 12 días activos y engagement sostenido",
    strength: 0.75,
  });

  // Simula reinicio de Hermes antes de la consulta final.
  _resetConnectionForTests();

  const found = searchIntelligenceItems({
    project_id: project.id,
    market: "MX",
    funnel_stage: "cold",
    min_active_days: 10,
  });
  assert.ok(found.some((i) => i.id === item.id), "el anuncio debe seguir siendo buscable tras el reinicio");

  const reloaded = getIntelligenceItemById(item.id);
  assert.equal(reloaded?.hook, "Llevo 30 días tomando esto y no lo puedo creer");
});
