// index.ts — Providers deterministas incluidos con MI-3 y su registro por
// analysisType sugerido (conveniencia; cualquier AnalysisProvider externo
// -- incluido uno respaldado por LLM -- funciona igual sin pasar por aquí).
import type { AnalysisProvider } from "../types";
import { creativeAnalysisProvider } from "./creativeAnalysisProvider";
import { actorAnalysisProvider } from "./actorAnalysisProvider";
import { assetAnalysisProvider } from "./assetAnalysisProvider";
import { performanceAnalysisProvider } from "./performanceAnalysisProvider";
import { semanticCreativeAnalysisProvider } from "./semanticCreativeAnalysisProvider";

export { creativeAnalysisProvider, actorAnalysisProvider, assetAnalysisProvider, performanceAnalysisProvider };
export {
  createSemanticCreativeAnalysisProvider,
  semanticCreativeAnalysisProvider,
  applySemanticCreativeAnalysis,
  SEMANTIC_CREATIVE_ELEMENTS,
} from "./semanticCreativeAnalysisProvider";
export type {
  SemanticCreativeElement,
  ApplySemanticCreativeAnalysisResult,
} from "./semanticCreativeAnalysisProvider";

export const DETERMINISTIC_ANALYSIS_TYPES = {
  creative_summary: creativeAnalysisProvider,
  actor_summary: actorAnalysisProvider,
  asset_summary: assetAnalysisProvider,
  performance_delta: performanceAnalysisProvider,
} as const satisfies Record<string, AnalysisProvider>;

export type DeterministicAnalysisType = keyof typeof DETERMINISTIC_ANALYSIS_TYPES;

/** analysisType sugerido para Semantic Creative Analysis (no determinista puro, por eso separado de DETERMINISTIC_ANALYSIS_TYPES). */
export const SEMANTIC_CREATIVE_ANALYSIS_TYPE = "semantic_creative" as const;
