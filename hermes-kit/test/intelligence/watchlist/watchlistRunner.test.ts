// watchlistRunner.test.ts — Watchlists + Change Detection: runWatchlistRun()
// clasificando NEW/UPDATED/METRICS_CHANGED/UNCHANGED contra el Intelligence
// Store real (MI-1/MI-2), sin duplicarlo, delegando siempre en el
// SourceAdapter y en ingestCanonicalItem ya existentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  addWatchlistEntry,
  getWatchlistById,
  runWatchlistRun,
  tiktokAdapter,
  instagramAdapter,
  searchIntelligenceItems,
  listMetricsHistory,
  getIntelligenceItemById,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  return {
    id: `tt-${randomUUID()}`,
    url: "https://www.tiktok.com/@vidadivina.oficial/video/watchlist-test",
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina", handle: "@vidadivina.oficial" },
    caption: "Transforma tu cuerpo en 30 días con Sculpt Max",
    video: { url: "https://v16.tiktokcdn.com/watchlist-test.mp4" },
    stats: { play_count: 1000, digg_count: 50, comment_count: 3, share_count: 1 },
    hook_text: "Llevo 30 días tomando esto",
    cta_text: "Pide el tuyo ahora",
    market: "MX",
    language: "es",
    ...overrides,
  };
}

async function setup() {
  const project = `watchlist-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Vida Divina TikTok", "actor");
  addWatchlistEntry(watchlist.id, "@vidadivina.oficial", "actor");
  return { project, projectRow, watchlist };
}

test("1) watchlist existente + primer run -> NEW", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();
  const result = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });

  assert.equal(result.discovered, 1);
  assert.equal(result.newItems.length, 1);
  assert.equal(result.updatedItems.length, 0);
  assert.equal(result.metricChanges.length, 0);
  assert.equal(result.unchangedItems.length, 0);
  assert.deepEqual(result.ingestedItems, result.newItems);
  assert.equal(result.provenance.source, "tiktok");
  assert.equal(result.provenance.rawItemsReceived, 1);
  assert.ok(result.checkedAt > 0);

  const updatedWatchlist = getWatchlistById(watchlist.id);
  assert.equal(updatedWatchlist?.last_checked_at, result.checkedAt, "estado mínimo (last_checked_at) actualizado tras el run");
});

test("2) repetir EXACTAMENTE el mismo input -> UNCHANGED, nunca duplica intelligence_items (5)", async () => {
  const { watchlist, projectRow } = await setup();
  // canonical_url DISTINTA por item -- 5 posts reales de TikTok nunca comparten
  // URL; usar la misma dispararía el fallback de coincidencia por canonical_url
  // que upsertIntelligenceItem ya tiene (MI-1, sin relación con este cambio) y
  // colapsaría los 5 en un único item, exactamente lo que este test NO quiere probar.
  const raws = Array.from({ length: 5 }, () => {
    const id = `tt-${randomUUID()}`;
    return tiktokFixture({ id, url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}` });
  });

  const run1 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: raws });
  assert.equal(run1.newItems.length, 5);

  const run2 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: raws });
  assert.equal(run2.newItems.length, 0, "run 2: 0 NEW");
  assert.equal(run2.unchangedItems.length, 5, "run 2: 5 UNCHANGED");
  assert.deepEqual(run2.ingestedItems, [], "UNCHANGED nunca pasa por ingestion");

  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  const tiktokItems = stored.filter((i) => raws.some((r) => r.id === i.external_id));
  assert.equal(tiktokItems.length, 5, "idempotencia (5): nunca se duplican intelligence_items");
});

test("3) misma item, nueva métrica -> METRICS_CHANGED, nuevo snapshot append-only", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();

  const run1 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  const itemId = run1.newItems[0];
  assert.equal(listMetricsHistory(itemId).length, 1);

  const rawWithNewMetrics: TikTokRawAd = { ...raw, stats: { ...raw.stats, play_count: 5000, digg_count: 400 } };
  const run2 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [rawWithNewMetrics] });

  assert.equal(run2.metricChanges.length, 1);
  assert.equal(run2.metricChanges[0], itemId, "mismo intelligence_item, no uno nuevo");
  assert.equal(run2.newItems.length, 0);
  assert.equal(run2.updatedItems.length, 0);

  const history = listMetricsHistory(itemId);
  assert.equal(history.length, 2, "append-only: el snapshot anterior sigue existiendo");
  assert.equal(history[1].views, 5000);
});

