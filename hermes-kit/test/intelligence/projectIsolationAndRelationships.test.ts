// projectIsolationAndRelationships.test.ts — MI-1: aislamiento por
// proyecto/workspace (Marketing Intelligence, Vida Divina, Trading... nunca
// se mezclan) y el grafo de relaciones item-a-item.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  searchIntelligenceItems,
  createRelationship,
  listRelationshipsForItem,
} from "../../src/lib/intelligence";

test("project/workspace isolation: un proyecto nunca ve items de otro", () => {
  const projectA = getOrCreateProject(`vida-divina-${randomUUID()}`);
  const projectB = getOrCreateProject(`trading-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);

  upsertIntelligenceItem({
    project_id: projectA.id,
    source_id: source.id,
    external_id: "shared-external-id",
    content_type: "ad",
    title: "Item de Vida Divina",
  });
  upsertIntelligenceItem({
    project_id: projectB.id,
    source_id: source.id,
    external_id: "shared-external-id",
    content_type: "ad",
    title: "Item de Trading",
  });

  const resultsA = searchIntelligenceItems({ project_id: projectA.id });
  const resultsB = searchIntelligenceItems({ project_id: projectB.id });

  assert.equal(resultsA.length, 1);
  assert.equal(resultsB.length, 1);
  assert.equal(resultsA[0].title, "Item de Vida Divina");
  assert.equal(resultsB[0].title, "Item de Trading");
  assert.notEqual(
    resultsA[0].id,
    resultsB[0].id,
    "el mismo external_id en proyectos distintos debe crear filas distintas, no compartir identidad"
  );
});

test("item_relationships: relaciona dos items sin duplicar la relación por actor/fuente", () => {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);

  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "rel-1",
    content_type: "ad",
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "rel-2",
    content_type: "ad",
  });

  createRelationship(item1.id, item2.id, "similar_creative", { similarity: 0.91 });

  const relationships = listRelationshipsForItem(item1.id);
  assert.equal(relationships.length, 1);
  assert.equal(relationships[0].related_item_id, item2.id);
  assert.equal(relationships[0].relation_type, "similar_creative");
});
