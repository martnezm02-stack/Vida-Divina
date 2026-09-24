// types.ts — Contratos de MI-3 (Analysis & Enrichment Layer).
//
// OBSERVED DATA ≠ ENRICHMENT/ANALYSIS ≠ PATTERN ≠ INSIGHT. MI-3 solo
// produce lo primero y lo segundo (sobre items/conjuntos concretos ya
// existentes) -- patterns/insights son MI-4/MI-5.
import type { IntelligenceItemSearchFilter, IntelligenceItemWithDerived } from "../types";

export interface AnalysisRequest {
  project_id: number;
  /** Set concreto de items a analizar. Alternativa a `query`. */
  itemIds?: number[];
  /** Resuelve el conjunto de items vía búsqueda existente (searchIntelligenceItems). Alternativa a `itemIds`. */
  query?: IntelligenceItemSearchFilter;
  analysisType: string;
  /** Contexto opcional de campaña/cliente -- libre, nunca interpretado aquí. */
  context?: unknown;
  language?: string | null;
  market?: string | null;
  options?: Record<string, unknown>;
  /** Ignora un análisis cacheado válido y fuerza una nueva versión. */
  force?: boolean;
}

/**
 * Lo que devuelve un provider. `observed` son hechos (datos ya guardados o
 * recombinados deterministamente a partir de ellos, p.ej. un delta entre
 * snapshots) -- `inferred` es juicio/interpretación de un modelo. Nunca se
 * mezclan en la misma clave.
 */
export interface AnalysisProviderOutput {
  observed?: Record<string, unknown>;
  inferred?: Record<string, unknown>;
  confidence?: number | null;
  model?: string | null;
  /** IDs de filas de `evidence` (MI-1) que respaldan este análisis, si aplica. */
  evidenceIds?: number[];
}

/**
 * Interfaz desacoplada de cualquier proveedor de IA concreto. Un provider
 * determinista (sin LLM) es tan válido como uno respaldado por un modelo --
 * ambos implementan exactamente esta forma.
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(
    items: IntelligenceItemWithDerived[],
    request: AnalysisRequest
  ): AnalysisProviderOutput | Promise<AnalysisProviderOutput>;
}

export interface AnalysisRun {
  id: number;
  project_id: number;
  analysis_type: string;
  provider: string;
  model: string | null;
  confidence: number | null;
  items_key: string;
  input_hash: string;
  version: number;
  context_json: string | null;
  result_json: string;
  created_at: number;
}

export interface AnalysisRunWithItems extends AnalysisRun {
  item_ids: number[];
}

export interface AnalyzeResult {
  run: AnalysisRunWithItems;
  /** true si se reutilizó un análisis previo válido en vez de ejecutar el provider de nuevo. */
  cached: boolean;
}
