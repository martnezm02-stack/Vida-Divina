// qualificationFiltering.test.ts — Los widgets agregados del Overview
// (KPIs, actividad, actores, contenido reciente) excluyen items
// calificados como IRRELEVANT, sin tocar la fila raw en
// intelligence_items -- separación RAW EVIDENCE vs. QUALIFIED
// INTELLIGENCE. Proyectos que nunca corrieron qualification se comportan
// exactamente igual que antes de esta capa (sin regresión).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem, getIntelligenceItemById, upsertActor } from "../../../src/lib/intelligence";
import { recordQualificationSignal } from "../../../src/lib/intelligence/qualification/qualificationRecorder";
import type { QualificationContext, QualificationDecision } from "../../../src/lib/intelligence/qualification/types";
import { getOverviewKpis, getActiveActors, getSourceActivity, getRecentContent } from "../../../src/lib/intelligence/dashboard/overviewQueries";
import { getItemDetail, listMarketIntelligenceItems } from "../../../src/lib/intelligence/dashboard/marketIntelligenceQueries";

function setup() {
  const project = getOrCreateProject(`qualfilter-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function markQualification(projectSlug: string, projectId: number, itemId: number, decisionCategory: QualificationDecision["decision"]) {
  const decision: QualificationDecision = {
    decision: decisionCategory,
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

function markIrrelevant(projectSlug: string, projectId: number, itemId: number) {
  markQualification(projectSlug, projectId, itemId, "IRRELEVANT");
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

test("getOverviewKpis.actors: un actor cuyos items son TODOS IRRELEVANT no cuenta -- caso real @bibliadivina.oficial/@divina_oficial", () => {
  const { project, source } = setup();

  const relevantActor = upsertActor({ project_id: project.id, source_id: source.id, handle: "vidadivina.oficial" });
  const irrelevantActor = upsertActor({ project_id: project.id, source_id: source.id, handle: "bibliadivina.oficial" });

  const { item: relevantItem } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: relevantActor.id, external_id: "rel-1", content_type: "video",
  });
  const { item: irrelevantItem1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: irrelevantActor.id, external_id: "irr-1", content_type: "video",
  });
  const { item: irrelevantItem2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: irrelevantActor.id, external_id: "irr-2", content_type: "video",
  });

  markQualification(project.slug, project.id, relevantItem.id, "RELEVANT");
  markIrrelevant(project.slug, project.id, irrelevantItem1.id);
  markIrrelevant(project.slug, project.id, irrelevantItem2.id);

  const kpis = getOverviewKpis(project.id);
  assert.equal(kpis.actors, 1, "solo el actor con al menos un item no-IRRELEVANT cuenta -- el actor 100% IRRELEVANT no aparece");
});

test("getOverviewKpis.actors: un actor con AL MENOS UN item no-IRRELEVANT sí cuenta, aunque también tenga items IRRELEVANT", () => {
  const { project, source } = setup();
  const actor = upsertActor({ project_id: project.id, source_id: source.id, handle: "actor-mixto" });

  const { item: relevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, actor_id: actor.id, external_id: "mix-rel", content_type: "video" });
  const { item: irrelevantItem } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, actor_id: actor.id, external_id: "mix-irr", content_type: "video" });

  markQualification(project.slug, project.id, relevantItem.id, "RELEVANT");
  markIrrelevant(project.slug, project.id, irrelevantItem.id);

  assert.equal(getOverviewKpis(project.id).actors, 1);
});

test("getOverviewKpis.actors: proyecto SIN ninguna qualification corrida -- cuenta todos los actores, sin regresión", () => {
  const { project, source } = setup();
  const actorA = upsertActor({ project_id: project.id, source_id: source.id, handle: "actor-a" });
  const actorB = upsertActor({ project_id: project.id, source_id: source.id, handle: "actor-b" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, actor_id: actorA.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, actor_id: actorB.id, content_type: "video" });

  assert.equal(getOverviewKpis(project.id).actors, 2);
});

test("getOverviewKpis.actors: aislamiento por project_id -- un actor IRRELEVANT en un proyecto no afecta el conteo de otro", () => {
  const { project: projectA, source } = setup();
  const projectB = getOrCreateProject(`qualfilter-b-${randomUUID()}`);

  const actorInA = upsertActor({ project_id: projectA.id, source_id: source.id, handle: "actor-a" });
  const { item } = upsertIntelligenceItem({ project_id: projectA.id, source_id: source.id, actor_id: actorInA.id, content_type: "video" });
  markIrrelevant(projectA.slug, projectA.id, item.id);

  assert.equal(getOverviewKpis(projectA.id).actors, 0);
  assert.equal(getOverviewKpis(projectB.id).actors, 0, "proyecto B nunca tuvo actores -- 0 es correcto y no proviene de A");
});
