// scheduler.test.ts — getDueWatchlists()/runDueWatchlists(): "¿cuándo?",
// separado de adquisición ("¿de dónde?", inyectada vía `acquire`) y de
// Change Detection ("¿qué cambió?", sin tocar -- runWatchlistRun se
// reutiliza tal cual). Todas las llamadas van scoped por projectId: el
// Store es compartido entre tests (mismo intelligence.db real), y sin
// scoping una watchlist due de OTRO test contaminaría runDueWatchlists()
// aquí -- exactamente el mismo criterio de aislamiento que ya usa el
// resto de la suite (cada test crea su propio project).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  setWatchlistSchedule,
  getWatchlistById,
  getDueWatchlists,
  runDueWatchlists,
  tiktokAdapter,
  searchIntelligenceItems,
  addWatchlistEntry,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `sched-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina" },
    caption: "Contenido de prueba del scheduler",
    video: { url: "https://v16.tiktokcdn.com/sched-test.mp4" },
    stats: { play_count: 100, digg_count: 10 },
    ...overrides,
  };
}

async function setup(schedule: { enabled?: boolean; frequency?: "hourly" | "daily" | "weekly" | null } = { enabled: true, frequency: "hourly" }) {
  const project = `scheduler-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Watchlist scheduler test", "keyword", schedule);
  return { project, projectRow, watchlist };
}

function availableAcquire(raw: TikTokRawAd[]) {
  return async () => ({ name: "tiktok", adapter: tiktokAdapter, raw });
}

test("1) watchlist enabled + due -> seleccionada por getDueWatchlists", async () => {
  const { watchlist, projectRow } = await setup({ enabled: true, frequency: "hourly" });
  const due = getDueWatchlists(undefined, { projectId: projectRow.id });
  assert.ok(due.some((d) => d.watchlist.id === watchlist.id));
});

test("2) watchlist disabled -> NO seleccionada", async () => {
  const { watchlist, projectRow } = await setup({ enabled: false, frequency: "hourly" });
  const due = getDueWatchlists(undefined, { projectId: projectRow.id });
  assert.equal(due.some((d) => d.watchlist.id === watchlist.id), false);
});

test("2b) watchlist sin frequency configurada -> NO seleccionada (nunca due por sí sola)", async () => {
  const { watchlist, projectRow } = await setup({ enabled: true, frequency: null });
  const due = getDueWatchlists(undefined, { projectId: projectRow.id });
  assert.equal(due.some((d) => d.watchlist.id === watchlist.id), false);
});

test("3) watchlist futura (last_checked_at reciente, dentro de la ventana hourly) -> NO seleccionada", async () => {
  const { watchlist, projectRow } = await setup({ enabled: true, frequency: "hourly" });
  const t0 = 2_000_000;
  await runDueWatchlists(availableAcquire([tiktokFixture()]), t0, { projectId: projectRow.id });

  const dueSoonAfter = getDueWatchlists(t0 + 600, { projectId: projectRow.id }); // 10 min después -- todavía dentro de la ventana hourly
  assert.equal(dueSoonAfter.some((d) => d.watchlist.id === watchlist.id), false, "todavía dentro de la ventana hourly -- no debe estar due");
});

test("6) cambio de last_checked_at -> próxima ejecución calculada correctamente (justo en el límite y después)", async () => {
  const { watchlist, projectRow } = await setup({ enabled: true, frequency: "hourly" });
  const t0 = 1_000_000;
  await runDueWatchlists(availableAcquire([tiktokFixture()]), t0, { projectId: projectRow.id });

  const opts = { projectId: projectRow.id };
  assert.equal(getDueWatchlists(t0 + 3599, opts).some((d) => d.watchlist.id === watchlist.id), false, "1 segundo antes del límite -- no due");
  assert.equal(getDueWatchlists(t0 + 3600, opts).some((d) => d.watchlist.id === watchlist.id), true, "exactamente en el límite -- due");
  assert.equal(getDueWatchlists(t0 + 7200, opts).some((d) => d.watchlist.id === watchlist.id), true, "bien después -- due");
});

test("4) watchlist due -> runDueWatchlists() la ejecuta UNA sola vez", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const outcomes = await runDueWatchlists(availableAcquire([raw]), undefined, { projectId: projectRow.id });

  const mine = outcomes.filter((o) => o.watchlistId === watchlist.id);
  assert.equal(mine.length, 1, "una sola entrada de resultado para esta watchlist");
  assert.equal(mine[0].status, "RAN");
  assert.equal(mine[0].runResult?.newItems.length, 1);

  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(stored.length, 1);
});

test("5) segunda evaluación INMEDIATA -> no duplica ejecución (protegido por estado persistido, no memoria)", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const opts = { projectId: projectRow.id };

  const outcomes1 = await runDueWatchlists(availableAcquire([raw]), undefined, opts);
  assert.ok(outcomes1.some((o) => o.watchlistId === watchlist.id && o.status === "RAN"));

  // Llamada NUEVA e independiente (sin estado en memoria compartido más allá del proceso) --
  // debe ver que last_checked_at ya se actualizó y NO volver a seleccionar esta watchlist.
  const outcomes2 = await runDueWatchlists(availableAcquire([raw]), undefined, opts);
  assert.equal(outcomes2.some((o) => o.watchlistId === watchlist.id), false, "ya no está due -- no se re-ejecuta");

  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(stored.length, 1, "sin duplicados");
});

