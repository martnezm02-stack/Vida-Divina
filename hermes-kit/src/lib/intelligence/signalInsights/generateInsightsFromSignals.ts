// generateInsightsFromSignals.ts — SIGNALS -> EVIDENCE (signal_items) ->
// EXISTING MI-5 INSIGHT ENGINE (generateInsights, sin tocar).
//
// No reimplementa detección de patrones ni redacción de insights: resuelve
// los intelligence_items reales vinculados a las signals dadas (vía
// listItemsForSignal, MI-4, ya existente) y delega el resto por completo
// en generateInsights() -- que YA reutiliza/upsertea patterns existentes
// (detectPatterns, MI-4) y YA devuelve insufficient_evidence cuando
// corresponde. Este archivo solo resuelve evidencia y registra
// trazabilidad Signal -> Insight después del hecho -- nunca antes,
// nunca en lugar de la lógica de MI-5.
//
// La rationale/description de una signal NUNCA se pasa a generateInsights
// ni a ningún GenerationProvider: es una decisión de relevancia (JEV o
// fallback), no evidencia primaria. La evidencia primaria es siempre
// intelligence_items/item_metrics/patterns, vía MI-1..MI-4.
import { getDb } from "../connection";
import { listItemsForSignal } from "../detection";
import { generateInsights } from "../synthesis";
import type { Insight } from "../types";
import type { GenerateInsightsFromSignalsOutcome, GenerateInsightsFromSignalsRequest } from "./types";

/**
 * Anota metadata_json.source_signal_ids en el insight (unión, idempotente
 * -- agregar la misma signal dos veces no produce duplicados dentro del
 * array). Reutiliza el campo metadata_json que insightService.ts YA usa
 * para {pattern_type, pattern_key} -- ninguna tabla ni columna nueva,
 * ningún segundo mecanismo de provenance: solo se enriquece el mismo
 * metadata_json con la trazabilidad Signal -> Insight. Nunca toca
 * version/input_hash/content_json -- la autoridad de versionado sigue
 * siendo insightService.ts.
 */
function linkSignalsToInsight(insightId: number, signalIds: number[]): Insight {
  const db = getDb();
  const row = db.prepare<[number], Insight>("SELECT * FROM insights WHERE id = ?").get(insightId)!;
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  const existing: number[] = Array.isArray(metadata.source_signal_ids) ? metadata.source_signal_ids : [];
  const merged = [...new Set([...existing, ...signalIds])].sort((a, b) => a - b);
  if (merged.length === existing.length && merged.every((id, i) => id === existing[i])) return row; // sin cambios reales -- no reescribe innecesariamente
  metadata.source_signal_ids = merged;
  db.prepare("UPDATE insights SET metadata_json = ? WHERE id = ?").run(JSON.stringify(metadata), insightId);
  return { ...row, metadata_json: JSON.stringify(metadata) };
}

export function getInsightSourceSignalIds(insight: Insight): number[] {
  if (!insight.metadata_json) return [];
  const metadata = JSON.parse(insight.metadata_json);
  return Array.isArray(metadata.source_signal_ids) ? metadata.source_signal_ids : [];
}

/**
 * SIGNALS -> EVIDENCE -> EXISTING MI-5 INSIGHT ENGINE. Une los
 * intelligence_items reales vinculados (signal_items) a TODAS las signals
 * dadas y delega en generateInsights() sin modificarlo. insufficient_evidence
 * es first-class: se propaga tal cual cuando no hay evidencia suficiente,
 * nunca se rellena con una inferencia.
 */
export async function generateInsightsFromSignals(
  request: GenerateInsightsFromSignalsRequest
): Promise<GenerateInsightsFromSignalsOutcome> {
  const itemIds = new Set<number>();
  for (const signalId of request.signalIds) {
    for (const itemId of listItemsForSignal(signalId)) itemIds.add(itemId);
  }

  if (itemIds.size === 0) {
    return {
      status: "insufficient_evidence",
      reason: "Ninguna de las signals dadas tiene evidencia vinculada (signal_items) -- nunca se infiere evidencia inexistente.",
      itemsExamined: [],
      sourceSignalIds: request.signalIds,
    };
  }

  const outcome = await generateInsights({
    project_id: request.project_id,
    itemIds: [...itemIds],
    minSupport: request.minSupport,
    contextOptimizer: request.contextOptimizer,
    contextOptions: request.contextOptions,
    generationProvider: request.generationProvider,
    force: request.force,
  });

  if (outcome.status === "ok") {
    const linkedInsights = outcome.insights.map((insight) => linkSignalsToInsight(insight.id, request.signalIds));
    return { ...outcome, insights: linkedInsights, sourceSignalIds: request.signalIds };
  }

  return { ...outcome, sourceSignalIds: request.signalIds };
}
