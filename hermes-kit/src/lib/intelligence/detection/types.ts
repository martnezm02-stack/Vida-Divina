// types.ts — Contratos de MI-4 (Pattern & Intelligence Detection Layer).
//
// MULTIPLE INTELLIGENCE ITEMS -> MI-3 ANALYSIS -> FEATURE EXTRACTION ->
// SIGNALS -> PATTERN DETECTION -> PATTERN + SUPPORTING EVIDENCE.
//
// MI-4 nunca genera recomendaciones/briefs (eso es MI-5): solo hechos
// cuantificables (frecuencia, soporte, ventana temporal) y su evidencia.
import type { IntelligenceItemSearchFilter } from "../types";
import type { Pattern, Signal } from "../types";

export interface PatternDetectionRequest {
  project_id: number;
  itemIds?: number[];
  query?: IntelligenceItemSearchFilter;
  /** Mínimo de items que deben compartir un valor para considerarlo repetición (no una coincidencia aislada). Default 2. */
  minSupport?: number;
  detectCreative?: boolean; // default true
  detectPerformance?: boolean; // default true
  detectRelationships?: boolean; // default true
}

export interface PatternDetectionResult {
  patterns: Pattern[];
  signals: Signal[];
  relationshipsCreated: number;
  itemsExamined: number[];
}
