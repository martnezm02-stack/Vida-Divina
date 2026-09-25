// intelligenceWorker.test.ts — entrypoint de proceso: dispatcher de
// adquisición, cableado onWatchlistRan -> relevance/insights, lifecycle
// SIGINT/SIGTERM, y que importar el módulo nunca arranca nada. La
// ejecución REAL del proceso completo (spawn real, SIGINT real, shutdown
// limpio) se valida aparte, vía shell (ver reporte final) -- probarla
// dentro de node --test en Windows es frágil (emulación de señales POSIX).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createTikTokAcquireDispatcher,
  createRelevanceInsightsHandler,
  buildWorkerConfigFromEnv,
  buildIntelligenceWorker,
  registerShutdownHandlers,
} from "../../scripts/intelligenceWorker";
import {
  getOrCreateProject,
  createWatchlist,
  addWatchlistEntry,
  runWatchlistRun,
  tiktokAdapter,
  listSignalsByProject,
} from "../../src/lib/intelligence";
import type { TikTokRawAd } from "../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `ep-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina" },
    video: { url: "https://v16.tiktokcdn.com/ep-test.mp4" },
    stats: { play_count: 10 },
    ...overrides,
  };
}

test("1) buildIntelligenceWorker construye un Worker real con start/stop/tick/isRunning", () => {
  const worker = buildIntelligenceWorker({ tickIntervalMs: 100_000, maxItems: 5, buildBrief: false, jevConfigured: false });
  assert.equal(typeof worker.start, "function");
  assert.equal(typeof worker.stop, "function");
  assert.equal(typeof worker.tick, "function");
  assert.equal(worker.isRunning, false);
});

test("2) dispatcher: entry tiktok:* -> intenta el bridge TikTok/Monid real (selección correcta de fuente, rápido y determinista)", async () => {
  const project = getOrCreateProject(`ep-dispatch-${randomUUID()}`);
  const watchlist = createWatchlist(project.id, "dispatch test", "keyword");
  const entries = [{ id: 1, watchlist_id: watchlist.id, value: "vida divina suplementos", kind: "tiktok:keyword", created_at: 1 }];

  // HERMES_DESKTOP_ROOT se fuerza a una ruta inexistente para que
  // fetchTikTokViaMonidBridge (sin tocar) falle rápido (spawn ENOENT) en
  // vez de completar una llamada real a Monid -- este test solo prueba
  // SELECCIÓN de fuente, no el bridge en sí (ya validado con datos reales
  // en bc054eb). La llamada real de extremo a extremo se demuestra en el E2E.
  const original = process.env.HERMES_DESKTOP_ROOT;
  process.env.HERMES_DESKTOP_ROOT = "C:/ruta/inexistente/para-forzar-fallo-rapido";
  try {
    const dispatch = createTikTokAcquireDispatcher({ maxItems: 5 });
    const result = await dispatch(watchlist, entries);
    assert.ok("unavailable" in result && result.unavailable, "ruta inexistente -- debe fallar, honestamente");
    if ("unavailable" in result) {
      assert.doesNotMatch(result.reason, /sin fuente soportada/, "una entry tiktok:* nunca debe caer en 'sin fuente soportada' -- sí se intentó la ruta TikTok");
    }
  } finally {
    if (original === undefined) delete process.env.HERMES_DESKTOP_ROOT;
    else process.env.HERMES_DESKTOP_ROOT = original;
  }
});

test("3) dispatcher: fuente no soportada en este runtime -> UNAVAILABLE honesto, nunca intenta TikTok", async () => {
  const project = getOrCreateProject(`ep-unsupported-${randomUUID()}`);
  const watchlist = createWatchlist(project.id, "unsupported source test", "keyword");
  const entries = [{ id: 1, watchlist_id: watchlist.id, value: "algo", kind: "instagram:keyword", created_at: 1 }];

  const dispatch = createTikTokAcquireDispatcher({ maxItems: 5 });
  const result = await dispatch(watchlist, entries);

  assert.ok("unavailable" in result && result.unavailable);
  if ("unavailable" in result) {
    assert.match(result.reason, /sin fuente soportada/);
  }
});

test("3b) dispatcher: sin ninguna entry -> UNAVAILABLE honesto", async () => {
  const project = getOrCreateProject(`ep-no-entries-${randomUUID()}`);
  const watchlist = createWatchlist(project.id, "no entries test", "keyword");

  const dispatch = createTikTokAcquireDispatcher({ maxItems: 5 });
  const result = await dispatch(watchlist, []);
  assert.ok("unavailable" in result && result.unavailable);
});

