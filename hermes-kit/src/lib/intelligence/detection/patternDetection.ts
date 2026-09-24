// patternDetection.ts — Detección determinista de patrones (creative
// repetition, performance trend) y sus consultas de trazabilidad.
//
// Upsert por (project_id, pattern_type, pattern_key): repetir la misma
// detección sobre el mismo conjunto de datos actualiza el mismo pattern
// (mismos valores, no-op efectivo) en vez de duplicarlo -- sección 10/11.
// Cuando la población analizada crece, pattern_items solo GANA filas
// (INSERT OR IGNORE): nunca se borra evidencia histórica.
//
// scope distingue sección 7: 'actor' cuando un único actor sustenta el
// patrón (repetición propia, no tendencia de mercado), 'market' cuando 2+
// actores distintos lo sustentan.
//
// confidence (sección 13) es una medida de soporte/certeza de detección --
// aquí, la fracción de items examinados que sustentan el patrón -- nunca
// una evaluación de "qué tan bueno" es.
import { getDb } from "../connection";
import { listMetricsHistory } from "../metrics";
import type { Pattern, Signal, IntelligenceItemWithDerived } from "../types";
import { CREATIVE_FIELDS, groupByField, itemsById } from "./featureExtraction";

const MIN_SUPPORT_DEFAULT = 2;

interface UpsertPatternInput {
  project_id: number;
  pattern_type: string;
  pattern_key: string;
  name: string;
  description: string;
  scope: "actor" | "market";
  item_support: number;
  actor_support: number;
  total_items_examined: number;
  frequency: number;
  confidence: number;
  first_seen_at: number;
  last_seen_at: number;
  itemIds: number[];
  signalIds: number[];
  metadata: unknown;
}

