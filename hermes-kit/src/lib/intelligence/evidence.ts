// evidence.ts — Frames, thumbnails, fragmentos de transcript, URLs y
// referencias de fuente que respaldan una observación sobre un item.
import { getDb } from "./connection";
import type { Evidence, EvidenceInput } from "./types";

export function addEvidence(input: EvidenceInput): Evidence {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO evidence (item_id, kind, content, url, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.item_id,
      input.kind,
      input.content ?? null,
      input.url ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null
    );
  return db
    .prepare<[number], Evidence>("SELECT * FROM evidence WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listEvidenceForItem(itemId: number): Evidence[] {
  return getDb()
    .prepare<[number], Evidence>(
      "SELECT * FROM evidence WHERE item_id = ? ORDER BY created_at ASC"
    )
    .all(itemId);
}
