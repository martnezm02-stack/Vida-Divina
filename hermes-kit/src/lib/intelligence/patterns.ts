// patterns.ts — Estructura base para patrones futuros (motor de detección
// fuera de alcance de MI-1).
import { getDb } from "./connection";
import type { Pattern, PatternInput } from "./types";

export function createPattern(input: PatternInput): Pattern {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO patterns (project_id, name, description, pattern_type, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.project_id,
      input.name,
      input.description ?? null,
      input.pattern_type ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null
    );
  return getPatternById(info.lastInsertRowid as number)!;
}

export function getPatternById(id: number): Pattern | null {
  return (
    getDb().prepare<[number], Pattern>("SELECT * FROM patterns WHERE id = ?").get(id) ?? null
  );
}

export function listPatternsByProject(projectId: number): Pattern[] {
  return getDb()
    .prepare<[number], Pattern>(
      "SELECT * FROM patterns WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(projectId);
}

export function linkPatternItem(patternId: number, itemId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO pattern_items (pattern_id, item_id) VALUES (?, ?)"
    )
    .run(patternId, itemId);
}

export function listItemsForPattern(patternId: number): number[] {
  return getDb()
    .prepare<[number], { item_id: number }>(
      "SELECT item_id FROM pattern_items WHERE pattern_id = ? ORDER BY created_at ASC"
    )
    .all(patternId)
    .map((row) => row.item_id);
}
