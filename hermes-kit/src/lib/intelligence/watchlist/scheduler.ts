// scheduler.ts — "¿cuándo debe ejecutarse una watchlist?", nada más.
//
// Separación de responsabilidades (literal, cada capa vive en su propio
// archivo/módulo, ninguna conoce la de al lado más allá de su contrato):
//   SCHEDULER (este archivo)     "¿cuándo?"
//   ACQUISITION (inyectado por el caller, p.ej. bridges/tiktokMonidBridge.ts)
//                                "¿de dónde obtengo los datos?"
//   WATCHLIST RUNNER (watchlistRunner.ts, sin tocar)  "¿qué cambió?"
//   INGESTION (ingestionService.ts, sin tocar)        "¿cómo normalizo/persisto?"
//
// Este archivo NUNCA importa un bridge, un adapter concreto, Monid, fetch,
// ni JEV -- la adquisición la decide el caller vía la función `acquire`
// que le pasa a runDueWatchlists(). Reutiliza el contrato YA existente de
// multi-source (AvailableSource/UnavailableSource, research/multiSource.ts)
// para "fuente disponible / no disponible", en vez de inventar uno nuevo.
//
// Query-driven, igual que el resto de MI-1..MI-5: getDueWatchlists()/
// runDueWatchlists() solo corren cuando algo externo los llama -- ningún
// loop de cron/timer vive aquí.
import { getDb } from "../connection";
import { getWatchlistById, listWatchlistEntries } from "../watchlists";
import { runWatchlistRun } from "./watchlistRunner";
import type { Watchlist, WatchlistEntry, WatchlistFrequency } from "../types";
import type { AvailableSource, UnavailableSource } from "../research/multiSource";
import type { WatchlistRunResult } from "./types";

/** hourly/daily/weekly -- sin expresiones cron complejas por ahora (ver Watchlist.frequency). */
const FREQUENCY_SECONDS: Record<WatchlistFrequency, number> = {
  hourly: 3600,
  daily: 86400,
  weekly: 604800,
};

export interface DueWatchlist {
  watchlist: Watchlist;
  entries: WatchlistEntry[];
}

export interface GetDueWatchlistsOptions {
  /** Restringe a un solo proyecto/workspace -- ausente = todos los proyectos (uso real: un scheduler que recorre todo el Store). */
  projectId?: number;
}

/**
 * Todas las watchlists (de uno o todos los proyectos) que están enabled,
 * tienen una frequency configurada, y a las que les toca ejecutarse en
 * `now` (segundos unix). Deriva "próxima ejecución" de last_checked_at +
 * frequencySeconds -- nunca guarda un next_due_at separado que pudiera
 * desincronizarse. frequency NULL = nunca due por sí sola (política sin
 * configurar todavía, ver createWatchlist()/setWatchlistSchedule()).
 */
export function getDueWatchlists(
  now: number = Math.floor(Date.now() / 1000),
  options: GetDueWatchlistsOptions = {}
): DueWatchlist[] {
  const db = getDb();
  const rows =
    options.projectId !== undefined
      ? db
          .prepare<[number], { id: number }>(
            "SELECT id FROM watchlists WHERE enabled = 1 AND frequency IS NOT NULL AND project_id = ?"
          )
          .all(options.projectId)
      : db
          .prepare<[], { id: number }>(
            "SELECT id FROM watchlists WHERE enabled = 1 AND frequency IS NOT NULL"
          )
          .all();

  const due: DueWatchlist[] = [];
  for (const row of rows) {
    // getWatchlistById reutiliza el mapeo de tipos (enabled -> boolean) ya existente,
    // en vez de duplicar aquí la conversión de la fila cruda.
    const watchlist = getWatchlistById(row.id);
    if (!watchlist || !watchlist.frequency) continue;
    const intervalSeconds = FREQUENCY_SECONDS[watchlist.frequency];
    const isDue = watchlist.last_checked_at === null || watchlist.last_checked_at + intervalSeconds <= now;
    if (isDue) {
      due.push({ watchlist, entries: listWatchlistEntries(watchlist.id) });
    }
  }
  return due;
}

