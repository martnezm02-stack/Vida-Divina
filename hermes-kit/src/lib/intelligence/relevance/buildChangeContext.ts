// buildChangeContext.ts — WatchlistRunResult + WatchlistItemResult ->
// ChangeContext mínimo y compacto. Consulta el Store SOLO lo necesario
// para ESTE item (item.id, su actor, su historial de métricas reciente,
// la watchlist) -- nunca el Store completo, nunca todo el historial de un
// actor, nunca el raw source payload (que ni siquiera llega hasta aquí).
import { getIntelligenceItemById } from "../items";
import { getActorById } from "../actors";
import { getProjectById } from "../projects";
import { listMetricsHistory } from "../metrics";
import { getWatchlistById } from "../watchlists";
import type { WatchlistItemResult, WatchlistRunResult } from "../watchlist/types";
import type { ChangeContext, RelevanceMetricDelta } from "./types";

const METRIC_FIELDS = ["views", "likes", "comments", "shares", "engagement", "reach"] as const;
const DESCRIPTION_SNIPPET_MAX_CHARS = 200;

function buildMetricsDelta(
  oldSnapshot: { [K in (typeof METRIC_FIELDS)[number]]: number | null } | undefined,
  newSnapshot: { [K in (typeof METRIC_FIELDS)[number]]: number | null }
): Partial<Record<(typeof METRIC_FIELDS)[number], RelevanceMetricDelta>> | undefined {
  if (!oldSnapshot) return undefined; // sin snapshot anterior real -- nunca se inventa un "antes"
  const delta: Partial<Record<(typeof METRIC_FIELDS)[number], RelevanceMetricDelta>> = {};
  for (const field of METRIC_FIELDS) {
    const oldValue = oldSnapshot[field];
    const newValue = newSnapshot[field];
    if (oldValue === null || newValue === null) continue; // uno de los dos ausente -- no se compara, nunca se sustituye por 0
    if (oldValue === newValue) continue; // sin cambio en este campo específico -- no aporta evidencia
    delta[field] = {
      old: oldValue,
      new: newValue,
      delta: newValue - oldValue,
      percent: oldValue !== 0 ? (newValue - oldValue) / oldValue : null, // división por 0 evitada -- nunca un porcentaje sin sentido matemático
    };
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}

/**
 * Construye el ChangeContext para UN item de un WatchlistRunResult ya
 * producido por runWatchlistRun(). Devuelve null cuando el item no puede
 * localizarse (nunca fabrica un contexto para un item inexistente) o
 * cuando itemChange.item_id es null (p.ej. UNCHANGED representado sin
 * ingesta -- igual tiene item_id en la práctica, pero el tipo lo permite).
 */
export function buildChangeContext(
  runResult: WatchlistRunResult,
  itemChange: WatchlistItemResult
): ChangeContext | null {
  if (itemChange.item_id === null) return null;
  const item = getIntelligenceItemById(itemChange.item_id);
  if (!item) return null;
  const project = getProjectById(item.project_id);
  if (!project) return null;

  const actor = item.actor_id ? getActorById(item.actor_id) : null;
  const watchlist = getWatchlistById(runResult.watchlistId);

  const history = listMetricsHistory(item.id);
  const latest = history[history.length - 1];
  const previous = history.length >= 2 ? history[history.length - 2] : undefined;

  const description = item.description ?? null;
  const descriptionSnippet =
    description && description.length > DESCRIPTION_SNIPPET_MAX_CHARS
      ? `${description.slice(0, DESCRIPTION_SNIPPET_MAX_CHARS)}…`
      : description;

  return {
    change_type: itemChange.status,
    project: { id: project.id, slug: project.slug },
    source: runResult.provenance.source,
    actor: actor
      ? { external_id: actor.external_id, handle: actor.handle, display_name: actor.display_name }
      : null,
    item: { id: item.id, external_id: item.external_id, canonical_url: item.canonical_url },
    content: {
      hook: item.hook,
      angle: item.angle,
      cta: item.cta,
      offer: item.offer,
      format: item.format,
      description_snippet: descriptionSnippet,
    },
    ...(itemChange.updated_fields && itemChange.updated_fields.length > 0
      ? { updated_fields: itemChange.updated_fields }
      : {}),
    metrics_observed: latest
      ? {
          views: latest.views,
          likes: latest.likes,
          comments: latest.comments,
          shares: latest.shares,
          engagement: latest.engagement,
          reach: latest.reach,
        }
      : null,
    ...(itemChange.status === "METRICS_CHANGED" && latest
      ? { metrics_delta: buildMetricsDelta(previous, latest) }
      : {}),
    watchlist: watchlist ? { id: watchlist.id, name: watchlist.name, watchlist_type: watchlist.watchlist_type } : null,
    provenance: { watchlistId: runResult.watchlistId, runCheckedAt: runResult.checkedAt },
  };
}
