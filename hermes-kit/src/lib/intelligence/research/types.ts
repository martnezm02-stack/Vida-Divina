// types.ts — Contratos del orquestador Research Query (query→brief).
//
// Encadena, en este orden, capacidades YA existentes de MI-1..MI-5:
// query → retrieval (MI-1) → [ingesta MI-2, solo si hace falta] →
// analysis (MI-3) → patterns (MI-4, vía MI-5) → insights (MI-5) → brief
// (MI-5). No reimplementa ninguna de esas capas -- solo las secuencia.
import type { SourceAdapter } from "../ingestion";
import type { AnalysisProvider, AnalysisRunWithItems } from "../analysis";
import type { ContextOptimizationOptions, ContextOptimizer, GenerationProvider, IntelligenceBrief } from "../synthesis";
import type { IntelligenceItemSearchFilter } from "../types";

/** Datos crudos de una fuente externa a ingerir SOLO si la evidencia existente resulta insuficiente/obsoleta. */
export interface ResearchIngestInput<TRaw = unknown> {
  adapter: SourceAdapter<TRaw>;
  raw: TRaw;
}

export interface ResearchQueryRequest {
  /** Slug del proyecto/workspace (se resuelve/crea, igual que en el resto de MI-1..MI-5). */
  project: string;
  /** Sin project_id: lo resuelve/inyecta este orquestador a partir de `project` -- el caller nunca necesita conocer el id numérico. */
  query: Omit<IntelligenceItemSearchFilter, "project_id">;

  /** Umbral de suficiencia: mínimo de items que debe haber ya en el Store para considerar la evidencia suficiente. Default 2 (mismo mínimo que MI-4 usa para "repetición"). */
  minItems?: number;
  /** Si se define, la evidencia más reciente (last_seen_at) debe estar dentro de esta ventana (segundos) para considerarse "fresca". Ausente = no se exige freshness. */
  freshnessWindowSeconds?: number;
  /** Datos crudos a ingerir (MI-2) -- solo se usan si la evidencia existente es insuficiente/obsoleta. Nunca se ingieren si ya hay evidencia suficiente. */
  ingest?: ResearchIngestInput[];

  /** MI-3: análisis explícito sobre los items resueltos antes de detectar patrones. Default: creativeAnalysisProvider / 'creative_summary'. */
  analysisProvider?: AnalysisProvider;
  analysisType?: string;

  /** MI-4/MI-5, pasados tal cual a generateBrief. */
  minSupport?: number;
  contextOptimizer?: ContextOptimizer;
  contextOptions?: ContextOptimizationOptions;
  generationProvider?: GenerationProvider;
  objective?: string;
  market?: string | null;
  language?: string | null;
  campaign_context?: unknown;
  target_problem?: string | null;
  force?: boolean;
}

export interface RetrievalSummary {
  itemsFoundBeforeIngestion: number;
  itemsIngested: number;
  itemsAfterIngestion: number;
  mostRecentLastSeenAt: number | null;
  /** true si nunca hizo falta ingerir nada -- la evidencia existente ya alcanzaba (requisito 4: reutilizar primero). */
  usedExistingEvidenceOnly: boolean;
}

export type ResearchOutcome =
  | {
      status: "ok";
      brief: IntelligenceBrief;
      analysisRuns: AnalysisRunWithItems[];
      retrieval: RetrievalSummary;
    }
  | {
      status: "insufficient_evidence";
      reason: string;
      itemsExamined: number[];
      retrieval: RetrievalSummary;
    }
  | {
      /** No hay suficiente evidencia y no se proveyó nada para ingerir -- Hermes debe solicitar nueva ingesta (no es responsabilidad de este orquestador conseguirla: nunca hace de crawler). */
      status: "needs_ingestion";
      reason: string;
      retrieval: RetrievalSummary;
    };
