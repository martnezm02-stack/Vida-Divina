// index.ts — Punto de entrada del puente Signal -> MI-5 Insights/Briefs.
// Query-driven, igual que el resto: nada aquí corre por su cuenta.
export * from "./types";
export { generateInsightsFromSignals, getInsightSourceSignalIds } from "./generateInsightsFromSignals";
export { processWatchlistSignals } from "./processWatchlistSignals";
export type { ProcessWatchlistSignalsOptions, ProcessWatchlistSignalsResult } from "./processWatchlistSignals";