/** Contrato de adquisición: mismo shape que multi-source (research/multiSource.ts) -- "disponible" o "no disponible", nunca se fabrica evidencia en su lugar. */
export type WatchlistAcquisitionOutcome<TRaw = unknown> = AvailableSource<TRaw> | UnavailableSource;

function isUnavailable(outcome: WatchlistAcquisitionOutcome): outcome is UnavailableSource {
  return (outcome as UnavailableSource).unavailable === true;
}

/**
 * Inyectado por el caller (nunca implementado aquí): dado que watchlist Y
 * SUS entries, obtiene los rawItems desde el source runtime/bridge que
 * corresponda (Monid, ScrapeCreators, lo que sea). El scheduler no sabe ni
 * le importa cómo -- solo consume el resultado.
 */
export type WatchlistAcquireFn = (
  watchlist: Watchlist,
  entries: WatchlistEntry[]
) => Promise<WatchlistAcquisitionOutcome>;

export type WatchlistSchedulerStatus = "RAN" | "UNAVAILABLE" | "FAILED";

export interface WatchlistSchedulerOutcome {
  watchlistId: number;
  status: WatchlistSchedulerStatus;
  /** Presente solo cuando status === "RAN". */
  runResult?: WatchlistRunResult;
  /** Presente en UNAVAILABLE/FAILED -- información suficiente para diagnosticar/reintentar, nunca se descarta. */
  reason?: string;
}

/**
 * Ejecuta runWatchlistRun() para cada watchlist due en `now`, usando
 * `acquire` para obtener sus rawItems. Nunca inventa rawItems ni fabrica
 * una ejecución exitosa:
 *   - acquire() devuelve {unavailable:true, reason} -> status UNAVAILABLE,
 *     nunca se llama a runWatchlistRun, last_checked_at NUNCA se toca
 *     (la watchlist sigue due -- reintentable sin ningún estado extra).
 *   - acquire() o runWatchlistRun() lanzan -> status FAILED, mismo
 *     principio: last_checked_at intacto, reintentable, nada se duplica
 *     porque nada llegó a ingerirse.
 *   - éxito -> status RAN, runResult tal cual lo devuelve runWatchlistRun
 *     (que ya actualiza last_checked_at internamente -- la protección
 *     contra doble ejecución es ese mismo estado persistido, no memoria
 *     de proceso: una segunda pasada del scheduler inmediatamente después
 *     ya no encuentra esta watchlist due).
 */
export async function runDueWatchlists(
  acquire: WatchlistAcquireFn,
  now: number = Math.floor(Date.now() / 1000),
  options: GetDueWatchlistsOptions = {}
): Promise<WatchlistSchedulerOutcome[]> {
  const due = getDueWatchlists(now, options);
  const outcomes: WatchlistSchedulerOutcome[] = [];

  for (const { watchlist, entries } of due) {
    let acquisition: WatchlistAcquisitionOutcome;
    try {
      acquisition = await acquire(watchlist, entries);
    } catch (err) {
      outcomes.push({
        watchlistId: watchlist.id,
        status: "FAILED",
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (isUnavailable(acquisition)) {
      outcomes.push({ watchlistId: watchlist.id, status: "UNAVAILABLE", reason: acquisition.reason });
      continue;
    }

    try {
      const runResult = await runWatchlistRun({
        watchlistId: watchlist.id,
        source: acquisition.name,
        adapter: acquisition.adapter,
        rawItems: acquisition.raw,
        checkedAt: now,
      });
      outcomes.push({ watchlistId: watchlist.id, status: "RAN", runResult });
    } catch (err) {
      outcomes.push({
        watchlistId: watchlist.id,
        status: "FAILED",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return outcomes;
}
