// watchlists.ts — Keywords, competidores, creadores, marcas, temas, cuentas
// a vigilar, + política mínima de scheduling (enabled/frequency). El
// motor que decide CUÁNDO ejecutar vive en watchlist/scheduler.ts -- este
// archivo sigue siendo solo persistencia.
import { getDb } from "./connection";
import type { Watchlist, WatchlistEntry, WatchlistFrequency } from "./types";

/** enabled se guarda como INTEGER (0/1, SQLite no tiene boolean nativo) -- se convierte aquí para que el tipo TS sea honesto (=== true funciona de verdad). */
function mapWatchlistRow(row: Omit<Watchlist, "enabled"> & { enabled: number }): Watchlist {
  return { ...row, enabled: row.enabled !== 0 };
}

export function createWatchlist(
  projectId: number,
  name: string,
  watchlistType: string,
  options: { enabled?: boolean; frequency?: WatchlistFrequency | null } = {}
): Watchlist {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO watchlists (project_id, name, watchlist_type, enabled, frequency) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      projectId,
      name,
      watchlistType,
      options.enabled === false ? 0 : 1,
      options.frequency ?? null
    );
  return getWatchlistById(info.lastInsertRowid as number)!;
}

export function listWatchlistsByProject(projectId: number): Watchlist[] {
  const rows = getDb()
    .prepare<[number], Omit<Watchlist, "enabled"> & { enabled: number }>(
      "SELECT * FROM watchlists WHERE project_id = ? ORDER BY created_at ASC"
    )
    .all(projectId);
  return rows.map(mapWatchlistRow);
}

export function getWatchlistById(id: number): Watchlist | null {
  const row = getDb()
    .prepare<[number], Omit<Watchlist, "enabled"> & { enabled: number }>(
      "SELECT * FROM watchlists WHERE id = ?"
    )
    .get(id);
  return row ? mapWatchlistRow(row) : null;
}

/** Marca cuándo corrió por última vez un run EXITOSO sobre esta watchlist -- único estado propio que watchlists necesita (ver schema.ts). Un fallo/unavailable NUNCA debe llamar a esto (ver scheduler.ts). */
export function touchWatchlistLastChecked(id: number, checkedAt?: number): Watchlist {
  const db = getDb();
  db.prepare("UPDATE watchlists SET last_checked_at = COALESCE(?, unixepoch()) WHERE id = ?").run(
    checkedAt ?? null,
    id
  );
  return getWatchlistById(id)!;
}

/** Cambia la política de scheduling de una watchlist ya existente. */
export function setWatchlistSchedule(
  id: number,
  options: { enabled?: boolean; frequency?: WatchlistFrequency | null }
): Watchlist {
  const db = getDb();
  db.prepare(
    `UPDATE watchlists SET
      enabled = COALESCE(?, enabled),
      frequency = CASE WHEN ? THEN ? ELSE frequency END
    WHERE id = ?`
  ).run(
    options.enabled === undefined ? null : options.enabled ? 1 : 0,
    options.frequency === undefined ? 0 : 1,
    options.frequency === undefined ? null : options.frequency,
    id
  );
  return getWatchlistById(id)!;
}

export function addWatchlistEntry(
  watchlistId: number,
  value: string,
  kind?: string
): WatchlistEntry {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO watchlist_entries (watchlist_id, value, kind) VALUES (?, ?, ?)")
    .run(watchlistId, value, kind ?? null);
  return db
    .prepare<[number], WatchlistEntry>("SELECT * FROM watchlist_entries WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listWatchlistEntries(watchlistId: number): WatchlistEntry[] {
  return getDb()
    .prepare<[number], WatchlistEntry>(
      "SELECT * FROM watchlist_entries WHERE watchlist_id = ? ORDER BY created_at ASC"
    )
    .all(watchlistId);
}
