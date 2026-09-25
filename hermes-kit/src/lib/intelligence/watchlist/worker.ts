// worker.ts — el mecanismo que despierta periódicamente al Scheduler
// (scheduler.ts, sin tocar) y ejecuta el pipeline ya construido.
//
//   WORKER (este archivo)       "¿cuándo vuelvo a ejecutar el Scheduler?"
//   SCHEDULER (scheduler.ts)    "¿qué watchlists están due?"
//   ACQUISITION (inyectada)     "¿cómo obtengo los datos?"
//   WATCHLIST RUNNER            "¿qué cambió?"
//   RELEVANCE/INSIGHTS          "¿qué merece atención? ¿qué concluye la evidencia?"
//
// Este archivo NUNCA importa Monid/TikTok/Instagram/Meta/JEV/
// DecisionProvider/analysis/detection/synthesis/relevance/signalInsights
// -- solo scheduler.ts (que ya no importa ninguno de ellos tampoco, ver
// 67ddcee/998cc4e). El cierre completo del ciclo
// (Scheduler -> Relevance -> Signals -> Insights -> Brief) ocurre por
// INYECCIÓN vía `onWatchlistRan`, nunca por un import directo aquí -- el
// caller que construye el worker es quien decide pasar
// processWatchlistSignals() (u otra cosa) como ese callback.
//
// No duplica lógica de scheduler.ts: runDueWatchlists() YA garantiza que
// `acquire` nunca se llama si ninguna watchlist está due (el for-loop
// interno simplemente no itera) -- este archivo no repite ese chequeo.
import { runDueWatchlists } from "./scheduler";
import type { GetDueWatchlistsOptions, WatchlistAcquireFn, WatchlistSchedulerOutcome } from "./scheduler";
import type { WatchlistRunResult } from "./types";

export interface WorkerTickResult {
  startedAt: number;
  finishedAt: number;
  watchlistsDue: number;
  ran: number;
  unavailable: number;
  failed: number;
  /** Detalle completo tal cual lo devuelve runDueWatchlists() -- sin reinterpretar ni duplicar su información. */
  outcomes: WatchlistSchedulerOutcome[];
}

export type WorkerErrorPhase = "run" | "onWatchlistRan" | "tick";

export interface IntelligenceWorkerOptions {
  /** Inyectada -- nunca implementada aquí (ver scheduler.ts#WatchlistAcquireFn). */
  acquire: WatchlistAcquireFn;
  /** Intervalo entre ticks automáticos (start()). Sin default de negocio hardcodeado -- el caller decide según su propio contexto. */
  tickIntervalMs: number;
  /** Acota a un proyecto (mismo GetDueWatchlistsOptions que ya expone scheduler.ts). Ausente = todos los proyectos. */
  projectId?: number;
  /** Proveedor de tiempo -- inyectable para tests deterministas, sin tocar Date.now() global. */
  now?: () => number;
  /**
   * Invocado tras cada watchlist ejecutada con éxito (status "RAN"). Aquí
   * es donde el caller cierra el resto del ciclo (relevance -> signals ->
   * insights -> brief, p.ej. vía processWatchlistSignals) -- este archivo
   * nunca lo hace por su cuenta. Un error lanzado aquí se reporta vía
   * onError y NUNCA detiene el worker ni el resto del tick.
   */
  onWatchlistRan?: (runResult: WatchlistRunResult, watchlistId: number) => void | Promise<void>;
  /** Observabilidad opcional -- resultado estructurado por tick, nunca persistido por este archivo. */
  onTick?: (result: WorkerTickResult) => void;
  /** Observabilidad opcional de errores -- el worker nunca lanza por su cuenta desde el loop automático. */
  onError?: (error: unknown, context: { watchlistId?: number; phase: WorkerErrorPhase }) => void;
}

export interface IntelligenceWorker {
  /** Inicia el loop periódico. Llamarlo dos veces no crea un segundo loop. */
  start(): void;
  /** Detiene el loop limpiamente (clearInterval real, ningún handle vivo queda). Segura de llamar aunque ya esté detenido. */
  stop(): void;
  /**
   * Ejecuta un tick manualmente -- no requiere start() activo. Si ya hay
   * un tick en curso (manual o del loop automático), devuelve la MISMA
   * promesa en vez de arrancar una ejecución paralela -- nunca overlapping.
   */
  tick(): Promise<WorkerTickResult>;
  readonly isRunning: boolean;
}

const defaultNow = () => Math.floor(Date.now() / 1000);

export function createIntelligenceWorker(options: IntelligenceWorkerOptions): IntelligenceWorker {
  const now = options.now ?? defaultNow;
  const dueOptions: GetDueWatchlistsOptions | undefined =
    options.projectId !== undefined ? { projectId: options.projectId } : undefined;

  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let tickInFlight: Promise<WorkerTickResult> | null = null;

  async function runTickOnce(): Promise<WorkerTickResult> {
    const startedAt = now();
    let outcomes: WatchlistSchedulerOutcome[];
    try {
      outcomes = await runDueWatchlists(options.acquire, startedAt, dueOptions);
    } catch (err) {
      options.onError?.(err, { phase: "tick" });
      const result: WorkerTickResult = {
        startedAt,
        finishedAt: now(),
        watchlistsDue: 0,
        ran: 0,
        unavailable: 0,
        failed: 0,
        outcomes: [],
      };
      try {
        options.onTick?.(result);
      } catch {
        /* onTick nunca debe romper el worker */
      }
      return result;
    }

    let ran = 0;
    let unavailable = 0;
    let failed = 0;

    for (const outcome of outcomes) {
      if (outcome.status === "RAN") {
        ran++;
        if (options.onWatchlistRan && outcome.runResult) {
          try {
            await options.onWatchlistRan(outcome.runResult, outcome.watchlistId);
          } catch (err) {
            options.onError?.(err, { watchlistId: outcome.watchlistId, phase: "onWatchlistRan" });
          }
        }
      } else if (outcome.status === "UNAVAILABLE") {
        unavailable++;
      } else {
        failed++;
        options.onError?.(new Error(outcome.reason ?? "watchlist run failed"), {
          watchlistId: outcome.watchlistId,
          phase: "run",
        });
      }
    }

    const result: WorkerTickResult = {
      startedAt,
      finishedAt: now(),
      watchlistsDue: outcomes.length,
      ran,
      unavailable,
      failed,
      outcomes,
    };
    try {
      options.onTick?.(result);
    } catch {
      /* onTick nunca debe romper el worker */
    }
    return result;
  }

  function tick(): Promise<WorkerTickResult> {
    if (tickInFlight) return tickInFlight; // ya hay un tick en curso -- nunca una segunda ejecución paralela
    const promise = runTickOnce().finally(() => {
      tickInFlight = null;
    });
    tickInFlight = promise;
    return promise;
  }

  function start(): void {
    if (intervalHandle) return; // ya estaba corriendo -- un solo loop
    intervalHandle = setInterval(() => {
      if (tickInFlight) return; // tick anterior aún en curso -- se salta este ciclo, nunca overlapping
      void tick();
    }, options.tickIntervalMs);
  }

  function stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return {
    start,
    stop,
    tick,
    get isRunning() {
      return intervalHandle !== null;
    },
  };
}
