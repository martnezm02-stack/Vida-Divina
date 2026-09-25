// index.ts — Punto de entrada de MI-4 (Pattern & Intelligence Detection).
//
// Query-driven: nada aquí corre solo -- detectPatterns/detectPatternsFromQuery
// se ejecutan únicamente cuando algo los llama explícitamente.
export * from "./types";
export { detectPatterns, detectPatternsFromQuery } from "./detectionService";
export { detectFrequencySignals, listItemsForSignal, upsertSignal } from "./signalDetection";
export type { UpsertSignalInput } from "./signalDetection";
export {
  detectCreativePatterns,
  detectPerformancePatterns,
  getPatternSupportingItems,
  getPatternSupportingActors,
  getPatternSupportingEvidence,
  getPatternSupportingAnalysisRuns,
  getPatternSignals,
  listPatternsByProjectDetailed,
} from "./patternDetection";
export { detectSharedFieldRelationships } from "./relationshipDetection";
export { groupByField, groupByActor, CREATIVE_FIELDS } from "./featureExtraction";
export type { CreativeField, FieldGroup } from "./featureExtraction";
