// watchlists.ts — Keywords, competidores, creadores, marcas, temas, cuentas
// a vigilar. Solo persistencia -- el scheduler/motor de vigilancia no se
// implementa en MI-1.
import { getDb } from "./connection";
import type { Watchlist, WatchlistEntry } from "./types";

export function createWatchlist(
  projectId: number,
  name: string,
  watchlistType: string
): Watchlist {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO watchlists (project_id, name, watchlist_type) VALUES (?, ?, ?)")
    .run(projectId, name, watchlistType);
  return db
    .prepare<[number], Watchlist>("SELECT * FROM watchlists WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listWatchlistsByProject(projectId: number): Watchlist[] {
  return getDb()
    .prepare<[number], Watchlist>(
      "SELECT * FROM watchlists WHERE project_id = ? ORDER BY created_at ASC"
    )
    .all(projectId);
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
