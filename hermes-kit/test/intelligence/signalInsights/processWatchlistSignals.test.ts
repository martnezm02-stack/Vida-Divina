// processWatchlistSignals.test.ts — orquestador de alto nivel: Watchlist
// Run -> Signals -> Insights -> Brief opcional, en un solo llamado, sin
// acoplar Watchlist Runner/Scheduler a JEV/MI-5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  runWatchlistRun,
  processWatchlistSignals,
  tiktokAdapter,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `pws-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina" },
    video: { url: "https://v16.tiktokcdn.com/pws-test.mp4" },
    stats: { play_count: 100, digg_count: 10 },
    ...overrides,
  };
}

async function setup() {
  const project = `process-watchlist-signals-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Watchlist orchestrator test", "keyword");
  return { project, projectRow, watchlist };
}

test("processWatchlistSignals: watchlist run con evidencia real suficiente -> relevance + insights + brief opcional", async () => {
  const { watchlist } = await setup();
  const sharedHook = `hook orchestrator ${randomUUID()}`;
  const raws = [tiktokFixture({ hook_text: sharedHook }), tiktokFixture({ hook_text: sharedHook })];

  const run = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: raws });
  const result = await processWatchlistSignals(run, { decisionProvider: null, buildBrief: true });

  assert.equal(result.relevance.length, 2);
  assert.equal(result.insights.status, "ok");
  assert.ok(result.brief);
  assert.equal(result.brief?.status, "ok");
});

test("processWatchlistSignals: sin signals (todo UNCHANGED) -> insights insufficient_evidence, honesto", async () => {
  const { watchlist } = await setup();
  const raw = tiktokFixture();

  const run1 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  await processWatchlistSignals(run1, { decisionProvider: null });

  const run2 = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  assert.equal(run2.changes[0].status, "UNCHANGED");

  const result = await processWatchlistSignals(run2, { decisionProvider: null });
  assert.equal(result.relevance.length, 0);
  assert.equal(result.insights.status, "insufficient_evidence");
});

test("processWatchlistSignals: watchlist inexistente -> lanza, nunca inventa", async () => {
  const fakeRun = {
    watchlistId: 999999999,
    checkedAt: 1,
    discovered: 0,
    newItems: [],
    updatedItems: [],
    metricChanges: [],
    unchangedItems: [],
    ingestedItems: [],
    changes: [],
    provenance: { source: "tiktok", rawItemsReceived: 0 },
  };
  await assert.rejects(() => processWatchlistSignals(fakeRun, { decisionProvider: null }), /no existe/);
});

test("13/14/15/16) no rompe Watchlist Runner/Scheduler/Relevance/MI-5 -- ninguno importa signalInsights/", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filesToCheck = [
    "../../../src/lib/intelligence/watchlist/watchlistRunner.ts",
    "../../../src/lib/intelligence/watchlist/scheduler.ts",
    "../../../src/lib/intelligence/relevance/relevanceEngine.ts",
    "../../../src/lib/intelligence/relevance/signalRecorder.ts",
  ];
  for (const relPath of filesToCheck) {
    const src = fs.readFileSync(path.join(__dirname, relPath), "utf8");
    const importLines = src.split("\n").filter((l) => l.trim().startsWith("import "));
    assert.equal(
      importLines.some((l) => l.includes("signalInsights")),
      false,
      `${relPath} no debe importar signalInsights/ -- la composición ocurre en el orchestrator superior`
    );
  }
});
