// relationshipDetection.ts — Deriva item_relationships (MI-1, tabla ya
// existente) entre items del conjunto consultado que comparten un mismo
// valor observado. Nunca crea una relación sin datos que la respalden:
// solo cuando 2+ items comparten exactamente el mismo valor normalizado.
// Idempotente: comprueba antes de insertar, nunca duplica el par.
import { createRelationship, listRelationshipsForItem } from "../relationships";
import type { IntelligenceItemWithDerived } from "../types";
import { groupByActor, groupByField } from "./featureExtraction";
import type { CreativeField } from "./featureExtraction";

const SHARED_FIELD_RELATIONSHIPS: Array<{ field: CreativeField; relationType: string }> = [
  { field: "hook", relationType: "SAME_HOOK" },
  { field: "angle", relationType: "SAME_ANGLE" },
  { field: "offer", relationType: "SAME_OFFER" },
];

function relationshipExists(itemId: number, relatedItemId: number, relationType: string): boolean {
  return listRelationshipsForItem(itemId).some(
    (r) => r.related_item_id === relatedItemId && r.relation_type === relationType
  );
}

function linkPairwise(itemIds: number[], relationType: string, metadata?: unknown): number {
  let created = 0;
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const [a, b] = [itemIds[i], itemIds[j]];
      if (relationshipExists(a, b, relationType) || relationshipExists(b, a, relationType)) continue;
      createRelationship(a, b, relationType, metadata);
      created++;
    }
  }
  return created;
}

/**
 * Crea relaciones SAME_HOOK/SAME_ANGLE/SAME_OFFER (por valor creativo
 * compartido) y SAME_ACTOR (por actor compartido) entre pares de items del
 * conjunto consultado. Devuelve cuántas relaciones nuevas se crearon.
 */
export function detectSharedFieldRelationships(
  items: IntelligenceItemWithDerived[],
  minSupport: number
): number {
  let created = 0;

  for (const { field, relationType } of SHARED_FIELD_RELATIONSHIPS) {
    for (const group of groupByField(items, field)) {
      if (group.itemIds.length < minSupport) continue;
      created += linkPairwise(group.itemIds, relationType, { shared_value: group.value });
    }
  }

  for (const [, itemIds] of groupByActor(items)) {
    if (itemIds.length < minSupport) continue;
    created += linkPairwise(itemIds, "SAME_ACTOR");
  }

  return created;
}