function upsertPattern(input: UpsertPatternInput): Pattern {
  const db = getDb();
  const existing = db
    .prepare<[number, string, string], Pattern>(
      "SELECT * FROM patterns WHERE project_id = ? AND pattern_type = ? AND pattern_key = ?"
    )
    .get(input.project_id, input.pattern_type, input.pattern_key);

  const metadataJson = JSON.stringify(input.metadata);
  let patternId: number;

  if (existing) {
    // El conjunto pudo haber crecido desde la última detección -- fusiona
    // soporte/ventana temporal con lo ya registrado, nunca lo reduce.
    const itemSupport = Math.max(existing.item_support ?? 0, input.item_support);
    const actorSupport = Math.max(existing.actor_support ?? 0, input.actor_support);
    const firstSeen = Math.min(existing.first_seen_at ?? input.first_seen_at, input.first_seen_at);
    const lastSeen = Math.max(existing.last_seen_at ?? input.last_seen_at, input.last_seen_at);

    db.prepare(
      `UPDATE patterns SET
        name = ?, description = ?, scope = ?,
        item_support = ?, actor_support = ?, total_items_examined = ?,
        frequency = ?, confidence = ?, first_seen_at = ?, last_seen_at = ?,
        metadata_json = ?, updated_at = unixepoch()
       WHERE id = ?`
    ).run(
      input.name,
      input.description,
      actorSupport > 1 ? "market" : "actor",
      itemSupport,
      actorSupport,
      input.total_items_examined,
      input.frequency,
      input.confidence,
      firstSeen,
      lastSeen,
      metadataJson,
      existing.id
    );
    patternId = existing.id;
  } else {
    const info = db
      .prepare(
        `INSERT INTO patterns
          (project_id, name, description, pattern_type, pattern_key, scope,
           item_support, actor_support, total_items_examined, frequency, confidence,
           first_seen_at, last_seen_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.project_id,
        input.name,
        input.description,
        input.pattern_type,
        input.pattern_key,
        input.scope,
        input.item_support,
        input.actor_support,
        input.total_items_examined,
        input.frequency,
        input.confidence,
        input.first_seen_at,
        input.last_seen_at,
        metadataJson
      );
    patternId = info.lastInsertRowid as number;
  }

  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO pattern_items (pattern_id, item_id) VALUES (?, ?)"
  );
  for (const itemId of input.itemIds) insertItem.run(patternId, itemId);

  const insertSignal = db.prepare(
    "INSERT OR IGNORE INTO pattern_signals (pattern_id, signal_id) VALUES (?, ?)"
  );
  for (const signalId of input.signalIds) insertSignal.run(patternId, signalId);

  return db.prepare<[number], Pattern>("SELECT * FROM patterns WHERE id = ?").get(patternId)!;
}

/** Detecta repetición de hook/angle/cta/offer/format dentro del conjunto consultado. */
export function detectCreativePatterns(
  items: IntelligenceItemWithDerived[],
  projectId: number,
  minSupport: number = MIN_SUPPORT_DEFAULT,
  signalsByFieldValue: Map<string, Signal> = new Map()
): Pattern[] {
  const totalExamined = items.length;
  const byId = itemsById(items);
  const patterns: Pattern[] = [];

  for (const field of CREATIVE_FIELDS) {
    const groups = groupByField(items, field);
    for (const group of groups) {
      if (group.itemIds.length < minSupport) continue;

      const firstSeen = Math.min(...group.itemIds.map((id) => byId.get(id)!.first_seen_at));
      const lastSeen = Math.max(...group.itemIds.map((id) => byId.get(id)!.last_seen_at));
      const frequency = group.itemIds.length / totalExamined;
      const scope = group.actorIds.length > 1 ? "market" : "actor";
      const signal = signalsByFieldValue.get(`${field}:${group.value}`);

      patterns.push(
        upsertPattern({
          project_id: projectId,
          pattern_type: `creative_${field}_repetition`,
          pattern_key: group.value,
          name: `Repetición de ${field}: "${group.value}"`,
          description: `El valor de ${field} "${group.value}" aparece en ${group.itemIds.length} de ${totalExamined} items analizados (${group.actorIds.length} actor(es) distinto(s)).`,
          scope,
          item_support: group.itemIds.length,
          actor_support: group.actorIds.length,
          total_items_examined: totalExamined,
          frequency,
          confidence: frequency,
          first_seen_at: firstSeen,
          last_seen_at: lastSeen,
          itemIds: group.itemIds,
          signalIds: signal ? [signal.id] : [],
          metadata: {
            field,
            value: group.value,
            item_support: group.itemIds.length,
            actor_support: group.actorIds.length,
            total_items_examined: totalExamined,
            frequency,
          },
        })
      );
    }
  }

  return patterns;
}

/**
 * Detecta tendencias de performance (crecimiento/caída sostenidos de
 * views) sobre el conjunto consultado. Un item solo cuenta si tiene al
 * menos 2 snapshots de métricas -- con 1 snapshot no hay dimensión
 * temporal que declarar (sección 8).
 */
export function detectPerformancePatterns(
  items: IntelligenceItemWithDerived[],
  projectId: number,
  minSupport: number = MIN_SUPPORT_DEFAULT
): Pattern[] {
  const byId = itemsById(items);
  const growing: number[] = [];
  const declining: number[] = [];

  for (const item of items) {
    const history = listMetricsHistory(item.id);
    if (history.length < 2) continue;
    const first = history[0];
    const last = history[history.length - 1];
    if (first.views === null || last.views === null) continue;
    if (last.views > first.views) growing.push(item.id);
    else if (last.views < first.views) declining.push(item.id);
  }

  const patterns: Pattern[] = [];
  const totalExamined = items.length;

  const buildTrend = (itemIds: number[], patternType: string, label: string) => {
    if (itemIds.length < minSupport) return;
    const actorIds = new Set<number>();
    for (const id of itemIds) {
      const actorId = byId.get(id)!.actor_id;
      if (actorId !== null) actorIds.add(actorId);
    }
    const firstSeen = Math.min(...itemIds.map((id) => byId.get(id)!.first_seen_at));
    const lastSeen = Math.max(...itemIds.map((id) => byId.get(id)!.last_seen_at));
    const frequency = itemIds.length / totalExamined;

    patterns.push(
      upsertPattern({
        project_id: projectId,
        pattern_type: patternType,
        pattern_key: "views",
        name: `Tendencia de ${label} en views`,
        description: `${itemIds.length} de ${totalExamined} items examinados muestran ${label} sostenido de views entre su primer y último snapshot.`,
        scope: actorIds.size > 1 ? "market" : "actor",
        item_support: itemIds.length,
        actor_support: actorIds.size,
        total_items_examined: totalExamined,
        frequency,
        confidence: frequency,
        first_seen_at: firstSeen,
        last_seen_at: lastSeen,
        itemIds,
        signalIds: [],
        metadata: { metric: "views", direction: label, item_support: itemIds.length, actor_support: actorIds.size },
      })
    );
  };

  buildTrend(growing, "performance_growth_trend", "crecimiento");
  buildTrend(declining, "performance_decline_trend", "caída");

  return patterns;
}

// --- Trazabilidad (sección 14): todo se deriva de pattern_items, sin
// duplicar la relación items/actors/evidence/metrics/analyses en tablas
// nuevas -- ya existen como FKs en MI-1/MI-2/MI-3.

export function getPatternSupportingItems(patternId: number): number[] {
  return getDb()
    .prepare<[number], { item_id: number }>(
      "SELECT item_id FROM pattern_items WHERE pattern_id = ? ORDER BY item_id ASC"
    )
    .all(patternId)
    .map((r) => r.item_id);
}

export function getPatternSupportingActors(patternId: number): number[] {
  return getDb()
    .prepare<[number], { actor_id: number }>(
      `SELECT DISTINCT ii.actor_id AS actor_id
       FROM pattern_items pi
       JOIN intelligence_items ii ON ii.id = pi.item_id
       WHERE pi.pattern_id = ? AND ii.actor_id IS NOT NULL`
    )
    .all(patternId)
    .map((r) => r.actor_id);
}

export function getPatternSupportingEvidence(patternId: number): number[] {
  return getDb()
    .prepare<[number], { id: number }>(
      `SELECT DISTINCT e.id AS id
       FROM pattern_items pi
       JOIN evidence e ON e.item_id = pi.item_id
       WHERE pi.pattern_id = ?`
    )
    .all(patternId)
    .map((r) => r.id);
}

export function getPatternSupportingAnalysisRuns(patternId: number): number[] {
  return getDb()
    .prepare<[number], { analysis_run_id: number }>(
      `SELECT DISTINCT ari.analysis_run_id AS analysis_run_id
       FROM pattern_items pi
       JOIN analysis_run_items ari ON ari.item_id = pi.item_id
       WHERE pi.pattern_id = ?`
    )
    .all(patternId)
    .map((r) => r.analysis_run_id);
}

export function getPatternSignals(patternId: number): Signal[] {
  return getDb()
    .prepare<[number], Signal>(
      `SELECT s.* FROM pattern_signals ps
       JOIN signals s ON s.id = ps.signal_id
       WHERE ps.pattern_id = ?`
    )
    .all(patternId);
}

export function listPatternsByProjectDetailed(projectId: number, patternType?: string): Pattern[] {
  const db = getDb();
  return patternType
    ? db
        .prepare<[number, string], Pattern>(
          "SELECT * FROM patterns WHERE project_id = ? AND pattern_type = ? ORDER BY created_at DESC"
        )
        .all(projectId, patternType)
    : db
        .prepare<[number], Pattern>("SELECT * FROM patterns WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId);
}
