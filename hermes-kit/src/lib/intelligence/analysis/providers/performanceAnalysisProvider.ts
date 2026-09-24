// performanceAnalysisProvider.ts — Métricas derivadas, deterministas, a
// partir de los snapshots ya guardados por MI-1 (item_metrics).
//
// Regla dura: nunca se calcula un derivado si falta el dato necesario --
// una ausencia nunca se convierte en 0. Cada campo derivado se omite
// (queda ausente en el resultado) si su insumo no está disponible.
import { listMetricsHistory } from "../../metrics";
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../types";
import type { IntelligenceItemWithDerived } from "../../types";

const DELTA_FIELDS = ["views", "likes", "comments", "shares", "reach"] as const;

function computeItemPerformance(itemId: number): Record<string, unknown> | null {
  const history = listMetricsHistory(itemId);
  if (history.length === 0) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const latest: Record<string, unknown> = {
    views: last.views,
    likes: last.likes,
    comments: last.comments,
    shares: last.shares,
    reach: last.reach,
    captured_at: last.captured_at,
  };

  const deltas: Record<string, { delta: number; pct_change: number | null }> = {};
  const elapsedSeconds = last.captured_at - first.captured_at;
  const velocity: Record<string, number> = {};

  if (history.length > 1) {
    for (const field of DELTA_FIELDS) {
      const a = first[field];
      const b = last[field];
      if (a === null || b === null || a === undefined || b === undefined) continue; // no se calcula sin ambos extremos
      const delta = b - a;
      deltas[field] = { delta, pct_change: a !== 0 ? delta / a : null };
      if (elapsedSeconds > 0) {
        velocity[field] = delta / (elapsedSeconds / 86400); // unidades por día
      }
    }
  }

  let engagementRate: number | null = null;
  if (
    last.views !== null &&
    last.views !== undefined &&
    last.views > 0 &&
    last.likes !== null &&
    last.comments !== null &&
    last.shares !== null
  ) {
    engagementRate = (last.likes + last.comments + last.shares) / last.views;
  }

  return {
    latest,
    snapshots_count: history.length,
    ...(Object.keys(deltas).length > 0 ? { deltas } : {}),
    ...(Object.keys(velocity).length > 0 ? { velocity_per_day: velocity } : {}),
    ...(engagementRate !== null ? { engagement_rate: engagementRate } : {}),
  };
}

export const performanceAnalysisProvider: AnalysisProvider = {
  name: "deterministic-performance",

  analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): AnalysisProviderOutput {
    const perItem: Record<number, unknown> = {};
    const viewsByItem: Array<{ item_id: number; views: number }> = [];

    for (const item of items) {
      const performance = computeItemPerformance(item.id);
      perItem[item.id] = performance;

      const latestViews = (performance?.latest as Record<string, unknown> | undefined)?.views;
      if (typeof latestViews === "number") {
        viewsByItem.push({ item_id: item.id, views: latestViews });
      }
    }

    // Rendimiento relativo dentro del conjunto consultado: solo entre los
    // items que sí tienen views conocidas -- nunca se rankea con datos
    // ausentes.
    let ranking: Array<{ item_id: number; rank: number; views: number }> | undefined;
    if (viewsByItem.length > 1) {
      ranking = [...viewsByItem]
        .sort((a, b) => b.views - a.views)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    }

    return {
      observed: {
        items: perItem,
        ...(ranking ? { relative_ranking: ranking } : {}),
      },
    };
  },
};
