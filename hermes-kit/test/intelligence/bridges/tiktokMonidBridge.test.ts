// tiktokMonidBridge.test.ts — Bridge Hermes Desktop/Monid -> hermes-kit:
// contrato TikTokBridgeItem -> TikTokRawAd (mapBridgeItemToRawAd), y wiring
// del proceso (fetchTikTokViaMonidBridge) contra un stand-in de
// scripts/tiktok_bridge_search.py (fixtures/hermesDesktopRoot/), sin
// depender de Python ni de una conexión Monid real en este suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fetchTikTokViaMonidBridge, mapBridgeItemToRawAd } from "../../../src/lib/intelligence/bridges";
import type { TikTokBridgeItem } from "../../../src/lib/intelligence/bridges";
import { tiktokAdapter } from "../../../src/lib/intelligence/ingestion";

const FIXTURE_ROOT = path.join(__dirname, "fixtures");
const realOutput: TikTokBridgeItem[] = JSON.parse(
  readFileSync(path.join(FIXTURE_ROOT, "realBridgeOutput.json"), "utf8")
);

test("mapBridgeItemToRawAd: item real (Monid/Apify, 2026-09-25) se mapea completo al contrato TikTokRawAd existente", () => {
  const [realItem] = realOutput;
  const rawAd = mapBridgeItemToRawAd(realItem);
  assert.ok(rawAd, "el item real con todos los campos requeridos debe mapear a un TikTokRawAd, no a null");

  assert.equal(rawAd!.id, "7688057835850042637");
  assert.equal(rawAd!.url, "https://www.tiktok.com/@marcyrodas/video/7688057835850042637");
  assert.equal(rawAd!.content_type, "post", "resultado orgánico real -- nunca 'ad'");
  assert.equal(rawAd!.advertiser.id, "6838621001976005637");
  assert.equal(rawAd!.advertiser.name, "marcyrodas");
  assert.equal(rawAd!.advertiser.handle, "marcyrodas");
  assert.equal(rawAd!.video.url, realItem.media!.url);
  assert.equal(rawAd!.video.duration_seconds, 15);
  assert.equal(rawAd!.stats?.play_count, 335);
  assert.equal(rawAd!.stats?.digg_count, 9);
  assert.equal(rawAd!.stats?.bookmark_count, 0);
  assert.equal(rawAd!.language, "es");

  // El propio adapter existente (sin tocar) debe poder normalizarlo end-to-end.
  const canonical = tiktokAdapter.normalize(rawAd!, { project: "bridge-test" });
  assert.equal(canonical.source, "tiktok");
  assert.equal(canonical.external_id, "7688057835850042637");
  assert.equal(canonical.content_type, "post");
  assert.equal(canonical.actor?.display_name, "marcyrodas");
  assert.equal(canonical.metrics?.views, 335);
  assert.equal(canonical.metrics?.saves, 0, "bookmarks:0 real -- 0 explícito, no null (el dato SÍ fue observado)");
  assert.equal(canonical.market, null, "sin location en esta búsqueda -- null, nunca inventado");
});

test("mapBridgeItemToRawAd: item real sin url/advertiser/video utilizables -> null (nunca se fabrica evidencia)", () => {
  const [, incompleteItem] = realOutput;
  const rawAd = mapBridgeItemToRawAd(incompleteItem);
  assert.equal(rawAd, null);
});

