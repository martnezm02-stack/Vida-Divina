// overviewQueries.ts — Consultas de solo lectura para el Overview del AI
// Marketing Intelligence & Growth OS. NO reimplementa reglas de negocio:
// reutiliza repositories/types de MI-1..MI-5 tal cual (listSignalsByProject,
// listInsightsByProject, listPatternsByProject, listActorsByProject,
// searchIntelligenceItems, listAssetsForItem, getLatestMetrics) y solo
// agrega las pocas agregaciones (COUNT/GROUP BY temporal) que genuinamente
// no existían todavía. Nunca fabrica un dato: ausencia de evidencia real
// se refleja tal cual (arrays vacíos, null, "insufficient_evidence"),
// nunca con un placeholder numérico inventado.
import { getDb } from "../connection";
import { listActorsByProject } from "../actors";
import { listSignalsByProject } from "../signals";
import { listInsightsByProject } from "../insights";
import { listPatternsByProject } from "../patterns";
import { listAssetsForItem } from "../assets";
import { getLatestMetrics } from "../metrics";
import { listSources } from "../sources";
import { PREDICTION_ANALYSIS_TYPE, comparePredictionToActualForItem } from "../prediction";
import type { PerformancePredictionOutcome } from "../prediction";
import { getIntelligenceItemById, withActiveDays } from "../items";
import type {
  Actor,
  Insight,
  IntelligenceItemWithDerived,
  Pattern,
  Signal,
  Source,
} from "../types";

export interface OverviewFilters {
  projectId: number;
  /** Ventana en días para "actividad reciente" (KPIs, gráfica, señales/insights recientes). Sin filtro de negocio hardcodeado en otras capas -- este es el único punto que lo decide, con default explícito. */
  sinceDays?: number;
  sourceSlug?: string | null;
  market?: string | null;
}

const DEFAULT_SINCE_DAYS = 30;

function sinceTimestamp(sinceDays: number): number {
  return Math.floor(Date.now() / 1000) - sinceDays * 86400;
}

// --------------------------------------------------------------------------- KPIs
export interface OverviewKpis {
  intelligenceItems: number;
  actors: number;
  signals: number;
  insights: number;
  /** Los Intelligence Briefs son generados bajo demanda (buildIntelligenceBrief/generateBrief, MI-5) -- nunca se persisten en una tabla propia, así que no existe un conteo histórico real que mostrar. Se refleja tal cual (0, generatedOnDemand:true) en vez de fabricar un número. */
  intelligenceBriefsGeneratedOnDemand: true;
}

export function getOverviewKpis(projectId: number): OverviewKpis {
  const db = getDb();
  const itemsRow = db
    .prepare<[number], { count: number }>("SELECT COUNT(*) as count FROM intelligence_items WHERE project_id = ?")
    .get(projectId);

  return {
    intelligenceItems: itemsRow?.count ?? 0,
    actors: listActorsByProject(projectId).length,
    signals: listSignalsByProject(projectId).length,
    insights: listInsightsByProject(projectId).length,
    intelligenceBriefsGeneratedOnDemand: true,
  };
}

// --------------------------------------------------------------------------- Market activity (serie temporal real por fuente)
export interface MarketActivityPoint {
  date: string; // YYYY-MM-DD (UTC)
  sourceSlug: string;
  count: number;
}

/** Actividad real por día/fuente (nuevos intelligence_items, por first_seen_at) -- nunca una fuente ficticia: solo aparecen las fuentes que realmente tienen items en la ventana. */
export function getMarketActivity(projectId: number, sinceDays: number = DEFAULT_SINCE_DAYS): MarketActivityPoint[] {
  const db = getDb();
  const since = sinceTimestamp(sinceDays);
  const rows = db
    .prepare<[number, number], { date: string; source_id: number; count: number }>(
      `SELECT date(first_seen_at, 'unixepoch') as date, source_id, COUNT(*) as count
       FROM intelligence_items
       WHERE project_id = ? AND first_seen_at >= ?
       GROUP BY date, source_id
       ORDER BY date ASC`
    )
    .all(projectId, since);

  const sourcesById = new Map(listSources().map((s) => [s.id, s]));
  return rows.map((r) => ({
    date: r.date,
    sourceSlug: sourcesById.get(r.source_id)?.slug ?? `source-${r.source_id}`,
    count: r.count,
  }));
}

// --------------------------------------------------------------------------- Signals by relevance
export type RelevanceBucket = "HIGH" | "MEDIUM" | "LOW" | "IGNORE" | "OTHER";

export interface SignalsByRelevance {
  buckets: Record<RelevanceBucket, number>;
  total: number;
}

