// featureExtraction.ts — Extracción determinista de features sobre un
// conjunto de items, previa a la detección de señales/patrones. Funciones
// puras, sin I/O: agrupan por un campo creativo ya existente (MI-1/MI-2),
// nunca infieren un valor que el item no tenga.
import type { IntelligenceItemWithDerived } from "../types";

// problem/promise/mechanism: añadidos junto con Semantic Creative Analysis
// (MI-3) -- mismas columnas 1:1 de intelligence_items que hook/angle/cta/
// offer, ya pobladas por semanticCreativeAnalysisProvider vía
// updateIntelligenceItem(). groupByField() es genérico por campo, así que
// extender esta lista es lo único necesario para que la detección de
// patrones ya existente cubra "problemas/dolores recurrentes" y
// "promesas recurrentes" -- sin tocar patternDetection.ts.
export const CREATIVE_FIELDS = ["hook", "angle", "cta", "offer", "format", "problem", "promise", "mechanism"] as const;
export type CreativeField = (typeof CREATIVE_FIELDS)[number];

export interface FieldGroup {
  /** Valor normalizado (trim + minúsculas) compartido por el grupo. */
  value: string;
  itemIds: number[];
  actorIds: number[]; // únicos, sin null
}

/** Agrupa items por el valor normalizado de un campo creativo. Items sin valor en ese campo se omiten -- nunca se agrupan bajo "" o null. */
export function groupByField(
  items: IntelligenceItemWithDerived[],
  field: CreativeField
): FieldGroup[] {
  const buckets = new Map<string, { itemIds: number[]; actorIds: Set<number> }>();

  for (const item of items) {
    const raw = item[field];
    if (!raw || !raw.trim()) continue;
    const key = raw.trim().toLowerCase();

    if (!buckets.has(key)) buckets.set(key, { itemIds: [], actorIds: new Set() });
    const bucket = buckets.get(key)!;
    bucket.itemIds.push(item.id);
    if (item.actor_id !== null) bucket.actorIds.add(item.actor_id);
  }

  return [...buckets.entries()].map(([value, bucket]) => ({
    value,
    itemIds: bucket.itemIds,
    actorIds: [...bucket.actorIds],
  }));
}

/** Agrupa items por actor_id (ignora items sin actor). */
export function groupByActor(items: IntelligenceItemWithDerived[]): Map<number, number[]> {
  const byActor = new Map<number, number[]>();
  for (const item of items) {
    if (item.actor_id === null) continue;
    if (!byActor.has(item.actor_id)) byActor.set(item.actor_id, []);
    byActor.get(item.actor_id)!.push(item.id);
  }
  return byActor;
}

export function itemsById(items: IntelligenceItemWithDerived[]): Map<number, IntelligenceItemWithDerived> {
  return new Map(items.map((i) => [i.id, i]));
}
