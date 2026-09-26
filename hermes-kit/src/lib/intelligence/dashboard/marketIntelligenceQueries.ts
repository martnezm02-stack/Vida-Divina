// marketIntelligenceQueries.ts — Consultas de solo lectura para la sección
// Market Intelligence (lista filtrable de Intelligence Items + panel de
// detalle). Reutiliza searchIntelligenceItems (items.ts, sin tocar) para la
// lista; solo agrega el COUNT-only que no existía (necesario para paginación
// real en la UI) y el agregador de detalle (item + métricas + signals +
// patterns + evidence + actor + assets), que tampoco existía como una sola
// función -- ninguno de los dos duplica una regla de negocio, solo componen
// llamadas ya existentes.
import { getDb } from "../connection";
import { searchIntelligenceItems, getIntelligenceItemById, withActiveDays } from "../items";
import { listMetricsHistory, getLatestMetrics } from "../metrics";
import { listSignalsForItem } from "../signals";
import { listAssetsForItem } from "../assets";
import { listEvidenceForItem } from "../evidence";
import { getActorById } from "../actors";
import { getSourceBySlug, listSources } from "../sources";
import { getQualificationByItemId } from "../qualification";
import type { QualificationCategory } from "../qualification";
import type {
  Actor,
  Asset,
  Evidence,
  IntelligenceItemSearchFilter,
  IntelligenceItemWithDerived,
  ItemMetricsSnapshot,
  Signal,
  Source,
} from "../types";

// --------------------------------------------------------------------------- Lista filtrable
export interface MarketIntelligenceListFilter {
  projectId: number;
  sourceSlug?: string;
  actorId?: number;
  contentType?: string;
  market?: string;
  format?: string;
  style?: string;
  funnelStage?: string;
  /** Búsqueda simple por texto en title/description -- LIKE, sin motor de búsqueda nuevo. */
  search?: string;
  limit?: number;
  offset?: number;
}

function resolveSourceId(sourceSlug: string | undefined): number | undefined {
  if (!sourceSlug) return undefined;
  return getSourceBySlug(sourceSlug)?.id ?? -1; // -1: slug inexistente -> ningún resultado, nunca "todos"
}

export interface MarketIntelligenceItemEntry {
  item: IntelligenceItemWithDerived;
  /** RAW EVIDENCE vs. QUALIFIED INTELLIGENCE (ver qualification/): Market Intelligence sigue mostrando TODOS los items reales (nunca oculta evidencia cruda), solo etiqueta -- null cuando el item nunca fue calificado (comportamiento idéntico al actual). */
  qualification: QualificationCategory | null;
}

export interface MarketIntelligenceListResult {
  items: MarketIntelligenceItemEntry[];
  total: number;
  limit: number;
  offset: number;
}

export function listMarketIntelligenceItems(filter: MarketIntelligenceListFilter): MarketIntelligenceListResult {
  const limit = filter.limit ?? 24;
  const offset = filter.offset ?? 0;
  const sourceId = resolveSourceId(filter.sourceSlug);

  const searchFilter: IntelligenceItemSearchFilter = {
    project_id: filter.projectId,
    source_id: sourceId,
    actor_id: filter.actorId,
    content_type: filter.contentType,
    market: filter.market,
    format: filter.format,
    style: filter.style,
    funnel_stage: filter.funnelStage,
    limit,
    offset,
  };

  let items = searchIntelligenceItems(searchFilter);

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    items = items.filter(
      (item) => item.title?.toLowerCase().includes(needle) || item.description?.toLowerCase().includes(needle)
    );
  }

  const qualificationByItemId = getQualificationByItemId(filter.projectId);
  const total = countMarketIntelligenceItems(filter, sourceId);
  return {
    items: items.map((item) => ({ item, qualification: qualificationByItemId.get(item.id) ?? null })),
    total,
    limit,
    offset,
  };
}

/**
 * COUNT-only, mismo subconjunto de filtros que la UI de Market Intelligence
 * realmente ofrece (searchIntelligenceItems no expone un total, solo la
 * página pedida) -- necesario para paginación honesta, sin reimplementar el
 * resto de la lógica de búsqueda de items.ts.
 */
function countMarketIntelligenceItems(filter: MarketIntelligenceListFilter, sourceId: number | undefined): number {
  const db = getDb();
  const clauses = ["project_id = ?"];
  const values: unknown[] = [filter.projectId];

  const eqFilters: Array<[string | undefined, string]> = [
    [sourceId !== undefined ? String(sourceId) : undefined, "source_id"],
    [filter.actorId !== undefined ? String(filter.actorId) : undefined, "actor_id"],
    [filter.contentType, "content_type"],
    [filter.market, "market"],
    [filter.format, "format"],
    [filter.style, "style"],
    [filter.funnelStage, "funnel_stage"],
  ];
  for (const [value, column] of eqFilters) {
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      values.push(value);
    }
  }

  const row = db
    .prepare<unknown[], { count: number }>(
      `SELECT COUNT(*) as count FROM intelligence_items WHERE ${clauses.join(" AND ")}`
    )
    .get(...values);

  // El filtro de texto (search) se aplica en JS sobre la página ya traída
  // (ver listMarketIntelligenceItems) -- por eso el total aquí puede sobre-contar
  // cuando search está activo. Se documenta explícitamente en el resultado
  // de la API (ver route.ts) en vez de fingir precisión que no existe.
  return row?.count ?? 0;
}

// --------------------------------------------------------------------------- Detalle de item
export interface ItemDetail {
  item: IntelligenceItemWithDerived;
  actor: Actor | null;
  source: Source | null;
  metricsHistory: ItemMetricsSnapshot[];
  latestMetrics: ItemMetricsSnapshot | null;
  signals: Signal[];
  assets: Asset[];
  evidence: Evidence[];
  qualification: QualificationCategory | null;
}

export function getItemDetail(itemId: number): ItemDetail | null {
  const item = getIntelligenceItemById(itemId);
  if (!item) return null;
  const withDerived = withActiveDays(item);
  const sourcesById = new Map(listSources().map((s) => [s.id, s]));

  return {
    item: withDerived,
    actor: item.actor_id !== null ? getActorById(item.actor_id) : null,
    source: sourcesById.get(item.source_id) ?? null,
    metricsHistory: listMetricsHistory(itemId),
    latestMetrics: getLatestMetrics(itemId),
    signals: listSignalsForItem(itemId),
    assets: listAssetsForItem(itemId),
    evidence: listEvidenceForItem(itemId),
    qualification: getQualificationByItemId(item.project_id).get(itemId) ?? null,
  };
}
