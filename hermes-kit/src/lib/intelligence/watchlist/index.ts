// index.ts — Punto de entrada de Watchlists + Change Detection + Scheduler
// + Worker (Continuous Intelligence, capa de infraestructura). Query/run-
// driven: nada corre por sí mismo hasta que algo llama runWatchlistRun(),
// runDueWatchlists() o start()/tick() del worker explícitamente.
export * from "./types";
export { classifyChange } from "./changeDetection";
export { runWatchlistRun } from "./watchlistRunner";
export { getDueWatchlists, runDueWatchlists } from "./scheduler";
export type {
  DueWatchlist,
  GetDueWatchlistsOptions,
  WatchlistAcquisitionOutcome,
  WatchlistAcquireFn,
  WatchlistSchedulerStatus,
  WatchlistSchedulerOutcome,
} from "./scheduler";
export { createIntelligenceWorker } from "./worker";
export type {
  IntelligenceWorker,
  IntelligenceWorkerOptions,
  WorkerTickResult,
  WorkerErrorPhase,
} from "./worker";
