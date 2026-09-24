// signals.ts — Trending topic, actividad de competidor, oportunidad
// creativa, crecimiento inusual, comportamiento repetido. Solo persistencia
// -- el motor de detección de señales no se implementa en MI-1.
import { getDb } from "./connection";
import type { Signal, SignalInput } from "./types";

export function createSignal(input: SignalInput): Signal {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO signals
        (project_id, item_id, actor_id, signal_type, title, description, strength, detected_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, unixepoch()), ?)`
    )
    .run(
      input.project_id,
      input.item_id ?? null,
      input.actor_id ?? null,
      input.signal_type,
      input.title,
      input.description ?? null,
      input.strength ?? null,
      input.detected_at ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null
    );
  return db
    .prepare<[number], Signal>("SELECT * FROM signals WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listSignalsByProject(projectId: number): Signal[] {
  return getDb()
    .prepare<[number], Signal>(
      "SELECT * FROM signals WHERE project_id = ? ORDER BY detected_at DESC"
    )
    .all(projectId);
}

export function listSignalsForItem(itemId: number): Signal[] {
  return getDb()
    .prepare<[number], Signal>(
      "SELECT * FROM signals WHERE item_id = ? ORDER BY detected_at DESC"
    )
    .all(itemId);
}
