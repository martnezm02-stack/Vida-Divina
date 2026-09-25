// predictionRecord.ts — Vincula PerformancePredictor con MI-1: guarda una
// prediction como evidencia histórica INMUTABLE antes de conocer el
// resultado real, y permite compararla después contra el rendimiento real
// observado -- sin modificar jamás la prediction original.
//
// Reutiliza ai_analyses (MI-1, ya existente vía saveAiAnalysis/
// listAiAnalysesForItem) -- ninguna tabla nueva. ai_analyses solo expone
// save/list (nunca update/delete, ver aiAnalysis.ts), así que una fila
// guardada aquí es, por construcción, imposible de mutar retrospectivamente
// -- exactamente el contrato que este módulo necesita, sin código extra.
import { saveAiAnalysis, listAiAnalysesForItem } from "../aiAnalysis";
import { getIntelligenceItemById, withActiveDays } from "../items";
import { performanceAnalysisProvider } from "../analysis";
import type { AiAnalysis } from "../types";
import type { PerformancePredictionOutcome } from "./types";

export const PREDICTION_ANALYSIS_TYPE = "performance_prediction" as const;

/** Registra el resultado de PerformancePredictor.predict() como evidencia inmutable, ANTES de conocer el rendimiento real del item. */
export function savePredictionRecord(
  itemId: number,
  predictorName: string,
  outcome: PerformancePredictionOutcome
): AiAnalysis {
  return saveAiAnalysis({
    item_id: itemId,
    analysis_type: PREDICTION_ANALYSIS_TYPE,
    model: predictorName,
    result: outcome,
  });
}

/** Todas las predictions guardadas para un item, en orden cronológico -- nunca se sobrescriben entre sí. */
export function listPredictionRecordsForItem(itemId: number): AiAnalysis[] {
  return listAiAnalysesForItem(itemId, PREDICTION_ANALYSIS_TYPE);
}

/**
 * La prediction más reciente guardada para un item (o null si nunca se
 * guardó ninguna) -- localización automática por identidad del CONTENIDO
 * (el item.id, que persiste igual antes y después de publicarse gracias a
 * la continuidad de upsert por external_id en publishedContentAdapter),
 * sin que el caller necesite ya tener en mano el registro exacto de
 * ai_analyses. Filtra por predictorName cuando varios predictors coexisten.
 */
export function findLatestPredictionForItem(itemId: number, predictorName?: string): AiAnalysis | null {
  const records = listPredictionRecordsForItem(itemId);
  const filtered = predictorName ? records.filter((r) => r.model === predictorName) : records;
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1];
}

export interface PredictionVsActual {
  metric: string;
  predicted: number;
  actual: number;
  delta: number;
  /** null si predicted=0 (división inválida) -- nunca se fuerza un número. */
  relative_error: number | null;
  prediction_record_id: number;
  predicted_at: number;
}

/**
 * Compara una prediction YA GUARDADA (inmutable, leída tal cual se guardó)
 * contra el rendimiento REAL actual del item, derivado con
 * performanceAnalysisProvider (MI-3, reutilizado sin cambios). Resultado
 * siempre derivado de nuevo en cada llamada -- nunca persiste ni modifica
 * la prediction original. Sin métrica real observada todavía para un
 * elemento predicho, ese elemento simplemente no se compara (nunca se
 * inventa un "actual").
 */
export function comparePredictionToActual(predictionRecord: AiAnalysis, itemId: number): PredictionVsActual[] {
  const item = getIntelligenceItemById(itemId);
  if (!item) return [];

  const outcome = JSON.parse(predictionRecord.result_json) as PerformancePredictionOutcome;
  if (outcome.status !== "ok") return []; // nada que comparar contra una insufficient_evidence

  const perfOutput = performanceAnalysisProvider.analyze([withActiveDays(item)], {
    project_id: item.project_id,
    analysisType: "performance_delta",
  }) as { observed: { items: Record<number, { engagement_rate?: number } | null> } };

  const actualByMetric: Record<string, number> = {};
  const rate = perfOutput.observed.items[itemId]?.engagement_rate;
  if (typeof rate === "number") actualByMetric.engagement_rate = rate;

  const comparisons: PredictionVsActual[] = [];
  for (const prediction of outcome.predictions) {
    const actual = actualByMetric[prediction.metric];
    if (typeof actual !== "number") continue; // sin dato real usable todavía -- no se compara, nunca se inventa
    const delta = actual - prediction.value;
    comparisons.push({
      metric: prediction.metric,
      predicted: prediction.value,
      actual,
      delta,
      relative_error: prediction.value !== 0 ? delta / prediction.value : null,
      prediction_record_id: predictionRecord.id,
      predicted_at: predictionRecord.created_at,
    });
  }
  return comparisons;
}

/**
 * Igual que comparePredictionToActual(), pero localiza la prediction
 * automáticamente a partir del contenido (itemId) en vez de exigir que el
 * caller ya tenga el AiAnalysis en mano -- el caso real de "llegó
 * performance nueva para este item, ¿tenía una prediction previa?". []
 * cuando el item nunca tuvo una prediction guardada (nunca se inventa una).
 */
export function comparePredictionToActualForItem(itemId: number, predictorName?: string): PredictionVsActual[] {
  const record = findLatestPredictionForItem(itemId, predictorName);
  if (!record) return [];
  return comparePredictionToActual(record, itemId);
}
