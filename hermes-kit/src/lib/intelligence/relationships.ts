// relationships.ts — Grafo item-a-item: contenido relacionado, anuncios
// similares, misma campaña, mismo patrón. La relación por actor/fuente ya
// existe vía FK directa en intelligence_items -- esto es solo el grafo
// explícito entre items.
import { getDb } from "./connection";
import type { ItemRelationship } from "./types";

export function createRelationship(
  itemId: number,
  relatedItemId: number,
  relationType: string,
  metadata?: unknown
): ItemRelationship {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO item_relationships (item_id, related_item_id, relation_type, metadata_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(itemId, relatedItemId, relationType, metadata !== undefined ? JSON.stringify(metadata) : null);
  return db
    .prepare<[number], ItemRelationship>("SELECT * FROM item_relationships WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listRelationshipsForItem(itemId: number): ItemRelationship[] {
  return getDb()
    .prepare<[number], ItemRelationship>(
      "SELECT * FROM item_relationships WHERE item_id = ? ORDER BY created_at ASC"
    )
    .all(itemId);
}
