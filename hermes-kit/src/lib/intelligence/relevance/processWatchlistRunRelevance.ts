// processWatchlistRunRelevance.ts — el punto de entrada práctico:
// WatchlistRunResult -> (buildChangeContext -> evaluateChangeRelevance ->
// recordRelevanceSignal) por cada cambio real, en un solo llamado.
//
//   Watchlist Runner -> WatchlistRunResult -> ESTE ARCHIVO -> Signals
//
// Ni Watchlist Runner ni el Scheduler importan esto -- es el caller
// (p.ej. un futuro orquestador, o el script de E2E) quien conecta
// runWatchlistRun()/runDueWatchlists() con esta capa, manteniendo el
// desacople exigido.
import { buildChangeContext } from "./buildChangeContext";
import { evaluateChangeRelevance } from "./relevanceEngine";
import { recordRelevanceSignal } from "./signalRecorder";
import type { DecisionProvider } from "../decision";
import type { WatchlistRunResult } from "../watchlist/types";
import type { RelevanceDecision } from "./types";
import type { Signal } from "../types";

export interface ProcessedChangeRelevance {
  itemId: number;
  decision: RelevanceDecision;
  signal: Signal | null;
}

/**
 * Procesa TODOS los cambios no-UNCHANGED de un WatchlistRunResult:
 * construye su ChangeContext, evalúa relevancia (JEV si se inyecta un
 * DecisionProvider, fallback determinista si no) y registra la signal
 * correspondiente (salvo IGNORE). UNCHANGED se omite por completo -- nunca
 * llega a generar una decisión ni una signal.
 */
export async function processWatchlistRunRelevance(
  runResult: WatchlistRunResult,
  decisionProvider: DecisionProvider | null
): Promise<ProcessedChangeRelevance[]> {
  const results: ProcessedChangeRelevance[] = [];

  for (const change of runResult.changes) {
    if (change.status === "UNCHANGED" || change.item_id === null) continue;

    const context = buildChangeContext(runResult, change);
    if (!context) continue; // item no localizable -- nunca se fabrica un contexto

    const decision = await evaluateChangeRelevance(context, decisionProvider);
    const signal = recordRelevanceSignal(context, decision);

    results.push({ itemId: change.item_id, decision, signal });
  }

  return results;
}
