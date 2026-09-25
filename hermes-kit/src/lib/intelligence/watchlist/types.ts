// types.ts — Contratos de Watchlists + Change Detection (Continuous
// Intelligence, fase de infraestructura). No agrega ningún concepto de
// negocio nuevo -- clasifica evidencia YA definida por MI-1/MI-2
// (intelligence_items, item_metrics) frente a datos crudos recién
// obtenidos por un source runtime ya existente.
import type { SourceAdapter } from "../ingestion";

/**
 * Los cuatro estados deterministas exigidos. Nunca "important"/"relevant"
 * -- esa decisión es de JEV/analysis en una capa posterior, no de aquí.
 */
export type ChangeStatus = "NEW" | "UPDATED" | "METRICS_CHANGED" | "UNCHANGED";

export interface WatchlistItemResult {
  status: ChangeStatus;
  /** external_id del item crudo (tal como lo entregó el adapter), para trazabilidad aunque no se haya podido ingerir. */
  external_id: string | null;
  /** id real en intelligence_items -- presente salvo que la ingesta fallara para un item NEW/UPDATED/METRICS_CHANGED. */
  item_id: number | null;
}

export interface WatchlistRunInput<TRaw = unknown> {
  watchlistId: number;
  /** Debe coincidir con adapter.source -- mismo criterio que ResearchIngestInput. */
  source: string;
  adapter: SourceAdapter<TRaw>;
  /** Datos crudos YA obtenidos por un source runtime/bridge existente -- este runner nunca los adquiere por sí mismo. */
  rawItems: TRaw[];
}

export interface WatchlistRunResult {
  watchlistId: number;
  checkedAt: number;
  discovered: number;
  newItems: number[];
  updatedItems: number[];
  metricChanges: number[];
  unchangedItems: number[];
  /** = newItems + updatedItems + metricChanges, en el orden en que se procesaron -- los únicos que pasaron por ingestionService. */
  ingestedItems: number[];
  provenance: {
    source: string;
    rawItemsReceived: number;
  };
}
