// index.ts — Punto de entrada de MI-3 (Analysis & Enrichment Layer).
//
// Query-driven: nada aquí se ejecuta solo -- analyzeItems/analyzeQuery
// corren únicamente cuando algo los llama explícitamente.
export * from "./types";
export {
  analyzeItems,
  analyzeQuery,
  getAnalysisRun,
  listAnalysisRunsForItem,
  listAnalysisRunsByProject,
} from "./analysisService";
export {
  creativeAnalysisProvider,
  actorAnalysisProvider,
  assetAnalysisProvider,
  performanceAnalysisProvider,
  DETERMINISTIC_ANALYSIS_TYPES,
  createSemanticCreativeAnalysisProvider,
  semanticCreativeAnalysisProvider,
  applySemanticCreativeAnalysis,
  SEMANTIC_CREATIVE_ELEMENTS,
  SEMANTIC_CREATIVE_ANALYSIS_TYPE,
} from "./providers";
export type {
  DeterministicAnalysisType,
  SemanticCreativeElement,
  ApplySemanticCreativeAnalysisResult,
} from "./providers";
