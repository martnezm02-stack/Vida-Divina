// qualificationFiltering.test.ts — Los widgets agregados del Overview
// (KPIs, actividad, actores, contenido reciente) excluyen items
// calificados como IRRELEVANT, sin tocar la fila raw en
// intelligence_items -- separación RAW EVIDENCE vs. QUALIFIED
// INTELLIGENCE. Proyectos que nunca corrieron qualification se comportan
// exactamente igual que antes de esta capa (sin regresión).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem, getIntelligenceItemById } from "../../../src/lib/intelligence";
import { recordQualificationSignal } from "../../../src/lib/intelligence/qualification/qualificationRecorder";
import type { QualificationContext, QualificationDecision } from "../../../src/lib/intelligence/qualification/types";
import { getOverviewKpis, getActiveActors, getSourceActivity, getRecentContent } from "../../../src/lib/intelligence/dashboard/overviewQueries";
import { getItemDetail, listMarketIntelligenceItems } from "../../../src/lib/intelligence/dashboard/marketIntelligenceQueries";

function setup() {
  const project = getOrCreateProject(`qualfilter-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function markIrrelevant(projectSlug: string, projectId: number, itemId: number) {
  const decision: QualificationDecision = {
    decision: "IRRELEVANT",
    confidence: 0.6,
    rationale: "test",
    evidence: {},
    provider: "fallback:deterministic",
    provenance: null,
  };
  const context: QualificationContext = {
    project: { id: projectId, slug: projectSlug },
    brand: { name: "Test", brandTokens: ["testbrand"] },
    item: { id: itemId, canonical_url: null, description_snippet: null, source_metadata_page_name: null },
    actor: null,
  };
  recordQualificationSignal(context, decision);
}

test("getOverviewKpis: excluye items IRRELEVANT del conteo, pero la fila raw sigue existiendo en intelligence_items", () => {
  const { project, source } = setup();
  const { item: relevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  const { item: irrelevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  markIrrelevant(project.slug, project.id, irrelevantItem.id);

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.intelligenceItems, 1, "solo el item relevante cuenta para el KPI");

  assert.ok(relevantItem.id);
  assert.ok(getIntelligenceItemById(irrelevantItem.id), "la fila raw del item irrelevant NUNCA se borra");
});

test("getActiveActors / getSourceActivity / getRecentContent: excluyen items IRRELEVANT de la agregación", () => {
  const { project, source } = setup();
  const { item: relevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "rel-1", content_type: "video" });
  const { item: irrelevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "irr-1", content_type: "video" });
  markIrrelevant(project.slug, project.id, irrelevantItem.id);

  const sourceActivity = getSourceActivity(project.id);
  assert.equal(sourceActivity[0]?.itemCount, 1, "solo el item relevante cuenta en la actividad por fuente");

  const recentContent = getRecentContent(project.id);
  assert.equal(recentContent.length, 1);
  assert.equal(recentContent[0]?.item.id, relevantItem.id);
});

test("proyecto SIN ninguna qualification corrida: los widgets se comportan exactamente igual que antes de esta capa (sin regresión)", () => {
  const { project, source } = setup();
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.intelligenceItems, 2, "sin qualification corrida, ningún item se excluye");
});

test("Market Intelligence: NUNCA oculta el item IRRELEVANT (RAW EVIDENCE completa) -- solo lo etiqueta", () => {
  const { project, source } = setup();
  const { item: irrelevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  markIrrelevant(project.slug, project.id, irrelevantItem.id);

  const list = listMarketIntelligenceItems({ projectId: project.id });
  assert.equal(list.total, 1, "Market Intelligence sigue mostrando el item, a diferencia del Overview");
  assert.equal(list.items[0]?.qualification, "IRRELEVANT");

  const detail = getItemDetail(irrelevantItem.id);
  assert.equal(detail?.qualification, "IRRELEVANT");
});
