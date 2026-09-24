// actors.ts — Anunciante / marca / creador / cuenta / publisher.
import { getDb } from "./connection";
import type { Actor, ActorInput } from "./types";

/**
 * Crea o actualiza un actor. Idempotente por (project_id, source_id,
 * external_id) cuando external_id viene informado -- si ya existe, hace
 * merge de los campos no nulos recibidos y actualiza updated_at.
 */
export function upsertActor(input: ActorInput): Actor {
  const db = getDb();
  const metadataJson = input.metadata !== undefined ? JSON.stringify(input.metadata) : null;

  if (input.external_id) {
    const existing = db
      .prepare<[number, number | null, string], Actor>(
        `SELECT * FROM actors WHERE project_id = ? AND source_id IS ? AND external_id = ?`
      )
      .get(input.project_id, input.source_id ?? null, input.external_id);

    if (existing) {
      db.prepare(
        `UPDATE actors SET
          handle = COALESCE(?, handle),
          display_name = COALESCE(?, display_name),
          type = COALESCE(?, type),
          url = COALESCE(?, url),
          metadata_json = COALESCE(?, metadata_json),
          updated_at = unixepoch()
        WHERE id = ?`
      ).run(
        input.handle ?? null,
        input.display_name ?? null,
        input.type ?? null,
        input.url ?? null,
        metadataJson,
        existing.id
      );
      return getActorById(existing.id)!;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO actors
        (project_id, source_id, external_id, handle, display_name, type, url, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.project_id,
      input.source_id ?? null,
      input.external_id ?? null,
      input.handle ?? null,
      input.display_name ?? null,
      input.type ?? null,
      input.url ?? null,
      metadataJson
    );
  return getActorById(info.lastInsertRowid as number)!;
}

export function getActorById(id: number): Actor | null {
  return (
    getDb().prepare<[number], Actor>("SELECT * FROM actors WHERE id = ?").get(id) ?? null
  );
}

export function listActorsByProject(projectId: number): Actor[] {
  return getDb()
    .prepare<[number], Actor>(
      "SELECT * FROM actors WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(projectId);
}
