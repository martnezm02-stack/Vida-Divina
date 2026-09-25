// types.ts — Contratos del puente Signal -> MI-5 (Insights/Briefs).
//
// Principio: Signal ("esto merece atención") != Insight ("esto es lo que
// la evidencia permite concluir"). Este módulo NUNCA decide finding/
// interpretation/recommendation -- eso sigue siendo autoridad exclusiva
// de synthesis/insightService.ts (MI-5, sin tocar). Solo resuelve QUÉ
// evidencia real (vía signal_items) alimenta ese motor, y registra el
// vínculo Signal -> Insight resultante para trazabilidad.
import type { ContextOptimizationOptions, ContextOptimizer, GenerateInsightsOutcome, GenerationProvider } from "../synthesis";

export interface GenerateInsightsFromSignalsRequest {
  project_id: number;
  /** Una o más signals ya existentes (relevance/signalRecorder.ts u otras) -- su evidencia (signal_items) se une antes de alimentar MI-5. */
  signalIds: number[];
  minSupport?: number;
  contextOptimizer?: ContextOptimizer;
  contextOptions?: ContextOptimizationOptions;
  generationProvider?: GenerationProvider;
  force?: boolean;
}

export type GenerateInsightsFromSignalsOutcome = GenerateInsightsOutcome & {
  /** Las signals que se intentaron usar como origen -- presentes incluso en insufficient_evidence, nunca se pierde la trazabilidad del intento. */
  sourceSignalIds: number[];
};
