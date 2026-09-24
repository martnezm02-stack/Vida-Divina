// types.ts — Contratos de MI-5 (Intelligence, Insights, Briefs & Context
// Optimization).
//
// INTELLIGENCE STORE -> QUERY -> RELEVANCE + CONTEXT SELECTION ->
// JEV/DecisionProvider (opcional) -> RELEVANT STRUCTURED CONTEXT ->
// INSIGHT GENERATION -> INTELLIGENCE BRIEF -> CREATIVE INTELLIGENCE
// CONTRACT -> Creative Studio.
//
// Separación estricta en todo insight generado:
//   evidence (hecho observado) ≠ finding (derivado de los datos) ≠
//   interpretation (inferencia razonada) ≠ recommendation (implicación
//   potencial, SIEMPRE marcada como tal, nunca como hecho).
import type { Actor, IntelligenceItemSearchFilter, IntelligenceItemWithDerived, Insight, Pattern } from "../types";

// ---------------------------------------------------------------------------
// Context Optimization (sección 3B/4/5/6)
// ---------------------------------------------------------------------------

export interface ContextOptimizationOptions {
  maxTokens?: number;
  maxPatterns?: number;
  maxItems?: number;
  maxEvidence?: number;
  /** 0..1 -- patrones con confidence por debajo de esto se descartan de la selección. */
  relevanceThreshold?: number;
}

/** El pool completo de evidencia candidata antes de seleccionar qué es relevante para la consulta. */
export interface ContextCandidates {
  items: IntelligenceItemWithDerived[];
  patterns: Pattern[];
  actors: Actor[];
}

export interface RelevantContextEntry {
  kind: "pattern" | "item" | "evidence" | "actor";
  id: number;
  relevance: number; // 0..1
  reason: string;
}

/**
 * Selección derivada del contexto completo -- nunca reemplaza la evidencia
 * canónica del Store, solo referencia qué parte de ella es relevante para
 * esta consulta concreta. Siempre reconstruible: "¿qué evidencia original
 * fue seleccionada?" se responde con los *Ids de aquí.
 */
export interface RelevantContext {
  patternIds: number[];
  itemIds: number[];
  evidenceIds: number[];
  actorIds: number[];
  entries: RelevantContextEntry[];
  totalCandidates: number;
  selectedCount: number;
  /** Nombre del optimizer que efectivamente produjo esta selección (puede ser el de fallback, ver withFallback). */
  optimizer: string;
}

export interface ContextOptimizer {
  readonly name: string;
  optimize(
    candidates: ContextCandidates,
    options?: ContextOptimizationOptions
  ): RelevantContext | Promise<RelevantContext>;
}

// ---------------------------------------------------------------------------
// Generation Provider (sección 16/17) -- síntesis/interpretación/explicación
// en lenguaje natural. Rol distinto de DecisionProvider (MI-4): éste nunca
// decide/clasifica/puntúa, solo redacta a partir de datos ya decididos.
// ---------------------------------------------------------------------------

export interface GenerationRequest {
  prompt: string;
  context?: unknown;
  options?: Record<string, unknown>;
}

export interface GenerationResult {
  text: string;
  model?: string | null;
  confidence?: number | null;
}

export interface GenerationProvider {
  readonly name: string;
  generate(request: GenerationRequest): GenerationResult | Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Insight content (sección 9): evidence -> finding -> interpretation ->
// recommendation, siempre separados, la recomendación siempre marcada.
// ---------------------------------------------------------------------------

export interface InsightEvidenceLayer {
  pattern_type: string | null;
  pattern_key: string | null;
  scope: string | null;
  item_support: number | null;
  actor_support: number | null;
  total_items_examined: number | null;
  frequency: number | null;
  first_seen_at: number | null;
  last_seen_at: number | null;
}

export interface InsightFindingLayer {
  frequency_pct: number | null;
  active_days: number | null;
  temporal_maturity: "recent" | "persistent" | null;
  statement: string;
}

export interface InsightInterpretationLayer {
  text: string;
  is_recommendation: false;
}

export interface InsightRecommendationLayer {
  text: string;
  is_recommendation: true;
}

export interface InsightContent {
  evidence: InsightEvidenceLayer;
  finding: InsightFindingLayer;
  interpretation: InsightInterpretationLayer;
  recommendation: InsightRecommendationLayer;
}

// ---------------------------------------------------------------------------
// Insight generation (sección 10/11)
// ---------------------------------------------------------------------------

export interface GenerateInsightsRequest {
  project_id: number;
  itemIds?: number[];
  query?: IntelligenceItemSearchFilter;
  minSupport?: number;
  contextOptimizer?: ContextOptimizer;
  contextOptions?: ContextOptimizationOptions;
  generationProvider?: GenerationProvider;
  force?: boolean;
}

export interface GenerateInsightsFromPatternsRequest {
  project_id: number;
  patternIds: number[];
  contextOptimizer?: ContextOptimizer;
  contextOptions?: ContextOptimizationOptions;
  generationProvider?: GenerationProvider;
  force?: boolean;
}

export type GenerateInsightsOutcome =
  | {
      status: "ok";
      insights: Insight[];
      relevantContext: RelevantContext;
      items: IntelligenceItemWithDerived[];
      patterns: Pattern[];
    }
  | { status: "insufficient_evidence"; reason: string; itemsExamined: number[] };

// ---------------------------------------------------------------------------
// Intelligence Brief (sección 12) y Creative Intelligence Contract (sección 13)
// -- estructuras puras, serializables, sin tabla propia (se construyen a
// partir de insights/patterns/relevantContext ya generados y persistidos).
// ---------------------------------------------------------------------------

export interface CompetitorLandscapeEntry {
  actor_id: number;
  display_name: string | null;
  handle: string | null;
  items_observed: number;
  pattern_ids: number[];
  first_seen_at: number | null;
  last_seen_at: number | null;
  has_performance_data: boolean;
}

export interface CreativeSignals {
  hooks: string[];
  angles: string[];
  ctas: string[];
  offers: string[];
  formats: string[];
}

export interface BriefProvenance {
  item_ids: number[];
  evidence_ids: number[];
  pattern_ids: number[];
  actor_ids: number[];
}

export interface IntelligenceBrief {
  objective: string;
  query: unknown;
  market_context: { market: string | null; language: string | null };
  observed_evidence: { total_items_examined: number; total_patterns: number; total_actors: number };
  key_findings: string[];
  patterns: Pattern[];
  insights: Insight[];
  competitor_landscape: CompetitorLandscapeEntry[];
  creative_signals: CreativeSignals;
  /** Siempre implicaciones potenciales, nunca hechos -- ver InsightRecommendationLayer. */
  opportunities: string[];
  constraints: string[];
  unanswered_questions: string[];
  context_optimization: { optimizer: string; selected_count: number; total_candidates: number };
  provenance: BriefProvenance;
  generated_at: number;
}

export interface CreativeIntelligenceBrief {
  campaign_context: unknown;
  target_problem: string | null;
  market_findings: string[];
  relevant_patterns: Pattern[];
  creative_signals: CreativeSignals;
  competitor_examples: CompetitorLandscapeEntry[];
  opportunities: string[];
  constraints: string[];
  evidence: { item_ids: number[]; evidence_ids: number[] };
  provenance: BriefProvenance;
}

export interface BuildBriefOptions {
  objective?: string;
  campaign_context?: unknown;
  target_problem?: string | null;
}
