// types.ts — Contratos de Performance Predictor.
//
// CREATIVE + CONTEXT + HISTORICAL EVIDENCE -> PerformancePredictor ->
// PREDICTION + CONFIDENCE + EVIDENCE + EXPLANATION.
//
// No es MI-3 (AnalysisProvider procesa un conjunto de items YA existentes
// y devuelve observed/inferred sobre ellos) ni MI-4 (Pattern Detection
// encuentra repetición dentro de un conjunto consultado) ni DecisionProvider
// (clasifica/puntúa/elige entre opciones dadas) -- es una abstracción
// distinta porque el problema es distinto: estimar una señal de
// rendimiento para UNA creatividad (existente o hipotética, aún sin
// ingerir) a partir de evidencia histórica de OTRAS creatividades
// similares. Reutiliza MI-1 (métricas), MI-3 (performanceAnalysisProvider
// para derivar engagement_rate) y MI-4 (groupByField/CREATIVE_FIELDS para
// encontrar similares) -- no reimplementa ninguna.
import type { CreativeField } from "../detection";

export type PredictionElementField = CreativeField; // hook | angle | cta | offer | format | problem | promise | mechanism

export interface PerformancePredictionCandidate {
  source_id?: number | null;
  content_type?: string | null;
  format?: string | null;
  hook?: string | null;
  angle?: string | null;
  problem?: string | null;
  promise?: string | null;
  mechanism?: string | null;
  offer?: string | null;
  cta?: string | null;
}

export interface PerformancePredictionRequest {
  project_id: number;
  /** Item ya existente en el Store -- se excluye de su propia evidencia histórica (nunca se predice un item a partir de sí mismo). */
  itemId?: number;
  /** Creatividad hipotética aún no ingerida (alternativa a itemId). Cualquier elemento ausente reduce la evidencia disponible, nunca produce una clasificación artificial. */
  candidate?: PerformancePredictionCandidate;
  market?: string | null;
  /** Mínimo de items históricos con métricas observadas usables para considerar la evidencia suficiente. Default 2 (misma convención que minSupport en MI-4/evidenceAssessment). */
  minEvidence?: number;
}

export interface PerformancePredictionValue {
  /** Siempre derivado de métricas realmente observadas (MI-1) -- nunca CTR/conversiones/impresiones/spend inventados. */
  metric: string;
  value: number;
  /** De qué elemento(s) creativo(s) compartido(s) salió la evidencia que sustenta este valor. */
  basis: PredictionElementField[];
}

export interface PerformancePredictionEvidence {
  /** Items históricos con métricas usables realmente incluidos en el cálculo. */
  item_ids: number[];
  metric_snapshots_used: number;
  matched_fields: PredictionElementField[];
  source_ids: number[];
}

export type PerformancePredictionOutcome =
  | {
      status: "ok";
      predictions: PerformancePredictionValue[];
      /** 0..1 -- SOLO suficiencia + consistencia de la evidencia usada, nunca "calidad" de la creatividad. */
      confidence: number;
      evidence: PerformancePredictionEvidence;
      explanation: string;
    }
  | {
      status: "insufficient_evidence";
      reason: string;
      /** Lo que sí se encontró (aunque no alcance el mínimo) -- transparencia, nunca se oculta. */
      evidence: PerformancePredictionEvidence;
    };

/**
 * Abstracción vendor/modelo-agnóstica: una primera implementación
 * determinista basada en similitud histórica (ver
 * historicalSimilarityPerformancePredictor) es tan válida como una futura
 * implementación estadística/ML -- ambas implementan exactamente esta forma.
 */
export interface PerformancePredictor {
  readonly name: string;
  predict(
    request: PerformancePredictionRequest
  ): PerformancePredictionOutcome | Promise<PerformancePredictionOutcome>;
}
