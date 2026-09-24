// metrics.ts — Snapshots de métricas de un item en el tiempo.
//
// "Desconocido" nunca se convierte en 0 -- si un campo no viene informado se
// guarda NULL. Cada llamada a recordMetrics crea un snapshot nuevo (no
// sobrescribe el anterior): las métricas son una serie temporal.
import { getDb } from "./connection";
import type { ItemMetricsInput, ItemMetricsSnapshot } from "./types";

export function recordMetrics(input: ItemMetricsInput): ItemMetricsSnapshot {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO item_metrics
        (item_id, views, likes, comments, shares, engagement, reach, extra_json, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, unixepoch()))`
    )
    .run(
      input.item_id,
      input.views ?? null,
      input.likes ?? null,
      input.comments ?? null,
      input.shares ?? null,
      input.engagement ?? null,
      input.reach ?? null,
      input.extra !== undefined ? JSON.stringify(input.extra) : null,
      input.captured_at ?? null
    );
  return db
    .prepare<[number], ItemMetricsSnapshot>("SELECT * FROM item_metrics WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function getLatestMetrics(itemId: number): ItemMetricsSnapshot | null {
  return (
    getDb()
      .prepare<[number], ItemMetricsSnapshot>(
        "SELECT * FROM item_metrics WHERE item_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1"
      )
      .get(itemId) ?? null
  );
}

export function listMetricsHistory(itemId: number): ItemMetricsSnapshot[] {
  return getDb()
    .prepare<[number], ItemMetricsSnapshot>(
      "SELECT * FROM item_metrics WHERE item_id = ? ORDER BY captured_at ASC, id ASC"
    )
    .all(itemId);
}
