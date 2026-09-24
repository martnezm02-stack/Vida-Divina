// detectionService.test.ts — MI-4: item de TikTok de punta a punta
// (MI-2 ingest -> MI-3 analysis -> MI-4 detection) y composición con la
// abstracción de provider ya existente en MI-3 (no se crea una nueva).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ingestCanonicalItem,
  tiktokAdapter,
  analyzeItems,
  creativeAnalysisProvider,
  detectPatterns,
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  recordMetrics,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  return {
    id: `tiktok-${randomUUID()}`,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${randomUUID()}`,
    advertiser: { id: `adv-${randomUUID()}`, name: "Vida Divina", handle: "@vidadivina.oficial" },
    caption: "Transforma tu cuerpo en 30 días",
    publish_time: "2026-01-10T12:00:00.000Z",
    first_seen: "2026-01-11T08:00:00.000Z",
    last_seen: "2026-01-20T08:00:00.000Z",
    video: { url: "https://v16.tiktokcdn.com/ad/sculpt-max.mp4" },
    stats: { play_count: 20000, digg_count: 1200, comment_count: 60, share_count: 30 },
    hook_text: "Llevo 30 días tomando esto",
    market: "MX",
    ...overrides,
  };
}

test("TikTok end-to-end: MI-2 ingest -> MI-3 analysis -> MI-4 detection sobre el mismo conjunto de items", async () => {
  const project = `mktg-intel-${randomUUID()}`;
  const sharedHook = "Llevo 30 días tomando esto";

  const raw1 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-a-${randomUUID()}`, name: "Vida Divina" } });
  const raw2 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-b-${randomUUID()}`, name: "Competidor" } });

  const ingested1 = ingestCanonicalItem(tiktokAdapter.normalize(raw1, { project }));
  const ingested2 = ingestCanonicalItem(tiktokAdapter.normalize(raw2, { project }));

  // MI-3: análisis determinista reutilizando el AnalysisProvider ya
  // existente -- MI-4 no crea una segunda abstracción de provider para esto.
  const analysis = await analyzeItems(
    { project_id: ingested1.item.project_id, itemIds: [ingested1.item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  assert.equal(JSON.parse(analysis.run.result_json).observed.items[ingested1.item.id].hook, sharedHook);

  // MI-4: detección de patrones sobre los items ya ingeridos/analizados.
  const detection = detectPatterns({
    project_id: ingested1.item.project_id,
    itemIds: [ingested1.item.id, ingested2.item.id],
  });

  const hookPattern = detection.patterns.find((p) => p.pattern_type === "creative_hook_repetition");
  assert.ok(hookPattern, "el hook compartido por los dos anuncios de TikTok debe producir un patrón");
  assert.equal(hookPattern!.scope, "market", "dos anunciantes distintos -> patrón de mercado, no de un solo actor");
  assert.equal(hookPattern!.item_support, 2);
});

test("options: detectCreative/detectPerformance/detectRelationships se pueden desactivar individualmente", () => {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  const shared = "hook compartido";

  const { item: itemA } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "opt-1", content_type: "ad", hook: shared });
  const { item: itemB } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "opt-2", content_type: "ad", hook: shared });
  recordMetrics({ item_id: itemA.id, views: 1000, captured_at: 1_700_000_000 });
  recordMetrics({ item_id: itemA.id, views: 3000, captured_at: 1_700_100_000 });
  recordMetrics({ item_id: itemB.id, views: 1000, captured_at: 1_700_000_000 });
  recordMetrics({ item_id: itemB.id, views: 3000, captured_at: 1_700_100_000 });

  const onlyPerformance = detectPatterns({
    project_id: project.id,
    itemIds: [itemA.id, itemB.id],
    detectCreative: false,
    detectRelationships: false,
  });
  assert.equal(onlyPerformance.signals.length, 0);
  assert.ok(onlyPerformance.patterns.every((p) => p.pattern_type?.startsWith("performance_")));
  assert.equal(onlyPerformance.relationshipsCreated, 0);

  const onlyCreative = detectPatterns({
    project_id: project.id,
    itemIds: [itemA.id, itemB.id],
    detectPerformance: false,
  });
  assert.ok(onlyCreative.patterns.every((p) => p.pattern_type?.startsWith("creative_")));
});