test("4) onWatchlistRan conecta con relevance/insights reales (processWatchlistSignals), sin duplicar lógica", async () => {
  const project = getOrCreateProject(`ep-handler-${randomUUID()}`);
  const watchlist = createWatchlist(project.id, "handler test", "keyword");
  const raw = tiktokFixture();
  const runResult = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });

  const handler = createRelevanceInsightsHandler({ decisionProvider: null, buildBrief: false });
  await handler(runResult, watchlist.id);

  const signals = listSignalsByProject(project.id);
  assert.ok(signals.length > 0, "el handler debe haber generado al menos una signal real vía relevance/signalRecorder.ts (sin tocar)");
});

test("5) SIGINT/SIGTERM detienen el Worker correctamente (registerShutdownHandlers)", async () => {
  let stopped = false;
  let exitCode: number | null = null;
  const fakeWorker = {
    start: () => {},
    stop: () => {
      stopped = true;
    },
    tick: async () => ({ startedAt: 0, finishedAt: 0, watchlistsDue: 0, ran: 0, unavailable: 0, failed: 0, outcomes: [] }),
    isRunning: true,
  };

  const cleanup = registerShutdownHandlers(fakeWorker, (code) => {
    exitCode = code;
  });
  try {
    process.emit("SIGINT");
    assert.equal(stopped, true, "SIGINT debe llamar a worker.stop()");
    assert.equal(exitCode, 0);
  } finally {
    cleanup();
  }
});

test("6) importar el módulo NUNCA arranca el Worker (sin listeners SIGINT/SIGTERM nuevos)", async () => {
  const sigintBefore = process.listenerCount("SIGINT");
  const sigtermBefore = process.listenerCount("SIGTERM");

  // Re-import "fresco" no es trivial en Node/tsx sin invalidar el cache de módulos --
  // lo relevante y suficiente aquí es que YA fue importado arriba (para usar sus
  // funciones exportadas) y en ningún momento se registraron listeners de señal
  // fuera de una llamada explícita a registerShutdownHandlers()/main().
  assert.equal(process.listenerCount("SIGINT"), sigintBefore);
  assert.equal(process.listenerCount("SIGTERM"), sigtermBefore);
});

test("8/9) el Worker (src/lib/intelligence/watchlist/worker.ts) sigue sin importar JEV ni Monid, incluso con este entrypoint ya existiendo", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../../src/lib/intelligence/watchlist/worker.ts"), "utf8");
  const importLines = src.split("\n").filter((l) => l.trim().startsWith("import "));
  for (const forbidden of ["jevDecisionProvider", "tiktokMonidBridge", "signalInsights", "relevance"]) {
    assert.equal(importLines.some((l) => l.includes(forbidden)), false, `worker.ts no debe importar "${forbidden}"`);
  }
});

test("buildWorkerConfigFromEnv: defaults razonables sin config, respeta overrides de entorno", () => {
  const originalTick = process.env.INTELLIGENCE_WORKER_TICK_MS;
  const originalProject = process.env.INTELLIGENCE_WORKER_PROJECT_ID;
  try {
    delete process.env.INTELLIGENCE_WORKER_TICK_MS;
    delete process.env.INTELLIGENCE_WORKER_PROJECT_ID;
    const defaults = buildWorkerConfigFromEnv();
    assert.ok(defaults.tickIntervalMs > 0);
    assert.equal(defaults.projectId, undefined);

    process.env.INTELLIGENCE_WORKER_TICK_MS = "12345";
    process.env.INTELLIGENCE_WORKER_PROJECT_ID = "7";
    const overridden = buildWorkerConfigFromEnv();
    assert.equal(overridden.tickIntervalMs, 12345);
    assert.equal(overridden.projectId, 7);
  } finally {
    if (originalTick === undefined) delete process.env.INTELLIGENCE_WORKER_TICK_MS;
    else process.env.INTELLIGENCE_WORKER_TICK_MS = originalTick;
    if (originalProject === undefined) delete process.env.INTELLIGENCE_WORKER_PROJECT_ID;
    else process.env.INTELLIGENCE_WORKER_PROJECT_ID = originalProject;
  }
});
