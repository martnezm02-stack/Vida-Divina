// index.ts — Punto de entrada del orquestador Research Query.
//
// Query-driven: runResearchQuery() solo corre cuando algo lo llama --
// nunca cron/polling/crawler. Secuencia MI-1 (retrieval) → MI-2 (ingesta,
// solo si hace falta) → MI-3 (analysis) → MI-4/MI-5 (patterns → insights →
// brief, vía generateBrief) sin reimplementar ninguna de esas capas.
export * from "./types";
export { assessEvidence } from "./evidenceAssessment";
export type { EvidenceAssessment, EvidenceAssessmentOptions } from "./evidenceAssessment";
export { runResearchQuery } from "./researchService";
export { runMultiSourceResearchQuery } from "./multiSource";
export type {
  AvailableSource,
  UnavailableSource,
  MultiSourceEntry,
  MultiSourceResearchRequest,
  SourceContribution,
  MultiSourceOutcome,
} from "./multiSource";
