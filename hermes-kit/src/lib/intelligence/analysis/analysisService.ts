// analysisService.ts — Ejecución de análisis bajo demanda (query-driven, no
// schedule-driven -- nunca hay un cron o polling aquí, solo se ejecuta
// cuando algo llama a analyzeItems/analyzeQuery).
//
// Reutiliza exclusivamente las APIs ya existentes de MI-1/MI-2 (conexión,
// items, evidence) -- no duplica DB connection ni schema management.
import { createHash } from "node:crypto";
import { getDb } from "../connection";
import { getIntelligenceItemById } from "../items";
import { withActiveDays } from "../items";
import { searchIntelligenceItems } from "../items";
import type { IntelligenceItemWithDerived } from "../types";
import type {
  AnalysisProvider,
  AnalysisProviderOutput,
  AnalysisRequest,
  AnalysisRun,
  AnalysisRunWithItems,
  AnalyzeResult,
} from "./types";

function resolveItems(request: AnalysisRequest): IntelligenceItemWithDerived[] {
  if (request.itemIds && request.itemIds.length > 0) {
    const items: IntelligenceItemWithDerived[] = [];
    for (const id of request.itemIds) {
      const item = getIntelligenceItemById(id);
      if (item && item.project_id === request.project_id) {
        items.push(withActiveDays(item));
      }
    }
    return items;
  }
  if (request.query) {
    return searchIntelligenceItems({ ...request.query, project_id: request.project_id });
  }
  return [];
}

function itemsKeyOf(items: IntelligenceItemWithDerived[]): string {
  return JSON.stringify([...items.map((i) => i.id)].sort((a, b) => a - b));
}

/**
 * Hash determinista de (tipo de análisis + conjunto de items + contexto +
 * huella de los items). Si algo relevante cambia -- otro conjunto, otro
 * contexto/opciones, o un item se actualizó (updated_at) desde el último
 * análisis -- el hash cambia y el caché deja de ser válido automáticamente.
 * Así el reuso (punto 9) queda simple y determinista, sin lógica extra.
 */