test("7) fallo de acquisition (lanza) -> status FAILED, last_checked_at NUNCA se toca (reintentable)", async () => {
  const { watchlist, projectRow } = await setup();
  const before = getWatchlistById(watchlist.id)!;
  assert.equal(before.last_checked_at, null);

  const failingAcquire = async () => {
    throw new Error("bridge no disponible: timeout de red");
  };
  const outcomes = await runDueWatchlists(failingAcquire, undefined, { projectId: projectRow.id });
  const mine = outcomes.find((o) => o.watchlistId === watchlist.id);
  assert.equal(mine?.status, "FAILED");
  assert.match(mine?.reason ?? "", /timeout de red/);

  const after = getWatchlistById(watchlist.id)!;
  assert.equal(after.last_checked_at, null, "un fallo nunca se marca como ejecutado con éxito");

  const stillDue = getDueWatchlists(undefined, { projectId: projectRow.id });
  assert.ok(stillDue.some((d) => d.watchlist.id === watchlist.id), "sigue due -- reintentable");
});

test("8) fuente unavailable -> estado explícito UNAVAILABLE, sin tocar el Intelligence Store", async () => {
  const { watchlist, projectRow } = await setup();
  const unavailableAcquire = async () => ({ name: "tiktok", unavailable: true as const, reason: "sin conector Monid alcanzable desde este runtime" });

  const outcomes = await runDueWatchlists(unavailableAcquire, undefined, { projectId: projectRow.id });
  const mine = outcomes.find((o) => o.watchlistId === watchlist.id);
  assert.equal(mine?.status, "UNAVAILABLE");
  assert.match(mine?.reason ?? "", /sin conector Monid/);

  const after = getWatchlistById(watchlist.id)!;
  assert.equal(after.last_checked_at, null, "unavailable nunca se confunde con una ejecución exitosa");

  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(stored.length, 0, "ninguna ingesta falsa");
});

test("9) reintento tras fallo NO genera duplicados", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const opts = { projectId: projectRow.id };

  let attempt = 0;
  const flakyAcquire = async () => {
    attempt++;
    if (attempt === 1) throw new Error("fallo transitorio");
    return { name: "tiktok", adapter: tiktokAdapter, raw: [raw] };
  };

  const first = await runDueWatchlists(flakyAcquire, undefined, opts);
  assert.equal(first.find((o) => o.watchlistId === watchlist.id)?.status, "FAILED");

  const second = await runDueWatchlists(flakyAcquire, undefined, opts);
  assert.equal(second.find((o) => o.watchlistId === watchlist.id)?.status, "RAN");

  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(stored.length, 1, "el reintento exitoso crea el item UNA vez, el intento fallido no dejó nada a medias");
});

test("10) compatibilidad con runWatchlistRun(): WatchlistSchedulerOutcome.runResult tiene exactamente el shape de runWatchlistRun", async () => {
  const { watchlist, projectRow } = await setup();
  const raw = tiktokFixture();
  const outcomes = await runDueWatchlists(availableAcquire([raw]), undefined, { projectId: projectRow.id });
  const mine = outcomes.find((o) => o.watchlistId === watchlist.id)!;

  assert.equal(mine.runResult?.watchlistId, watchlist.id);
  assert.ok(mine.runResult?.checkedAt);
  assert.equal(mine.runResult?.discovered, 1);
  assert.equal(mine.runResult?.provenance.source, "tiktok");
  assert.deepEqual(mine.runResult?.ingestedItems, mine.runResult?.newItems);
});

test("getDueWatchlists: entries de la watchlist vienen incluidas", async () => {
  const { watchlist, projectRow } = await setup();
  addWatchlistEntry(watchlist.id, "vida divina suplementos", "keyword");

  const due = getDueWatchlists(undefined, { projectId: projectRow.id });
  const mine = due.find((d) => d.watchlist.id === watchlist.id);
  assert.equal(mine?.entries.length, 1);
  assert.equal(mine?.entries[0].value, "vida divina suplementos");
});

test("getDueWatchlists: sin projectId, opera sobre todos los proyectos (incluye el propio)", async () => {
  const { watchlist } = await setup({ enabled: true, frequency: "hourly" });
  const due = getDueWatchlists(); // sin scoping -- global
  assert.ok(due.some((d) => d.watchlist.id === watchlist.id));
});

test("scheduler.ts no importa ningún mecanismo de adquisición directo (verificación estructural)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/lib/intelligence/watchlist/scheduler.ts"), "utf8");
  const importLines = src.split("\n").filter((l) => l.trim().startsWith("import "));
  for (const forbidden of ["fetch", "child_process", "tiktokMonidBridge", "instagramAdapter", "metaAdsAdapter", "jevDecisionProvider"]) {
    assert.equal(
      importLines.some((l) => l.includes(forbidden)),
      false,
      `scheduler.ts no debe IMPORTAR "${forbidden}" -- la adquisición se inyecta vía el parámetro acquire`
    );
  }
});

test("setWatchlistSchedule: cambia enabled/frequency de una watchlist ya existente", async () => {
  const { watchlist } = await setup({ enabled: true, frequency: "hourly" });
  const updated = setWatchlistSchedule(watchlist.id, { enabled: false });
  assert.equal(updated.enabled, false);
  assert.equal(updated.frequency, "hourly", "frequency no tocada cuando no se pasa");

  const reEnabled = setWatchlistSchedule(watchlist.id, { enabled: true, frequency: "daily" });
  assert.equal(reEnabled.enabled, true);
  assert.equal(reEnabled.frequency, "daily");
});
