// index.ts — Relevance/Change Intelligence: "¿qué cambio merece atención?"
// Consume WatchlistRunResult (watchlist/, sin acoplarlo a JEV) y produce
// signals (MI-1, reutilizadas tal cual). Query-driven, igual que el resto
// de MI-1..MI-5: nada aquí corre por su cuenta.
export * from "./types";
export { buildChangeContext } from "./buildChangeContext";
export { evaluateChangeRelevance } from "./relevanceEngine";
export { recordRelevanceSignal, RELEVANCE_SIGNAL_TYPE_PREFIX } from "./signalRecorder";
export { processWatchlistRunRelevance } from "./processWatchlistRunRelevance";
export type { ProcessedChangeRelevance } from "./processWatchlistRunRelevance";