function computeInputHash(
  itemsKey: string,
  providerName: string,
  request: AnalysisRequest,
  items: IntelligenceItemWithDerived[]
): string {
  const fingerprint = items
    .map((i) => `${i.id}:${i.updated_at}`)
    .sort()
    .join(",");
  const payload = JSON.stringify({
    analysisType: request.analysisType,
    itemsKey,
    provider: providerName,
    context: request.context ?? null,
    language: request.language ?? null,
    market: request.market ?? null,
    options: request.options ?? null,
    fingerprint,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function attachItemIds(run: AnalysisRun): AnalysisRunWithItems {
  const rows = getDb()
    .prepare<[number], { item_id: number }>(
      "SELECT item_id FROM analysis_run_items WHERE analysis_run_id = ? ORDER BY item_id ASC"
    )
    .all(run.id);
  return { ...run, item_ids: rows.map((r) => r.item_id) };
}

function findCachedRun(request: AnalysisRequest, itemsKey: string, inputHash: string): AnalysisRun | null {
  return (
    getDb()
      .prepare<[number, string, string, string], AnalysisRun>(
        `SELECT * FROM analysis_runs
         WHERE project_id = ? AND analysis_type = ? AND items_key = ? AND input_hash = ?
         ORDER BY version DESC, id DESC LIMIT 1`
      )
      .get(request.project_id, request.analysisType, itemsKey, inputHash) ?? null
  );
}

function nextVersion(request: AnalysisRequest, itemsKey: string): number {
  const row = getDb()
    .prepare<[number, string, string], { max_version: number | null }>(
      `SELECT MAX(version) AS max_version FROM analysis_runs
       WHERE project_id = ? AND analysis_type = ? AND items_key = ?`
    )
    .get(request.project_id, request.analysisType, itemsKey);
  return (row?.max_version ?? 0) + 1;
}

function persistRun(
  request: AnalysisRequest,
  providerName: string,
  itemsKey: string,
  inputHash: string,
  items: IntelligenceItemWithDerived[],
  output: AnalysisProviderOutput
): AnalysisRunWithItems {
  const db = getDb();
  const version = nextVersion(request, itemsKey);

  const contextJson =
    request.context !== undefined ||
    request.language !== undefined ||
    request.market !== undefined ||
    request.options !== undefined
      ? JSON.stringify({
          context: request.context ?? null,
          language: request.language ?? null,
          market: request.market ?? null,
          options: request.options ?? null,
        })
      : null;

  const resultJson = JSON.stringify({
    observed: output.observed ?? {},
    inferred: output.inferred ?? {},
  });

  const insertTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO analysis_runs
          (project_id, analysis_type, provider, model, confidence, items_key, input_hash, version, context_json, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        request.project_id,
        request.analysisType,
        providerName,
        output.model ?? null,
        output.confidence ?? null,
        itemsKey,
        inputHash,
        version,
        contextJson,
        resultJson
      );
    const runId = info.lastInsertRowid as number;

    const insertItem = db.prepare(
      "INSERT OR IGNORE INTO analysis_run_items (analysis_run_id, item_id) VALUES (?, ?)"
    );
    for (const item of items) insertItem.run(runId, item.id);

    if (output.evidenceIds && output.evidenceIds.length > 0) {
      const insertEvidence = db.prepare(
        "INSERT OR IGNORE INTO analysis_run_evidence (analysis_run_id, evidence_id) VALUES (?, ?)"
      );
      for (const evidenceId of output.evidenceIds) insertEvidence.run(runId, evidenceId);
    }

    return runId;
  });

  const runId = insertTx();
  const run = db.prepare<[number], AnalysisRun>("SELECT * FROM analysis_runs WHERE id = ?").get(runId)!;
  return attachItemIds(run);
}

/**
 * Ejecuta (o reutiliza) un análisis sobre un conjunto concreto de items.
 * Query-driven: solo corre cuando esta función se llama, nunca por sí sola.
 */
export async function analyzeItems(
  request: AnalysisRequest,
  provider: AnalysisProvider
): Promise<AnalyzeResult> {
  const items = resolveItems(request);
  if (items.length === 0) {
    throw new Error("analyzeItems: no se resolvió ningún item para analizar (itemIds/query vacíos o inválidos)");
  }

  const itemsKey = itemsKeyOf(items);
  const inputHash = computeInputHash(itemsKey, provider.name, request, items);

  if (!request.force) {
    const cached = findCachedRun(request, itemsKey, inputHash);
    if (cached) {
      return { run: attachItemIds(cached), cached: true };
    }
  }

  const output = await provider.analyze(items, request);
  const run = persistRun(request, provider.name, itemsKey, inputHash, items, output);
  return { run, cached: false };
}

/**
 * Resuelve primero el conjunto relevante de items vía las capacidades de
 * búsqueda ya existentes (searchIntelligenceItems) y luego ejecuta MI-3
 * sobre ese conjunto. No implementa búsqueda semántica/vectorial.
 */
export async function analyzeQuery(
  request: Omit<AnalysisRequest, "itemIds">,
  provider: AnalysisProvider
): Promise<AnalyzeResult> {
  return analyzeItems(request, provider);
}

export function getAnalysisRun(id: number): AnalysisRunWithItems | null {
  const run = getDb().prepare<[number], AnalysisRun>("SELECT * FROM analysis_runs WHERE id = ?").get(id);
  return run ? attachItemIds(run) : null;
}

export function listAnalysisRunsForItem(itemId: number): AnalysisRunWithItems[] {
  const runs = getDb()
    .prepare<[number], AnalysisRun>(
      `SELECT ar.* FROM analysis_runs ar
       JOIN analysis_run_items ari ON ari.analysis_run_id = ar.id
       WHERE ari.item_id = ?
       ORDER BY ar.created_at ASC, ar.id ASC`
    )
    .all(itemId);
  return runs.map(attachItemIds);
}

export function listAnalysisRunsByProject(projectId: number, analysisType?: string): AnalysisRunWithItems[] {
  const db = getDb();
  const runs = analysisType
    ? db
        .prepare<[number, string], AnalysisRun>(
          "SELECT * FROM analysis_runs WHERE project_id = ? AND analysis_type = ? ORDER BY created_at DESC"
        )
        .all(projectId, analysisType)
    : db
        .prepare<[number], AnalysisRun>(
          "SELECT * FROM analysis_runs WHERE project_id = ? ORDER BY created_at DESC"
        )
        .all(projectId);
  return runs.map(attachItemIds);
}
