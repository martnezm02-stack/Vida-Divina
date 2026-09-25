// processWatchlistRunRelevance.test.ts — integración real:
// runWatchlistRun() -> WatchlistRunResult -> processWatchlistRunRelevance()
// -> signals (MI-1). Cubre idempotencia, trazabilidad, multi-source y que
// UNCHANGED nunca genera signal, contra el Intelligence Store real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  runWatchlistRun,
  processWatchlistRunRelevance,
  tiktokAdapter,
  instagramAdapter,
  metaAdsAdapter,
  listSignalsByProject,
  listItemsForSignal,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd, InstagramRawItem, MetaAdsRawItem } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `rel-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina", handle: "@vidadivina.oficial" },
    caption: "Contenido de prueba de relevance",
    video: { url: "https://v16.tiktokcdn.com/rel-test.mp4" },
    stats: { play_count: 100, digg_count: 10 },
    cta_text: "Compra ahora",
    ...overrides,
  };
}

async function setup() {
  const project = `relevance-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Watchlist relevance test", "keyword");
  return { project, projectRow, watchlist };
}

test("4) UNCHANGED -> no genera signal (integración real)", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();

  const run1 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  await processWatchlistRunRelevance(run1, null);
  const signalCountAfterRun1 = listSignalsByProject(projectRow.id).length;

  const run2 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  assert.equal(run2.changes[0].status, "UNCHANGED");
  const processed2 = await processWatchlistRunRelevance(run2, null);
  assert.equal(processed2.length, 0, "UNCHANGED nunca se procesa -- ni siquiera llega a evaluateChangeRelevance");

  const signalCountAfterRun2 = listSignalsByProject(projectRow.id).length;
  assert.equal(signalCountAfterRun2, signalCountAfterRun1, "procesar un UNCHANGED nunca crea ni modifica ninguna signal");
});

test("10) mismo cambio procesado dos veces -> NO duplica signal (idempotencia real)", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const run = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });

  const processed1 = await processWatchlistRunRelevance(run, null);
  const processed2 = await processWatchlistRunRelevance(run, null); // MISMO WatchlistRunResult, reprocesado

  const signalsInProject = listSignalsByProject(projectRow.id);
  assert.equal(signalsInProject.length, 1, "el mismo cambio (mismo fingerprint) nunca debe producir más de una signal");
  assert.ok(processed1[0]?.signal);
  assert.ok(processed2[0]?.signal);
  assert.equal(processed1[0].signal!.id, processed2[0].signal!.id, "debe ser la MISMA fila, no una nueva");
});

test("11) signal mantiene trazabilidad al intelligence item (vía signal_items, el mismo mecanismo que ya usa MI-4)", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const run = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  const itemId = run.newItems[0];

  const processed = await processWatchlistRunRelevance(run, null);
  assert.ok(processed[0]?.signal, "debe existir al menos una signal para este item (NEW siempre produce LOW o MEDIUM, nunca IGNORE)");
  const signal = processed[0].signal!;

  assert.equal(signal.project_id, projectRow.id);
  assert.deepEqual(listItemsForSignal(signal.id), [itemId], "trazabilidad real hacia el intelligence item vía signal_items");

  const metadata = JSON.parse(signal.metadata_json!);
  assert.equal(metadata.change_type, "NEW");
  assert.ok(["jev", "fallback:deterministic"].includes(metadata.provider));
});

test("12) multi-source: Instagram/Meta Ads/TikTok usan el MISMO motor de relevance, sin lógica por plataforma", async () => {
  const { watchlist, projectRow } = await setup();

  const igRaw: InstagramRawItem = {
    id: `ig-${randomUUID()}`,
    shortcode: "ig-rel-1",
    caption: "Post real de Instagram para relevance",
    owner: { username: "vidadivina.oficial" },
    video_play_count: 5000,
    like_count: 200,
  };
  const metaRaw: MetaAdsRawItem = {
    id: `meta-${randomUUID()}`,
    page_id: 102551798150702,
    page_name: "Vida Divina",
    ad_creation_time: 1790289826,
    ad_delivery_start_time: 1790294878,
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${randomUUID()}`,
    currency: "MXN",
  };
  const tiktokRaw = tiktokFixture();

  const igRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "instagram", adapter: instagramAdapter, rawItems: [igRaw] });
  const metaRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "meta_ads", adapter: metaAdsAdapter, rawItems: [metaRaw] });
  const tiktokRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [tiktokRaw] });

  const igProcessed = await processWatchlistRunRelevance(igRun, null);
  const metaProcessed = await processWatchlistRunRelevance(metaRun, null);
  const tiktokProcessed = await processWatchlistRunRelevance(tiktokRun, null);

  for (const processed of [igProcessed, metaProcessed, tiktokProcessed]) {
    assert.equal(processed.length, 1);
    assert.ok(["jev", "fallback:deterministic"].includes(processed[0].decision.provider));
  }

  const allSignals = listSignalsByProject(projectRow.id);
  const sources = new Set(allSignals.map((s) => (JSON.parse(s.metadata_json!) as { source: string }).source));
  assert.ok(sources.has("instagram"));
  assert.ok(sources.has("meta_ads"));
  assert.ok(sources.has("tiktok"));
});
