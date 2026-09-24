// assets.ts — Thumbnail, video, imagen, audio, URL asociados a un item.
import { getDb } from "./connection";
import type { Asset, AssetInput } from "./types";

export function attachAsset(input: AssetInput): Asset {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO assets (item_id, kind, url, local_path, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.item_id,
      input.kind,
      input.url ?? null,
      input.local_path ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null
    );
  return db
    .prepare<[number], Asset>("SELECT * FROM assets WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listAssetsForItem(itemId: number): Asset[] {
  return getDb()
    .prepare<[number], Asset>("SELECT * FROM assets WHERE item_id = ? ORDER BY created_at ASC")
    .all(itemId);
}