/**
 * Distribución REAL por categoría de RelevanceDecision (relevance/types.ts,
 * sin tocar) -- solo cuenta signals que de verdad pasaron por el Relevance
 * Engine (signal_type que empieza con RELEVANCE_ y trae metadata.relevance).
 * Señales de otro tipo (p.ej. HOOK_FREQUENCY de MI-4, que nunca tuvo una
 * decisión de relevancia) NUNCA se fuerzan dentro de esta distribución --
 * la semántica de RelevanceDecision no se reinterpreta aquí.
 */
export function getSignalsByRelevance(projectId: number): SignalsByRelevance {
  const signals = listSignalsByProject(projectId);
  const buckets: Record<RelevanceBucket, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, IGNORE: 0, OTHER: 0 };
  let total = 0;

  for (const signal of signals) {
    if (!signal.signal_type.startsWith("RELEVANCE_")) continue;
    if (!signal.metadata_json) continue;
    let relevance: string | undefined;
    try {
      relevance = (JSON.parse(signal.metadata_json) as { relevance?: string }).relevance;
    } catch {
      continue;
    }
    if (relevance === "HIGH" || relevance === "MEDIUM" || relevance === "LOW" || relevance === "IGNORE") {
      buckets[relevance]++;
    } else {
      buckets.OTHER++;
    }
    total++;
  }

  return { buckets, total };
}

// --------------------------------------------------------------------------- Source activity
export interface SourceActivityEntry {
  sourceSlug: string;
  sourceName: string;
  itemCount: number;
}

export function getSourceActivity(projectId: number): SourceActivityEntry[] {
  const db = getDb();
  const rows = db
    .prepare<[number], { source_id: number; count: number }>(
      "SELECT source_id, COUNT(*) as count FROM intelligence_items WHERE project_id = ? GROUP BY source_id ORDER BY count DESC"
    )
    .all(projectId);
  const sourcesById = new Map(listSources().map((s) => [s.id, s]));
  return rows.map((r) => {
    const source = sourcesById.get(r.source_id);
    return { sourceSlug: source?.slug ?? `source-${r.source_id}`, sourceName: source?.name ?? source?.slug ?? "Desconocida", itemCount: r.count };
  });
}

// --------------------------------------------------------------------------- Recent signals / insights / actors / patterns
export function getRecentSignals(projectId: number, limit = 8): Signal[] {
  return listSignalsByProject(projectId).slice(0, limit); // ya viene ORDER BY detected_at DESC
}

export function getRecentInsights(projectId: number, limit = 6): Insight[] {
  return listInsightsByProject(projectId).slice(0, limit); // ya viene ORDER BY created_at DESC
}

export interface ActiveActorEntry {
  actor: Actor;
  itemCount: number;
  signalCount: number;
  sourceSlug: string | null;
}

/** Actores observados recientemente, con actividad OBSERVABLE (items/signals reales) -- nunca un score competitivo inventado. */
export function getActiveActors(projectId: number, limit = 6): ActiveActorEntry[] {
  const db = getDb();
  const rows = db
    .prepare<[number, number], { actor_id: number; item_count: number; source_id: number | null }>(
      `SELECT actor_id, COUNT(*) as item_count, MAX(source_id) as source_id
       FROM intelligence_items
       WHERE project_id = ? AND actor_id IS NOT NULL
       GROUP BY actor_id
       ORDER BY item_count DESC
       LIMIT ?`
    )
    .all(projectId, limit);

  const actorsById = new Map(listActorsByProject(projectId).map((a) => [a.id, a]));
  const signals = listSignalsByProject(projectId);
  const sourcesById = new Map(listSources().map((s) => [s.id, s]));

  const entries: ActiveActorEntry[] = [];
  for (const row of rows) {
    const actor = actorsById.get(row.actor_id);
    if (!actor) continue;
    const signalCount = signals.filter((s) => s.actor_id === row.actor_id).length;
    entries.push({
      actor,
      itemCount: row.item_count,
      signalCount,
      sourceSlug: row.source_id !== null ? (sourcesById.get(row.source_id)?.slug ?? null) : null,
    });
  }
  return entries;
}

// --------------------------------------------------------------------------- Recent content
export interface RecentContentEntry {
  item: IntelligenceItemWithDerived;
  thumbnailUrl: string | null;
  metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null } | null;
  sourceSlug: string;
}

export function getRecentContent(projectId: number, limit = 8): RecentContentEntry[] {
  const db = getDb();
  const rows = db
    .prepare<[number, number], { id: number }>(
      "SELECT id FROM intelligence_items WHERE project_id = ? ORDER BY last_seen_at DESC LIMIT ?"
    )
    .all(projectId, limit);
  const sourcesById = new Map(listSources().map((s) => [s.id, s]));

  const entries: RecentContentEntry[] = [];
  for (const { id } of rows) {
    const item = getIntelligenceItemById(id);
    if (!item) continue;
    const withDerived = withActiveDays(item);
    const assets = listAssetsForItem(id);
    const thumbnail = assets.find((a) => a.kind === "thumbnail") ?? assets.find((a) => a.kind === "image");
    const latestMetrics = getLatestMetrics(id);
    entries.push({
      item: withDerived,
      thumbnailUrl: thumbnail?.url ?? null,
      metrics: latestMetrics
        ? { views: latestMetrics.views, likes: latestMetrics.likes, comments: latestMetrics.comments, shares: latestMetrics.shares }
        : null,
      sourceSlug: sourcesById.get(item.source_id)?.slug ?? `source-${item.source_id}`,
    });
  }
  return entries;
}

