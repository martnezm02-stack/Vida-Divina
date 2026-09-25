// processWatchlistSignals.ts — orquestador de alto nivel:
//
//   Scheduler
//     ↓
//   Watchlist Runner            (sin tocar, no importa esto)
//     ↓
//   WatchlistRunResult
//     ↓
//   Change Detection            (sin tocar)
//     ↓
//   Relevance                   (relevance/, reutilizado tal cual)
//     ↓
//   Signals                     (MI-1, vía relevance/signalRecorder.ts)
//     ↓
//   generateInsightsFromSignals (este módulo)
//     ↓
//   MI-5 (generateInsights, sin tocar)
//     ↓
//   Insight / Brief opcional (buildIntelligenceBrief, sin tocar)
//
// Vive en un nivel por ENCIMA de Watchlist Runner y Scheduler -- ninguno
// de los dos importa esto ni nada de relevance/synthesis (verificado por
// grep+typecheck, ver el reporte final). La composición ocurre aquí.
import { getWatchlistById } from "../watchlists";
import { processWatchlistRunRelevance } from "../relevance";
import type { DecisionProvider } from "../decision";
import type { WatchlistRunResult } from "../watchlist/types";
import type { ProcessedChangeRelevance } from "../relevance";
import { generateInsightsFromSignals } from "./generateInsightsFromSignals";
import type { GenerateInsightsFromSignalsOutcome } from "./types";
import { buildIntelligenceBrief } from "../synthesis";
import type { BriefQueryContext, BuildBriefOptions, ContextOptimizationOptions, ContextOptimizer, GenerationProvider, IntelligenceBrief } from "../synthesis";

export interface ProcessWatchlistSignalsOptions {
  /** Inyectado a Relevance -- null para saltar directo al fallback determinista (ver relevance/relevanceEngine.ts). */
  decisionProvider: DecisionProvider | null;
  minSupport?: number;
  contextOptimizer?: ContextOptimizer;
  contextOptions?: ContextOptimizationOptions;
  generationProvider?: GenerationProvider;
  force?: boolean;
  /** Si además de insights se debe intentar ensamblar un IntelligenceBrief (buildIntelligenceBrief, sin tocar). Default false: no todo watchlist run necesita un brief. */
  buildBrief?: boolean;
  briefOptions?: BuildBriefOptions & { market?: string | null; language?: string | null; objective?: string };
}

export interface ProcessWatchlistSignalsResult {
  runResult: WatchlistRunResult;
  relevance: ProcessedChangeRelevance[];
  insights: GenerateInsightsFromSignalsOutcome;
  brief?: { status: "ok"; brief: IntelligenceBrief } | { status: "insufficient_evidence"; reason: string };
}

/**
 * Watchlist Run -> Signals -> Insights -> Brief opcional, en un solo
 * llamado, sin acoplar Watchlist Runner ni Scheduler a JEV/MI-5. Si
 * ninguna signal se generó (todo UNCHANGED o todo IGNORE), insights queda
 * insufficient_evidence de forma honesta -- nunca se fabrica evidencia.
 */
export async function processWatchlistSignals(
  runResult: WatchlistRunResult,
  options: ProcessWatchlistSignalsOptions
): Promise<ProcessWatchlistSignalsResult> {
  const watchlist = getWatchlistById(runResult.watchlistId);
  if (!watchlist) {
    throw new Error(`processWatchlistSignals: watchlist ${runResult.watchlistId} no existe.`);
  }

  const relevance = await processWatchlistRunRelevance(runResult, options.decisionProvider);
  const signalIds = relevance
    .map((r) => r.signal?.id)
    .filter((id): id is number => id !== undefined && id !== null);

  if (signalIds.length === 0) {
    return {
      runResult,
      relevance,
      insights: {
        status: "insufficient_evidence",
        reason: "Ningún cambio de este run produjo una signal (UNCHANGED o IGNORE) -- nada que alimentar hacia insights.",
        itemsExamined: [],
        sourceSignalIds: [],
      },
    };
  }

  const insights = await generateInsightsFromSignals({
    project_id: watchlist.project_id,
    signalIds,
    minSupport: options.minSupport,
    contextOptimizer: options.contextOptimizer,
    contextOptions: options.contextOptions,
    generationProvider: options.generationProvider,
    force: options.force,
  });

  const result: ProcessWatchlistSignalsResult = { runResult, relevance, insights };

  if (options.buildBrief) {
    if (insights.status === "ok") {
      const queryContext: BriefQueryContext = {
        query: { watchlistId: runResult.watchlistId, signalIds },
        market: options.briefOptions?.market ?? null,
        language: options.briefOptions?.language ?? null,
      };
      result.brief = { status: "ok", brief: buildIntelligenceBrief(insights, queryContext, options.briefOptions ?? {}) };
    } else {
      result.brief = { status: "insufficient_evidence", reason: insights.reason };
    }
  }

  return result;
}
