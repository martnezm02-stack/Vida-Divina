// index.ts — Punto de entrada de MI-5 (Intelligence, Insights, Briefs &
// Context Optimization).
//
// Query-driven: nada aquí corre solo. Intelligence → Insight → Brief →
// Creative Intelligence Contract -- termina ahí, nunca genera ni publica
// anuncios (eso queda fuera de MI-5).
export * from "./types";
export {
  deterministicContextOptimizer,
  createDecisionBackedContextOptimizer,
  withFallback,
} from "./contextOptimizer";
export { deterministicGenerationProvider } from "./generationProvider";
export {
  generateInsights,
  generateInsightsFromPatterns,
  getInsight,
  listInsightsByProject,
  getInsightSupportingItems,
  getInsightSupportingActors,
  getInsightSupportingEvidence,
  getInsightSupportingPatterns,
} from "./insightService";
export {
  buildIntelligenceBrief,
  buildCreativeIntelligenceBrief,
  generateBrief,
} from "./briefBuilder";
export type { BriefQueryContext, GenerateBriefOutcome } from "./briefBuilder";
