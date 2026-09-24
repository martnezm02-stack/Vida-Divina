// tiktokAdapter.test.ts — MI-2: contrato de adapter y normalización de un
// item TikTok real (fixture) a CanonicalIntelligenceItem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tiktokAdapter } from "../../../src/lib/intelligence/ingestion";
import type { TikTokRawAd } from "../../../src/lib/intelligence/ingestion";

const rawFixture: TikTokRawAd = {
  id: "7345678901234567890",
  url: "https://www.tiktok.com/@vidadivina.oficial/video/7345678901234567890?utm_source=tiktok_ads",
  advertiser: {
    id: "advertiser-vd-1",
    name: "Vida Divina",
    handle: "@vidadivina.oficial",
    profile_url: "https://www.tiktok.com/@vidadivina.oficial",
  },
  caption: "Transforma tu cuerpo en 30 días con Sculpt Max",
  publish_time: "2026-01-10T12:00:00.000Z",
  first_seen: "2026-01-11T08:00:00.000Z",
  last_seen: "2026-01-23T08:00:00.000Z",
  video: {
    url: "https://v16.tiktokcdn.com/ad/sculpt-max.mp4",
    thumbnail_url: "https://p16.tiktokcdn.com/ad/sculpt-max-thumb.jpg",
    width: 1080,
    height: 1920,
    duration_seconds: 32,
  },
  stats: {
    play_count: 84200,
    digg_count: 6100,
    comment_count: 340,
    share_count: 512,
  },
  hook_text: "Llevo 30 días tomando esto y no lo puedo creer",
  cta_text: "Pide el tuyo ahora",
  market: "MX",
  language: "es",
};

test("adapter contract: expone `source` y `normalize()` sin tocar el Intelligence Store", () => {
  assert.equal(tiktokAdapter.source, "tiktok");
  assert.equal(typeof tiktokAdapter.normalize, "function");
});

test("normalize(): produce un CanonicalIntelligenceItem completo a partir del raw de TikTok", () => {
  const canonical = tiktokAdapter.normalize(rawFixture, { project: "marketing-intelligence" });

  assert.equal(canonical.project, "marketing-intelligence");
  assert.equal(canonical.source, "tiktok");
  assert.equal(canonical.external_id, rawFixture.id);
  assert.equal(canonical.content_type, "ad");
  assert.equal(canonical.media_type, "video");
  assert.equal(canonical.hook, "Llevo 30 días tomando esto y no lo puedo creer");
  assert.equal(canonical.market, "MX");
  assert.equal(canonical.language, "es");

  assert.equal(canonical.actor?.display_name, "Vida Divina");
  assert.equal(canonical.actor?.external_id, "advertiser-vd-1");

  assert.equal(canonical.assets?.length, 2);
  assert.ok(canonical.assets?.some((a) => a.kind === "video"));
  assert.ok(canonical.assets?.some((a) => a.kind === "thumbnail"));

  assert.equal(canonical.metrics?.views, 84200);
  assert.equal(canonical.metrics?.likes, 6100);

  assert.equal(canonical.evidence?.length, 1);
  assert.equal(canonical.evidence?.[0].kind, "source_url");

  // Timestamps ya normalizados a segundos unix por el propio adapter.
  assert.equal(typeof canonical.published_at, "number");
  assert.equal(typeof canonical.first_seen_at, "number");
  assert.equal(typeof canonical.last_seen_at, "number");
});

test("normalize(): campos ausentes en el raw quedan ausentes en el canónico, nunca inventados", () => {
  const minimalRaw: TikTokRawAd = {
    id: "minimal-1",
    url: "https://www.tiktok.com/@x/video/minimal-1",
    advertiser: { id: "adv-minimal", name: "Anunciante Mínimo" },
    video: { url: "https://v16.tiktokcdn.com/ad/minimal.mp4" },
  };

  const canonical = tiktokAdapter.normalize(minimalRaw, { project: "marketing-intelligence" });

  assert.equal(canonical.description, null);
  assert.equal(canonical.published_at, null);
  assert.equal(canonical.hook, null);
  assert.equal(canonical.metrics, null, "sin stats en el raw, metrics debe ser null -- no {views:0,...}");
  assert.equal(canonical.assets?.length, 1, "sin thumbnail_url, solo el asset de video");
});
