// aiAnalysis.ts — Análisis/clasificación IA estructurada, extensible.
// result_json es libre a propósito -- no se acopla a un único prompt/modelo.
import { getDb } from "./connection";
import type { AiAnalysis, AiAnalysisInput } from "./types";

export function saveAiAnalysis(input: AiAnalysisInput): AiAnalysis {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO ai_analyses (item_id, analysis_type, model, result_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.item_id, input.analysis_type, input.model ?? null, JSON.stringify(input.result));
  return db
    .prepare<[number], AiAnalysis>("SELECT * FROM ai_analyses WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function listAiAnalysesForItem(itemId: number, analysisType?: string): AiAnalysis[] {
  const db = getDb();
  if (analysisType) {
    return db
      .prepare<[number, string], AiAnalysis>(
        "SELECT * FROM ai_analyses WHERE item_id = ? AND analysis_type = ? ORDER BY created_at ASC"
      )
      .all(itemId, analysisType);
  }
  return db
    .prepare<[number], AiAnalysis>(
      "SELECT * FROM ai_analyses WHERE item_id = ? ORDER BY created_at ASC"
    )
    .all(itemId);
}
