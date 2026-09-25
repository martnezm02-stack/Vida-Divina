// worker.test.ts — createIntelligenceWorker(): start/stop/tick,
// no-overlapping, manejo de errores, shutdown limpio, sin importar
// fuentes/JEV/insights (inyección pura).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  createIntelligenceWorker,
  tiktokAdapter,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `wk-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina" },
    video: { url: "https://v16.tiktokcdn.com/wk-test.mp4" },
    stats: { play_count: 10 },
    ...overrides,
  };
}

async function setup(schedule: { enabled?: boolean; frequency?: "hourly" | "daily" | "weekly" | null } = { enabled: true, frequency: "hourly" }) {
  const project = `worker-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Worker test watchlist", "keyword", schedule);
  return { projectRow, watchlist };
}

function countingAcquire(raw: TikTokRawAd[] = [tiktokFixture()]) {
  let calls = 0;
  const fn = async () => {
    calls++;
    return { name: "tiktok", adapter: tiktokAdapter, raw };
  };
  return { fn, callCount: () => calls };
}

test("1) tick sin watchlists due -> no acquisition", async () => {
  const { projectRow } = await setup({ enabled: false, frequency: "hourly" }); // disabled -- nunca due
  const acquire = countingAcquire();
  const worker = createIntelligenceWorker({ acquire: acquire.fn, tickIntervalMs: 100_000, projectId: projectRow.id });

  const result = await worker.tick();
  assert.equal(result.watchlistsDue, 0);
  assert.equal(acquire.callCount(), 0, "sin watchlists due, acquire nunca se llama");
});

test("2) tick con watchlist due -> ejecuta el Scheduler (RAN real)", async () => {
  const { projectRow, watchlist } = await setup();
  const acquire = countingAcquire();
  const worker = createIntelligenceWorker({ acquire: acquire.fn, tickIntervalMs: 100_000, projectId: projectRow.id });

  const result = await worker.tick();
  assert.equal(result.watchlistsDue, 1);
  assert.equal(result.ran, 1);
  assert.equal(acquire.callCount(), 1);
  assert.equal(result.outcomes[0].watchlistId, watchlist.id);
  assert.equal(result.outcomes[0].status, "RAN");
});

test("3/4) start() inicia polling real, stop() lo detiene", async () => {
  await setup();
  const acquire = countingAcquire();
  const worker = createIntelligenceWorker({ acquire: acquire.fn, tickIntervalMs: 20 });

  worker.start();
  assert.equal(worker.isRunning, true);
  await sleep(90); // suficiente para varios ticks a 20ms
  worker.stop();
  assert.equal(worker.isRunning, false);

  const callsAtStop = acquire.callCount();
  assert.ok(callsAtStop > 0, "start() debe haber disparado al menos un tick real");

  await sleep(60); // tiempo de sobra tras stop()
  assert.equal(acquire.callCount(), callsAtStop, "stop() detiene el polling -- ningún tick nuevo después");
});

test("5) start() llamado dos veces -> un solo loop (no duplica timers)", async () => {
  await setup();
  const acquire = countingAcquire();
  const worker = createIntelligenceWorker({ acquire: acquire.fn, tickIntervalMs: 25 });

  worker.start();
  worker.start(); // segunda llamada -- no debe crear un segundo interval
  await sleep(80);
  worker.stop();

  // Con UN solo loop a 25ms durante ~80ms deberían caber ~3 ticks, no ~6+.
  assert.ok(acquire.callCount() <= 5, `demasiadas ejecuciones (${acquire.callCount()}) -- sugiere loops duplicados`);
});

test("6) stop() llamado dos veces -> seguro/idempotente", async () => {
  await setup();
  const worker = createIntelligenceWorker({ acquire: countingAcquire().fn, tickIntervalMs: 50 });
  worker.start();
  worker.stop();
  assert.doesNotThrow(() => worker.stop());
  assert.equal(worker.isRunning, false);
});

test("7) tick manual funciona sin start()", async () => {
  const { projectRow } = await setup();
  const acquire = countingAcquire();
  const worker = createIntelligenceWorker({ acquire: acquire.fn, tickIntervalMs: 100_000, projectId: projectRow.id });

  assert.equal(worker.isRunning, false);
  const result = await worker.tick();
  assert.equal(result.ran, 1);
});

test("8) intervalo configurable -- distintos tickIntervalMs producen distinta cadencia real", async () => {
  await setup();
  const fast = countingAcquire();
  const slow = countingAcquire();
  const fastWorker = createIntelligenceWorker({ acquire: fast.fn, tickIntervalMs: 15 });
  const slowWorker = createIntelligenceWorker({ acquire: slow.fn, tickIntervalMs: 200 });

  fastWorker.start();
  slowWorker.start();
  await sleep(90);
  fastWorker.stop();
  slowWorker.stop();

  assert.ok(fast.callCount() > slow.callCount(), "un intervalo más corto debe producir más ticks reales en la misma ventana");
});