test("mapBridgeItemToRawAd: métricas ausentes quedan ausentes en TikTokRawAd.stats, nunca 0 inventado", () => {
  const item: TikTokBridgeItem = {
    source: "tiktok",
    external_id: "no-metrics-1",
    canonical_url: "https://www.tiktok.com/@x/video/no-metrics-1",
    actor: { external_id: "adv-1", handle: null, display_name: "X", profile_url: null },
    published_at: null,
    text: null,
    metrics: { views: 50, likes: null, comments: null, shares: null, saves: null, captured_at: null },
    media: { kind: "video", url: "https://cdn.example.com/x.mp4", thumbnail_url: null, width: null, height: null, duration_seconds: null },
    source_metadata: { platform: "tiktok", provider: "monid", endpoint: "/apidojo/tiktok-scraper", hashtags: [], language: null },
    provenance: { acquired_via: "monid", keywords: ["x"], date_range: "THIS_MONTH", sort: "MOST_LIKED", location: null, fetched_at: "2026-09-25T00:00:00.000Z" },
  };
  const rawAd = mapBridgeItemToRawAd(item);
  assert.ok(rawAd);
  assert.equal(rawAd!.stats?.play_count, 50);
  assert.equal("digg_count" in (rawAd!.stats ?? {}), false, "likes ausente -- clave ausente, nunca 0");

  const canonical = tiktokAdapter.normalize(rawAd!, { project: "bridge-test" });
  assert.equal(canonical.metrics?.likes, null);
});

test("fetchTikTokViaMonidBridge: sin HERMES_DESKTOP_ROOT configurado -> UnavailableSource, nunca lanza", async () => {
  const prev = process.env.HERMES_DESKTOP_ROOT;
  delete process.env.HERMES_DESKTOP_ROOT;
  try {
    const result = await fetchTikTokViaMonidBridge({ keywords: ["vida divina"] });
    assert.equal((result as { unavailable?: true }).unavailable, true);
    assert.match((result as { reason: string }).reason, /sin conector Monid alcanzable/);
  } finally {
    if (prev !== undefined) process.env.HERMES_DESKTOP_ROOT = prev;
  }
});

test("fetchTikTokViaMonidBridge: bridge real (stand-in) ejecuta, parsea y produce AvailableSource<TikTokRawAd> listo para runMultiSourceResearchQuery", async () => {
  const result = await fetchTikTokViaMonidBridge({
    keywords: ["vida divina suplementos"],
    hermesDesktopRoot: FIXTURE_ROOT + path.sep + "hermesDesktopRoot",
    pythonExecutable: process.execPath, // Node ejecuta el stand-in .py como JS -- ver el fixture
  });

  assert.equal("unavailable" in result, false);
  const available = result as { name: string; adapter: typeof tiktokAdapter; raw: unknown[] };
  assert.equal(available.name, "tiktok");
  assert.equal(available.adapter, tiktokAdapter, "debe reutilizar el TikTok SourceAdapter existente, no crear uno nuevo");
  assert.equal(available.raw.length, 1);
  assert.equal((available.raw[0] as { id: string }).id, "fake-1");
});

test("fetchTikTokViaMonidBridge: el bridge no encuentra resultados -> AvailableSource con raw:[] (ejecutó, distinto de unavailable)", async () => {
  const result = await fetchTikTokViaMonidBridge({
    keywords: ["trigger-empty"],
    hermesDesktopRoot: FIXTURE_ROOT + path.sep + "hermesDesktopRoot",
    pythonExecutable: process.execPath,
  });
  assert.equal("unavailable" in result, false);
  assert.deepEqual((result as { raw: unknown[] }).raw, []);
});

test("fetchTikTokViaMonidBridge: el proceso falla (código != 0) -> UnavailableSource con la razón real, nunca fabrica datos", async () => {
  const result = await fetchTikTokViaMonidBridge({
    keywords: ["trigger-error"],
    hermesDesktopRoot: FIXTURE_ROOT + path.sep + "hermesDesktopRoot",
    pythonExecutable: process.execPath,
  });
  assert.equal((result as { unavailable?: true }).unavailable, true);
  assert.match((result as { reason: string }).reason, /simulated Monid failure/);
});

test("fetchTikTokViaMonidBridge: salida no-JSON -> UnavailableSource, nunca lanza ni inventa items", async () => {
  const result = await fetchTikTokViaMonidBridge({
    keywords: ["trigger-badjson"],
    hermesDesktopRoot: FIXTURE_ROOT + path.sep + "hermesDesktopRoot",
    pythonExecutable: process.execPath,
  });
  assert.equal((result as { unavailable?: true }).unavailable, true);
});