// --------------------------------------------------------------------------- Creative patterns
export interface CreativePatternEntry {
  pattern: Pattern;
  itemSupport: number | null;
  actorSupport: number | null;
}

export function getCreativePatterns(projectId: number, limit = 6): CreativePatternEntry[] {
  return listPatternsByProject(projectId)
    .filter((p) => p.pattern_type?.startsWith("creative_"))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, limit)
    .map((pattern) => ({ pattern, itemSupport: pattern.item_support, actorSupport: pattern.actor_support }));
}

// --------------------------------------------------------------------------- Performance & Predictions
export interface PredictionEntry {
  id: number;
  itemId: number;
  createdAt: number;
  status: "ok" | "insufficient_evidence";
  metric?: string;
  predictedValue?: number;
  confidence?: number;
  matchedFields?: string[];
  actual?: number;
  relativeError?: number | null;
}

/**
 * Registros reales de ai_analyses (analysis_type="performance_prediction",
 * ver prediction/predictionRecord.ts, sin tocar) para items de este
 * proyecto -- ninguna tabla nueva, ninguna predicción fabricada. Cuando el
 * item aún no tiene performance real observada, actual queda undefined
 * (nunca inventado) -- eso mismo produce el estado "insuficiente" en la UI.
 */
export function getPerformancePredictions(projectId: number, limit = 6): PredictionEntry[] {
  const db = getDb();
  const rows = db
    .prepare<[number, string, number], { id: number; item_id: number; result_json: string; created_at: number }>(
      `SELECT a.id, a.item_id, a.result_json, a.created_at
       FROM ai_analyses a
       JOIN intelligence_items i ON i.id = a.item_id
       WHERE i.project_id = ? AND a.analysis_type = ?
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .all(projectId, PREDICTION_ANALYSIS_TYPE, limit);

  return rows.map((row) => {
    const outcome = JSON.parse(row.result_json) as PerformancePredictionOutcome;

    if (outcome.status !== "ok") {
      return { id: row.id, itemId: row.item_id, createdAt: row.created_at, status: "insufficient_evidence" as const };
    }
    const prediction = outcome.predictions[0];

    // predicted vs actual: reutiliza comparePredictionToActualForItem
    // (prediction/predictionRecord.ts) tal cual, sin reimplementar el
    // cálculo de "actual" aquí -- [] cuando el item aún no tiene
    // performance real observada (nunca se inventa un actual).
    const comparisons = comparePredictionToActualForItem(row.item_id);
    const comparison = comparisons.find((c) => c.metric === prediction?.metric);

    return {
      id: row.id,
      itemId: row.item_id,
      createdAt: row.created_at,
      status: "ok" as const,
      metric: prediction?.metric,
      predictedValue: prediction?.value,
      confidence: outcome.confidence,
      matchedFields: prediction?.basis,
      actual: comparison?.actual,
      relativeError: comparison?.relative_error ?? undefined,
    };
  });
}

export interface OverviewData {
  kpis: OverviewKpis;
  marketActivity: MarketActivityPoint[];
  signalsByRelevance: SignalsByRelevance;
  sourceActivity: SourceActivityEntry[];
  recentSignals: Signal[];
  recentInsights: Insight[];
  activeActors: ActiveActorEntry[];
  recentContent: RecentContentEntry[];
  creativePatterns: CreativePatternEntry[];
  performancePredictions: PredictionEntry[];
  sources: Source[];
}

export function getOverviewData(filters: OverviewFilters): OverviewData {
  const sinceDays = filters.sinceDays ?? DEFAULT_SINCE_DAYS;
  return {
    kpis: getOverviewKpis(filters.projectId),
    marketActivity: getMarketActivity(filters.projectId, sinceDays),
    signalsByRelevance: getSignalsByRelevance(filters.projectId),
    sourceActivity: getSourceActivity(filters.projectId),
    recentSignals: getRecentSignals(filters.projectId),
    recentInsights: getRecentInsights(filters.projectId),
    activeActors: getActiveActors(filters.projectId),
    recentContent: getRecentContent(filters.projectId),
    creativePatterns: getCreativePatterns(filters.projectId),
    performancePredictions: getPerformancePredictions(filters.projectId),
    sources: listSources(),
  };
}