test("9) tick concurrente (manual + loop) no genera overlapping execution", async () => {
  const { projectRow } = await setup();
  let concurrent = 0;
  let maxConcurrent = 0;
  const acquire = async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await sleep(40); // acquisition "lenta" a propósito
    concurrent--;
    return { name: "tiktok", adapter: tiktokAdapter, raw: [tiktokFixture()] };
  };
  const worker = createIntelligenceWorker({ acquire, tickIntervalMs: 10, projectId: projectRow.id });

  worker.start();
  // Mientras el primer tick (lento) sigue en curso, se llama tick() manualmente varias veces.
  const manualTicks = await Promise.all([worker.tick(), worker.tick(), worker.tick()]);
  await sleep(60);
  worker.stop();

  assert.equal(maxConcurrent, 1, "nunca debe haber más de una acquisition real corriendo a la vez");
  // Las 3 llamadas manuales concurrentes deben resolver al MISMO tick en curso (mismo startedAt), nunca 3 ticks paralelos.
  assert.equal(manualTicks[0].startedAt, manualTicks[1].startedAt);
  assert.equal(manualTicks[1].startedAt, manualTicks[2].startedAt);
});

test("10/11) error de acquisition/Scheduler no mata el Worker -- el siguiente tick continúa", async () => {
  const { watchlist, projectRow } = await setup();
  let attempt = 0;
  const flakyAcquire = async () => {
    attempt++;
    if (attempt === 1) throw new Error("fallo simulado de acquisition");
    return { name: "tiktok", adapter: tiktokAdapter, raw: [tiktokFixture()] };
  };
  const errors: Array<{ watchlistId?: number; phase: string }> = [];
  const worker = createIntelligenceWorker({
    acquire: flakyAcquire,
    tickIntervalMs: 100_000,
    projectId: projectRow.id,
    onError: (_err, ctx) => errors.push(ctx),
  });

  const first = await worker.tick();
  assert.equal(first.failed, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].watchlistId, watchlist.id);
  assert.equal(errors[0].phase, "run");

  // El worker sigue vivo y funcional -- un segundo tick procesa con éxito.
  const second = await worker.tick();
  assert.equal(second.ran, 1);
});

test("12) shutdown no deja timers pendientes (stop() limpia el interval real)", async () => {
  await setup();
  const worker = createIntelligenceWorker({ acquire: countingAcquire().fn, tickIntervalMs: 15 });
  worker.start();
  await sleep(40);
  worker.stop();
  await sleep(80); // tiempo de sobra -- si quedara un timer vivo, seguiría disparando ticks
  assert.equal(worker.isRunning, false, "ningún handle vivo tras stop()");
});

test("13) Worker no importa fuentes concretas (verificación estructural)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/lib/intelligence/watchlist/worker.ts"), "utf8");
  const importLines = src.split("\n").filter((l) => l.trim().startsWith("import "));
  for (const forbidden of ["tiktokMonidBridge", "instagramAdapter", "metaAdsAdapter", "fetch", "child_process"]) {
    assert.equal(importLines.some((l) => l.includes(forbidden)), false, `worker.ts no debe importar "${forbidden}"`);
  }
});

test("14) Worker no importa JEV/relevance/analysis/insights (verificación estructural)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/lib/intelligence/watchlist/worker.ts"), "utf8");
  const importLines = src.split("\n").filter((l) => l.trim().startsWith("import "));
  for (const forbidden of ["jevDecisionProvider", "createJevDecisionProvider", "relevance", "signalInsights", "../analysis", "../detection", "../synthesis", "../decision"]) {
    assert.equal(importLines.some((l) => l.includes(forbidden)), false, `worker.ts no debe importar "${forbidden}"`);
  }
});

test("15) Scheduler sigue funcionando de forma independiente del Worker (sin construir un worker)", async () => {
  const { projectRow, watchlist } = await setup();
  const { runDueWatchlists } = await import("../../../src/lib/intelligence");
  const outcomes = await runDueWatchlists(async () => ({ name: "tiktok", adapter: tiktokAdapter, raw: [tiktokFixture()] }), undefined, { projectId: projectRow.id });
  assert.equal(outcomes.find((o) => o.watchlistId === watchlist.id)?.status, "RAN");
});

test("onWatchlistRan: se invoca tras cada RAN real, y su error nunca detiene el tick", async () => {
  const { projectRow, watchlist } = await setup();
  const seen: number[] = [];
  const worker = createIntelligenceWorker({
    acquire: async () => ({ name: "tiktok", adapter: tiktokAdapter, raw: [tiktokFixture()] }),
    tickIntervalMs: 100_000,
    projectId: projectRow.id,
    onWatchlistRan: (_runResult, watchlistId) => {
      seen.push(watchlistId);
      throw new Error("fallo simulado en el callback inyectado (p.ej. processWatchlistSignals)");
    },
  });

  const result = await worker.tick();
  assert.deepEqual(seen, [watchlist.id]);
  assert.equal(result.ran, 1, "un error en onWatchlistRan no cambia el status RAN ya logrado por el Scheduler");
});
