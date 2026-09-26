// marketIntelligenceQueries.test.ts — Data layer de Market Intelligence:
// lista filtrable con paginación real (COUNT-only nuevo, sin duplicar el
// resto de searchIntelligenceItems), detalle de item agregando MI-1
// completo, y aislamiento estricto por proyecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem, recordMetrics } from "../../../src/lib/intelligence";
import { listMarketIntelligenceItems, getItemDetail } from "../../../src/lib/intelligence/dashboard/marketIntelligenceQueries";

function setup() {
  const project = getOrCreateProject(`mi-list-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("listMarketIntelligenceItems: total real vía COUNT, independiente del limit de la página pedida", () => {
  const { project, source } = setup();
  for (let i = 0; i < 5; i++) {
    upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: `item-${i}`, content_type: "video" });
  }

  const page1 = listMarketIntelligenceItems({ projectId: project.id, limit: 2, offset: 0 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.total, 5, "el total debe reflejar TODOS los items del proyecto, no solo la página traída");

  const page2 = listMarketIntelligenceItems({ projectId: project.id, limit: 2, offset: 4 });
  assert.equal(page2.items.length, 1);
});

test("listMarketIntelligenceItems: aislamiento por proyecto -- nunca mezcla items de otro proyecto", () => {
  const { project: projectA, source } = setup();
  const projectB = getOrCreateProject(`mi-list-b-${randomUUID()}`);
  upsertIntelligenceItem({ project_id: projectA.id, source_id: source.id, content_type: "video" });

  const resultA = listMarketIntelligenceItems({ projectId: projectA.id });
  const resultB = listMarketIntelligenceItems({ projectId: projectB.id });
  assert.equal(resultA.total, 1);
  assert.equal(resultB.total, 0);
});

test("listMarketIntelligenceItems: filtro por fuente inexistente -> ningún resultado, nunca 'todos' por defecto", () => {
  const { project, source } = setup();
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const result = listMarketIntelligenceItems({ projectId: project.id, sourceSlug: "fuente-que-no-existe" });
  assert.equal(result.total, 0);
});

test("getItemDetail: agrega item + fuente + métricas -- ausencia de métricas queda null, nunca en cero", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const withoutMetrics = getItemDetail(item.id);
  assert.ok(withoutMetrics);
  assert.equal(withoutMetrics!.latestMetrics, null);
  assert.equal(withoutMetrics!.source?.slug, source.slug);

  recordMetrics({ item_id: item.id, views: 100, likes: 5, comments: null });
  const withMetrics = getItemDetail(item.id);
  assert.equal(withMetrics!.latestMetrics?.views, 100);
  assert.equal(withMetrics!.latestMetrics?.comments, null, "un campo no informado se conserva null, nunca se convierte en 0");
});

test("getItemDetail: item inexistente -> null, nunca un detalle fabricado", () => {
  assert.equal(getItemDetail(999999999), null);
});
