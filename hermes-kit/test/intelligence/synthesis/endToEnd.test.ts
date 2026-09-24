// endToEnd.test.ts — MI-5: recorrido completo de un anuncio de TikTok --
// ingesta (MI-2) -> análisis (MI-3) -> patrones (MI-4) -> contexto
// relevante -> insight -> brief (MI-5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ingestCanonicalItem,
  tiktokAdapter,
  analyzeItems,
  creativeAnalysisProvider,
  generateBrief,
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

test("TikTok end-to-end: ingestion -> analysis -> patterns -> relevant context -> insight -> brief", async () => {
  const project = `mktg-intel-${randomUUID()}`;
  const sharedHook = "Llevo 30 días tomando esto";

  const raw1 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-a-${randomUUID()}`, name: "Vida Divina" } });
  const raw2 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-b-${randomUUID()}`, name: "Competidor" } });

  // MI-2: ingesta
  const ingested1 = ingestCanonicalItem(tiktokAdapter.normalize(raw1, { project }));
  const ingested2 = ingestCanonicalItem(tiktokAdapter.normalize(raw2, { project }));
  const projectId = ingested1.item.project_id;

  // MI-3: análisis (opcional en el flujo, pero debe convivir con MI-4/5 sin fricción)
  const analysis = await analyzeItems(
    { project_id: projectId, itemIds: [ingested1.item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  assert.equal(analysis.run.provider, "deterministic-creative");

  // MI-4 (vía MI-5, internamente) + MI-5: insight + brief
  const outcome = await generateBrief({
    project_id: projectId,
    itemIds: [ingested1.item.id, ingested2.item.id],
    query: { project_id: projectId, content_type: "ad" },
    market: "MX",
    objective: "Investigar hooks de control de peso en TikTok MX",
  });

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  const brief = outcome.brief;
  assert.ok(brief.patterns.some((p) => p.pattern_type === "creative_hook_repetition" && p.scope === "market"));
  assert.ok(brief.creative_signals.hooks.includes(sharedHook));
  assert.ok(brief.competitor_landscape.length === 2);
  assert.ok(brief.key_findings.length > 0);
  assert.ok(brief.opportunities.every((text) => typeof text === "string" && text.length > 0));
  assert.ok(brief.provenance.item_ids.includes(ingested1.item.id));
  assert.ok(brief.provenance.item_ids.includes(ingested2.item.id));

  // Re-generar con exactamente los mismos datos reutiliza el insight (caching, sección 20).
  const second = await generateBrief({
    project_id: projectId,
    itemIds: [ingested1.item.id, ingested2.item.id],
    query: { project_id: projectId, content_type: "ad" },
    market: "MX",
  });
  assert.equal(second.status, "ok");
  if (second.status !== "ok") return;
  assert.equal(second.brief.insights[0].id, brief.insights[0].id);
});