test("4) mismo item, copy/metadata relevante cambiado -> UPDATED", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();
  const run1 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  const itemId = run1.newItems[0];

  const rawWithNewCaption: TikTokRawAd = { ...raw, caption: "Nueva descripción totalmente distinta del producto" };
  const run2 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [rawWithNewCaption] });

  assert.equal(run2.updatedItems.length, 1);
  assert.equal(run2.updatedItems[0], itemId, "mismo intelligence_item -- 7) mismo project/source/external_id => mismo item");
  assert.equal(run2.newItems.length, 0);
  assert.equal(run2.metricChanges.length, 0, "un cambio de contenido no se reclasifica también como cambio de métricas");
});

test("6) mismo external_id, source DISTINTO -> items separados, sin colisión", async () => {
  const { watchlist, projectRow } = await setup();
  const sharedId = `shared-${randomUUID()}`;
  const tiktokRaw = tiktokFixture({ id: sharedId });
  const igRaw = { id: sharedId, shortcode: sharedId, caption: "Post real de Instagram", owner: { username: "vidadivina.oficial" }, taken_at: "2026-03-01T10:00:00.000Z" };

  const tiktokRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [tiktokRaw] });
  const igRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "instagram", adapter: instagramAdapter, rawItems: [igRaw] });

  assert.equal(tiktokRun.newItems.length, 1);
  assert.equal(igRun.newItems.length, 1);
  assert.notEqual(tiktokRun.newItems[0], igRun.newItems[0], "mismo external_id, source distinto -> items DISTINTOS");

  const all = searchIntelligenceItems({ project_id: projectRow.id });
  const withSharedId = all.filter((i) => i.external_id === sharedId);
  assert.equal(withSharedId.length, 2);
});

test("8) provenance preservado: evidence/source_metadata del adapter llegan intactos al item ingerido", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();
  const result = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });

  const stored = getIntelligenceItemById(result.newItems[0])!;
  assert.equal(stored.canonical_url, raw.url);
  const metadata = JSON.parse(stored.metadata_json!);
  assert.equal(metadata.source_metadata.raw_id, raw.id);
});

test("9) sigue usando el SourceAdapter existente: el item resultante coincide con normalize() directo", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();
  const directCanonical = tiktokAdapter.normalize(raw, { project: "irrelevante-para-esta-comparacion" });

  const result = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  const stored = getIntelligenceItemById(result.newItems[0])!;

  assert.equal(stored.content_type, directCanonical.content_type);
  assert.equal(stored.hook, directCanonical.hook);
  assert.equal(stored.cta, directCanonical.cta);
});

test("10) el Watchlist Runner no realiza adquisición externa por sí mismo (verificación estructural)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(
    path.join(__dirname, "../../../src/lib/intelligence/watchlist/watchlistRunner.ts"),
    "utf8"
  );
  for (const forbidden of ["fetch(", "child_process", "http.request", "https.request", "spawn(", "mcp__"]) {
    assert.equal(src.includes(forbidden), false, `watchlistRunner.ts no debe contener "${forbidden}"`);
  }
});

test("runWatchlistRun: watchlist inexistente -> lanza, nunca inventa una", async () => {
  await assert.rejects(
    () => runWatchlistRun({ watchlistId: 999999999, source: "tiktok", adapter: tiktokAdapter, rawItems: [] }),
    /no existe/
  );
});

test("runWatchlistRun: source no coincide con adapter.source -> lanza", async () => {
  const { watchlist } = await setup();
  await assert.rejects(
    () => runWatchlistRun({ watchlistId: watchlist.id, source: "instagram", adapter: tiktokAdapter, rawItems: [] }),
    /no coincide/
  );
});
