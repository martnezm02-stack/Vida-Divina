// index.ts — Punto de entrada de Watchlists + Change Detection
// (Continuous Intelligence, capa de infraestructura). Query/run-driven:
// runWatchlistRun() solo corre cuando algo lo llama, nunca por
// cron/scheduler (eso queda fuera de esta fase).
export * from "./types";
export { classifyChange } from "./changeDetection";
export { runWatchlistRun } from "./watchlistRunner";
