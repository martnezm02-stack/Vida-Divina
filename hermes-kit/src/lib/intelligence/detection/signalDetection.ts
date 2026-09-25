// signalDetection.ts — Señales agregadas (frecuencia de un valor creativo
// dentro del conjunto consultado). Upsert por (project_id, signal_type,
// signal_key): re-ejecutar la misma detección sobre los mismos datos
// actualiza la misma fila -- nunca crea una señal duplicada.
import { getDb } from "../connection";
import type { Signal } from "../types";
import type { CreativeField, FieldGroup } from "./featureExtraction";
import { CREATIVE_FIELDS, groupByField } from "./featureExtraction";
import type { IntelligenceItemWithDerived } from "../types";

const SIGNAL_TYPE_BY_FIELD: Record<CreativeField, string> = {
  hook: "HOOK_FREQUENCY",
  angle: "ANGLE_FREQUENCY",
  cta: "CTA_FREQUENCY",
  offer: "OFFER_FREQUENCY",
  format: "FORMAT_FREQUENCY",
  problem: "PROBLEM_FREQUENCY",
  promise: "PROMISE_FREQUENCY",
  mechanism: "MECHANISM_FREQUENCY",
};

export interface UpsertSignalInput {
  project_id: number;
  signal_type: string;
  signal_key: string;
  title: string;
  description: string;
  strength: number;
  detected_at: number;
  metadata: unknown;
  itemIds: number[];
}

/**
 * Upsert genérico por (project_id, signal_type, signal_key) -- reutilizado
 * tal cual por relevance/ (Relevance Engine) para que "signals" siga
 * siendo la ÚNICA entidad de señales del sistema, sin una segunda
 * implementación de upsert/idempotencia en paralelo.
 */
export function upsertSignal(input: UpsertSignalInput): Signal {
  const db = getDb();
  const existing = db
    .prepare<[number, string, string], Signal>(
      "SELECT * FROM signals WHERE project_id = ? AND signal_type = ? AND signal_key = ?"
    )
    .get(input.project_id, input.signal_type, input.signal_key);

  const metadataJson = JSON.stringify(input.metadata);
  let signalId: number;

  if (existing) {
    db.prepare(
      `UPDATE signals SET title = ?, description = ?, strength = ?, detected_at = ?, metadata_json = ?
       WHERE id = ?`
    ).run(input.title, input.description, input.strength, input.detected_at, metadataJson, existing.id);
    signalId = existing.id;
  } else {
    const info = db
      .prepare(
        `INSERT INTO signals
          (project_id, signal_type, signal_key, title, description, strength, detected_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.project_id,
        input.signal_type,
        input.signal_key,
        input.title,
        input.description,
        input.strength,
        input.detected_at,
        metadataJson
      );
    signalId = info.lastInsertRowid as number;
  }

  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO signal_items (signal_id, item_id) VALUES (?, ?)"
  );
  for (const itemId of input.itemIds) insertItem.run(signalId, itemId);

  return db.prepare<[number], Signal>("SELECT * FROM signals WHERE id = ?").get(signalId)!;
}

/**
 * Detecta señales de frecuencia (HOOK/ANGLE/CTA/OFFER/FORMAT_FREQUENCY)
 * sobre el conjunto consultado. Solo genera una señal cuando un valor
 * aparece en al menos `minSupport` items -- una única ocurrencia no es una
 * señal de repetición.
 */
export function detectFrequencySignals(
  items: IntelligenceItemWithDerived[],
  projectId: number,
  minSupport: number
): Signal[] {
  const totalExamined = items.length;
  const detectedAt = Math.floor(Date.now() / 1000);
  const signals: Signal[] = [];

  for (const field of CREATIVE_FIELDS) {
    const groups = groupByField(items, field);
    for (const group of groups) {
      if (group.itemIds.length < minSupport) continue;

      const frequency = group.itemIds.length / totalExamined;
      signals.push(
        upsertSignal({
          project_id: projectId,
          signal_type: SIGNAL_TYPE_BY_FIELD[field],
          signal_key: group.value,
          title: `${field}: "${group.value}"`,
          description: `Aparece en ${group.itemIds.length} de ${totalExamined} items analizados.`,
          strength: frequency,
          detected_at: detectedAt,
          itemIds: group.itemIds,
          metadata: signalMetadata(group, totalExamined, frequency),
        })
      );
    }
  }

  return signals;
}

function signalMetadata(group: FieldGroup, totalItemsExamined: number, frequency: number) {
  return {
    value: group.value,
    supporting_item_ids: group.itemIds,
    unique_actor_count: group.actorIds.length,
    total_items_examined: totalItemsExamined,
    frequency,
  };
}

export function listItemsForSignal(signalId: number): number[] {
  return getDb()
    .prepare<[number], { item_id: number }>(
      "SELECT item_id FROM signal_items WHERE signal_id = ? ORDER BY item_id ASC"
    )
    .all(signalId)
    .map((r) => r.item_id);
}
