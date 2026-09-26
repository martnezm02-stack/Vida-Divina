// qualificationRecorder.test.ts — Persistencia idempotente de
// QualificationDecision como signal (MI-1, upsertSignal). Cubre el bug
// real detectado y corregido durante la validación: si signal_type
// incluyera la decisión, re-calificar un item que cambia de categoría
// entre corridas dejaría una fila huérfana en vez de actualizar la misma.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem } from "../../../src/lib/intelligence";
import { recordQualificationSignal, getQualificationByItemId } from "../../../src/lib/intelligence/qualification/qualificationRecorder";
import type { QualificationContext, QualificationDecision } from "../../../src/lib/intelligence/qualification/types";

function setup() {
  const project = getOrCreateProject(`qual-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function decision(category: QualificationDecision["decision"]): QualificationDecision {
  return {
    decision: category,
    confidence: 0.7,
    rationale: "test",
    evidence: {},
    provider: "fallback:deterministic",
    provenance: null,
  };
}

test("recordQualificationSignal: re-calificar el MISMO item con una decisión DISTINTA actualiza la misma fila, nunca deja una huérfana", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  const context: QualificationContext = {
    project: { id: project.id, slug: project.slug },
    brand: { name: "Test Brand", brandTokens: ["testbrand"] },
    item: { id: item.id, canonical_url: null, description_snippet: null, source_metadata_page_name: null },
    actor: null,
  };

  recordQualificationSignal(context, decision("UNCERTAIN"));
  recordQualificationSignal(context, decision("RELEVANT"));

  const map = getQualificationByItemId(project.id);
  assert.equal(map.get(item.id), "RELEVANT", "la decisión más reciente debe prevalecer, sin fila huérfana con la decisión vieja");
});

test("getQualificationByItemId: proyecto sin ninguna qualification corrida -> Map vacío, nunca un default fabricado", () => {
  const project = getOrCreateProject(`qual-empty-${randomUUID()}`);
  const map = getQualificationByItemId(project.id);
  assert.equal(map.size, 0);
});

test("getQualificationByItemId: aislamiento por proyecto -- una qualification de un proyecto nunca aparece en otro", () => {
  const { project: projectA, source } = setup();
  const projectB = getOrCreateProject(`qual-b-${randomUUID()}`);
  const { item } = upsertIntelligenceItem({ project_id: projectA.id, source_id: source.id, content_type: "video" });

  recordQualificationSignal(
    { project: { id: projectA.id, slug: projectA.slug }, brand: { name: "X", brandTokens: ["x"] }, item: { id: item.id, canonical_url: null, description_snippet: null, source_metadata_page_name: null }, actor: null },
    decision("IRRELEVANT")
  );

  assert.equal(getQualificationByItemId(projectA.id).get(item.id), "IRRELEVANT");
  assert.equal(getQualificationByItemId(projectB.id).size, 0);
});
