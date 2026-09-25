// watchlistRunner.ts — runWatchlistRun(): equivalente al
// runWatchlist(watchlistId, rawItems, adapter) pedido.
//
//   SOURCE RUNTIME (ya existente, fuera de este archivo)
//     -> raw data
//     -> WATCHLIST RUNNER (este archivo)
//     -> SOURCE ADAPTER (ya existente, sin tocar)
//     -> INGESTION SERVICE (ya existente, sin tocar)
//     -> INTELLIGENCE STORE
//
// Este runner NUNCA hace HTTP/scraping/MCP -- recibe rawItems ya
// adquiridos por un bridge/source runtime existente (p.ej.
// tiktokMonidBridge.ts). Tampoco escribe SQL directamente ni en
// intelligence_items ni en ningún lado: decide QUÉ cambió (changeDetection.ts,
// puro) y delega SIEMPRE en ingestCanonicalItem (MI-2) para normalizar y
// persistir -- exactamente la misma función que research/ y los bridges ya
// usan, nunca una segunda vía de escritura.
import { getOrCreateSource } from "../sources";
import { getProjectById } from "../projects";
import { getIntelligenceItemByExternalId } from "../items";
import { getLatestMetrics } from "../metrics";
import { ingestCanonicalItem, normalizeSourceSlug } from "../ingestion";
import { getWatchlistById, touchWatchlistLastChecked } from "../watchlists";
import { classifyChange } from "./changeDetection";
import type { WatchlistRunInput, WatchlistRunResult } from "./types";

export async function runWatchlistRun<TRaw>(input: WatchlistRunInput<TRaw>): Promise<WatchlistRunResult> {
  const watchlist = getWatchlistById(input.watchlistId);
  if (!watchlist) {
    throw new Error(`runWatchlistRun: watchlist ${input.watchlistId} no existe.`);
  }
  const project = getProjectById(watchlist.project_id);
  if (!project) {
    throw new Error(`runWatchlistRun: la watchlist ${input.watchlistId} referencia un project_id inexistente.`);
  }
  if (input.adapter.source !== input.source) {
    throw new Error(
      `runWatchlistRun: source "${input.source}" no coincide con adapter.source "${input.adapter.source}".`
    );
  }
  const sourceRow = getOrCreateSource(normalizeSourceSlug(input.source));

  const result: WatchlistRunResult = {
    watchlistId: watchlist.id,
    checkedAt: 0,
    discovered: input.rawItems.length,
    newItems: [],
    updatedItems: [],
    metricChanges: [],
    unchangedItems: [],
    ingestedItems: [],
    provenance: { source: input.source, rawItemsReceived: input.rawItems.length },
  };

  for (const raw of input.rawItems) {
    const canonical = input.adapter.normalize(raw, { project: project.slug });
    const externalId = canonical.external_id ?? null;
    const existing = externalId ? getIntelligenceItemByExternalId(project.id, sourceRow.id, externalId) : null;
    const latestMetrics = existing ? getLatestMetrics(existing.id) : null;

    const status = classifyChange(canonical, existing, latestMetrics);

    if (status === "UNCHANGED") {
      // Nunca se re-ingiere: ni intelligence_items ni item_metrics se
      // tocan -- exactamente lo que exige la idempotencia (run 2 = 0 NEW).
      result.unchangedItems.push(existing!.id);
      continue;
    }

    // NEW / UPDATED / METRICS_CHANGED: el watcher NUNCA escribe -- delega
    // en el ingestion layer ya existente, que ya es idempotente por
    // (project_id, source_id, external_id) y append-only para métricas.
    const { item } = ingestCanonicalItem(canonical);

    if (status === "NEW") result.newItems.push(item.id);
    else if (status === "UPDATED") result.updatedItems.push(item.id);
    else result.metricChanges.push(item.id);

    result.ingestedItems.push(item.id);
  }

  const updated = touchWatchlistLastChecked(watchlist.id);
  result.checkedAt = updated.last_checked_at as number;

  return result;
}
