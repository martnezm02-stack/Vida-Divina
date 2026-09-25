// index.ts — Punto de entrada de Performance Predictor.
//
// CREATIVE + CONTEXT + HISTORICAL EVIDENCE -> PerformancePredictor ->
// PREDICTION + CONFIDENCE + EVIDENCE + EXPLANATION. Query-driven: nada
// aquí corre solo -- predict() únicamente cuando algo lo llama.
export * from "./types";
export { historicalSimilarityPerformancePredictor } from "./historicalSimilarityPerformancePredictor";
export {
  PREDICTION_ANALYSIS_TYPE,
  savePredictionRecord,
  listPredictionRecordsForItem,
  findLatestPredictionForItem,
  comparePredictionToActual,
  comparePredictionToActualForItem,
} from "./predictionRecord";
export type { PredictionVsActual } from "./predictionRecord";
