// insights.ts — Estructura base para insights futuros.
import { getDb } from "./connection";
import type { Insight, InsightInput } from "./types";

export function createInsight(input: InsightInput): Insight {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO insights (project_id, name, description, insight_type, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.project_id,
      input.name,
      input.description ?? null,
      input.insight_type ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null
    );
  return getInsightById(info.lastInsertRowid as number)!;
}

export function getInsightById(id: number): Insight | null {
  return (
    getDb().prepare<[number], Insight>("SELECT * FROM insights WHERE id = ?").get(id) ?? null
  );
}

export function listInsightsByProject(projectId: number): Insight[] {
  return getDb()
    .prepare<[number], Insight>(
      "SELECT * FROM insights WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(projectId);
}

export function linkInsightPattern(insightId: number, patternId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO insight_patterns (insight_id, pattern_id) VALUES (?, ?)"
    )
    .run(insightId, patternId);
}
