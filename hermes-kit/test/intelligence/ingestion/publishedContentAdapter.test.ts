// publishedContentAdapter.test.ts — MI-2: normalización de PublishedContent
// + PerformanceObservation (shape real, confirmado contra
// performance-learning-intelligence/data/intelligence/*.jsonl -- registros
// reales source:"platform_observed", backfill de Instagram Graph API
// Insights para external_post_id=18376003507235391) a
// CanonicalIntelligenceItem. UNKNOWN=NULL siempre; "NOT_AVAILABLE" nunca se
// convierte en 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { publishedContentAdapter, ingestCanonicalItem } from "../../../src/lib/intelligence/ingestion";
import { getOrCreateProject } from "../../../src/lib/intelligence/projects";
import type { PublishedContentWithObservations } from "../../../src/lib/intelligence/ingestion";

test("adapter contract: expone `source` y `normalize()`", () => {
  assert.equal(publishedContentAdapter.source, "published_content");
  assert.equal(typeof publishedContentAdapter.normalize, "function");
});

test("normalize(): mapea el backfill real (Instagram, external_post_id=18376003507235391) a CanonicalIntelligenceItem", () => {
  const raw: PublishedContentWithObservations = {
    publishedContent: {
      content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18",
      platform: "instagram",
      published_at: "2026-08-20T09:32:50+0000",
      content_type: "social_post",
      format: "image",
      topic: "Backfill: publicación real ya existente (instagram, external_post_id=18376003507235391)",
      url: "https://www.instagram.com/p/DcQcvvFlhUE/",
      external_post_id: "18376003507235391",
      metadata: { backfill: true, backfilled_at: "2026-08-20T18:12:46.472Z" },
    },
    observations: [
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "views", value: 1, observed_at: "2026-08-20T18:12:46.474Z", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "likes", value: 0, observed_at: "2026-08-20T18:12:46.474Z", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "comments", value: 0, observed_at: "2026-08-20T18:12:46.474Z", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "shares", value: 0, observed_at: "2026-08-20T18:12:46.474Z", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "saves", value: 0, observed_at: "2026-08-20T18:12:46.474Z", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "clicks", value: "NOT_AVAILABLE", source: "platform_observed" },
      { content_id: "a86286e1-b130-4f98-8684-f8f6686bdb18", metric: "watch_time_seconds", value: "NOT_AVAILABLE", source: "platform_observed" },
    ],
  };

  const canonical = publishedContentAdapter.normalize(raw, { project: "p" });

  assert.equal(canonical.project, "p");
  assert.equal(canonical.source, "published_content");
  assert.equal(canonical.external_id, "18376003507235391");
  assert.equal(canonical.canonical_url, "https://www.instagram.com/p/DcQcvvFlhUE/");
  assert.equal(canonical.content_type, "social_post");
  assert.equal(canonical.format, "image");
  assert.equal(canonical.hook, null, "backfill real sin hook_pattern_ref -- nunca se inventa");

  assert.equal(canonical.metrics?.views, 1);
  assert.equal(canonical.metrics?.likes, 0);
  assert.equal(canonical.metrics?.comments, 0);
  assert.equal(canonical.metrics?.shares, 0);
  assert.equal(canonical.metrics?.saves, 0);
  // "clicks"/"watch_time_seconds" con value:"NOT_AVAILABLE" -- ausentes, nunca 0.
  assert.equal(canonical.metrics && "clicks" in canonical.metrics, false);

  assert.equal((canonical.source_metadata as { creative_studio_platform?: string })?.creative_studio_platform, "instagram");
});

test("normalize(): sin observations, metrics queda null (no {views:0,...})", () => {
  const raw: PublishedContentWithObservations = {
    publishedContent: {
      content_id: "c-1",
      platform: "facebook",
      published_at: "2026-08-20T10:58:01+0000",
      content_type: "social_post",
    },
    observations: [],
  };
  const canonical = publishedContentAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.metrics, null);
  assert.equal(canonical.hook, null);
});

test("integración real con ingestCanonicalItem: el item queda en el Store con sus métricas observadas (MI-1/MI-2 sin cambios)", () => {
  const project = `published-content-${Date.now()}`;
  getOrCreateProject(project);
  const raw: PublishedContentWithObservations = {
    publishedContent: {
      content_id: "c-real-2",
      platform: "instagram",
      published_at: "2026-08-20T09:32:50+0000",
      content_type: "social_post",
      format: "image",
      external_post_id: "post-real-2",
    },
    observations: [
      { content_id: "c-real-2", metric: "views", value: 500, source: "platform_observed" },
      { content_id: "c-real-2", metric: "likes", value: 40, source: "platform_observed" },
    ],
  };
  const canonical = publishedContentAdapter.normalize(raw, { project });
  const { item, metrics } = ingestCanonicalItem(canonical);

  assert.equal(item.external_id, "post-real-2");
  assert.equal(metrics?.views, 500);
  assert.equal(metrics?.likes, 40);
  assert.equal(metrics?.shares, null, "sin observación de shares -- null, nunca 0");
});
