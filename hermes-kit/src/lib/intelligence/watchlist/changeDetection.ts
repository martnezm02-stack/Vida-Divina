// changeDetection.ts — Clasificación determinista NEW/UPDATED/
// METRICS_CHANGED/UNCHANGED. Puro: recibe el CanonicalIntelligenceItem ya
// producido por un SourceAdapter existente + lo que YA hay en el
// Intelligence Store para ese mismo (project, source, external_id), y
// decide -- nunca escribe nada, nunca llama a ingestionService, nunca usa
// JEV/LLM. Reutiliza exactamente los identificadores canónicos de MI-1
// (project_id/source_id/external_id/canonical_url/item.id/metric
// snapshots) -- no crea ningún índice ni estado propios para esto.
import { normalizeContentType, normalizeUrl } from "../ingestion";
import type { CanonicalIntelligenceItem } from "../ingestion";
import type { IntelligenceItem, ItemMetricsSnapshot } from "../types";
import type { ChangeStatus } from "./types";

/**
 * Campos de "metadata/copy relevante" -- los mismos que intelligence_items
 * ya almacena (ver items.ts UPDATABLE_COLUMNS) y que un SourceAdapter
 * puede entregar en un re-fetch. Ausente en el nuevo raw (`undefined`)
 * nunca cuenta como cambio -- solo un valor SI informado que difiere del
 * ya guardado. tags/assets/evidence quedan fuera a propósito: no tienen
 * una columna 1:1 comparable en intelligence_items (viven en tablas
 * relacionadas) y compararlas sería reimplementar su propia lógica de
 * upsert -- fuera del alcance de un detector de cambios determinista.
 */
const CONTENT_FIELDS = [
  "title",
  "description",
  "canonical_url",
  "content_type",
  "media_type",
  "format",
  "language",
  "market",
  "hook",
  "angle",
  "cta",
  "offer",
] as const;

const METRIC_FIELDS = ["views", "likes", "comments", "shares", "reach"] as const;

/**
 * ingestionService.ts normaliza canonical_url (normalizeUrl) y content_type
 * (normalizeContentType) ANTES de guardarlos -- ver upsertIntelligenceItem()
 * en ingestionService.ts. Sin aplicar la misma transformación aquí, el
 * valor crudo del adapter (p.ej. content_type:"reel") nunca coincidiría con
 * el valor ya normalizado en el Store (content_type:"video"), marcando
 * UPDATED en cada run aunque nada haya cambiado de verdad. El resto de
 * campos se guarda tal cual (`?? null`, sin transformación), así que se
 * comparan directamente.
 */
function normalizeForComparison(field: (typeof CONTENT_FIELDS)[number], value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (field === "canonical_url") return normalizeUrl(value as string);
  if (field === "content_type") return normalizeContentType(value as string);
  return value;
}

function contentChanged(canonical: CanonicalIntelligenceItem, existing: IntelligenceItem): boolean {
  for (const field of CONTENT_FIELDS) {
    const incoming = canonical[field];
    if (incoming === undefined) continue; // la fuente no lo entregó esta vez -- nunca se asume cambio
    const normalizedIncoming = normalizeForComparison(field, incoming) ?? null;
    const stored = (existing as unknown as Record<string, unknown>)[field] ?? null;
    if (normalizedIncoming !== stored) return true;
  }
  return false;
}

function metricsChanged(
  canonicalMetrics: CanonicalIntelligenceItem["metrics"],
  latestSnapshot: ItemMetricsSnapshot | null
): boolean {
  if (!canonicalMetrics) return false; // este raw no trajo métricas -- nada que evaluar
  if (!latestSnapshot) return true; // primera observación de métricas para un item que ya existía -- SÍ es una novedad (definición 3)
  for (const field of METRIC_FIELDS) {
    const incoming = canonicalMetrics[field];
    if (incoming === undefined || incoming === null) continue; // no informado esta vez -- no se compara
    if (incoming !== (latestSnapshot[field] ?? null)) return true;
  }
  return false;
}

/**
 * Clasifica un item recién normalizado frente al estado YA existente en el
 * Store (o su ausencia). `existing`/`latestMetrics` deben resolverse por
 * el caller vía las funciones de MI-1 ya existentes
 * (getIntelligenceItemByExternalId/getLatestMetrics) -- este archivo no
 * hace ninguna consulta propia.
 */
export function classifyChange(
  canonical: CanonicalIntelligenceItem,
  existing: IntelligenceItem | null,
  latestMetrics: ItemMetricsSnapshot | null
): ChangeStatus {
  if (!existing) return "NEW";
  if (contentChanged(canonical, existing)) return "UPDATED";
  if (metricsChanged(canonical.metrics, latestMetrics)) return "METRICS_CHANGED";
  return "UNCHANGED";
}
