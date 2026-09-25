// semanticCreativeAnalysisProvider.test.ts — MI-3 Semantic Creative
// Analysis: separación fact/inference, selección de candidatos REALES del
// texto (nunca generados), "ninguno" nunca se fuerza a completar el
// esquema, fallback conservador cuando no hay DecisionProvider, y la
// integración con intelligence_items (MI-4 lee esas columnas directo, ver
// detection/featureExtraction.ts) sin sobrescribir hechos ya observados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecisionProvider } from "../../../src/lib/intelligence/decision";
import {
  createSemanticCreativeAnalysisProvider,
  applySemanticCreativeAnalysis,
  analyzeItems,
  getOrCreateProject,
  upsertIntelligenceItem,
  getIntelligenceItemById,
  withActiveDays,
} from "../../../src/lib/intelligence";

/** Doble determinista: simula "comprensión real" eligiendo, para cada
 * elemento (identificado por su `context`), el candidato que contiene una
 * palabra clave fija -- nunca la primera opción por defecto (a diferencia
 * de deterministicDecisionProvider), así las pruebas distinguen selección
 * real de "cae al primero". */
function fakeSemanticJev(pickByKeyword: Record<string, string>): DecisionProvider {
  return {
    name: "fake-semantic-jev",
    classify: async ({ labels, context }) => {
      const ctx = String(context ?? "");
      for (const [elementLabel, keyword] of Object.entries(pickByKeyword)) {
        // Ancla al inicio exacto de la etiqueta del elemento ("identificar:
        // {elementLabel}.") -- un `.includes(elementLabel)` suelto choca
        // falsamente (p.ej. "CTA" es substring literal de "exaCTAmente" en
        // la instrucción compartida "Elige EXACTAMENTE...").
        if (ctx.includes(`identificar: ${elementLabel}.`)) {
          const match = labels.find((l) => l.toLowerCase().includes(keyword.toLowerCase()));
          if (match) return { label: match, confidence: { value: 0.92 } };
        }
      }
      // Sin señal configurada para este elemento -> "ninguno" (nunca adivina).
      const none = labels[labels.length - 1];
      return { label: none, confidence: { value: 0.4 } };
    },
    score: async () => ({ score: 0, confidence: { value: 0 } }),
    choose: async ({ options }) => ({ choice: options[0], confidence: { value: 0 } }),
  };
}

test("elementos tipo span: selecciona SUBCADENAS reales del texto observado, nunca las reescribe", async () => {
  const project = `semantic-span-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    description:
      "¿Cansada de dietas que no funcionan? Miles de mujeres ya lograron bajar de peso sin pasar hambre. " +
      "Nuestro método usa fibra natural que reduce el apetito. Compra ahora con 20% de descuento.",
  });

  const jev = fakeSemanticJev({
    Hook: "cansada",
    "Problem/Pain": "dietas que no funcionan",
    Promise: "bajar de peso sin pasar hambre",
    Mechanism: "fibra natural",
    CTA: "compra ahora",
  });
  const provider = createSemanticCreativeAnalysisProvider(jev);
  const result = await analyzeItems({ project_id: projectRow.id, itemIds: [item.id], analysisType: "semantic_creative_test" }, provider);

  assert.equal(result.cached, false);
  const parsed = JSON.parse(result.run.result_json) as { inferred: { items: Record<number, { elements: Record<string, string | null> }> } };
  const elements = parsed.inferred.items[item.id].elements;

  assert.ok(elements.hook?.toLowerCase().includes("cansada"), "hook debe ser la frase real que contiene la palabra clave");
  assert.ok(elements.problem?.toLowerCase().includes("dietas que no funcionan"));
  assert.ok(elements.promise?.toLowerCase().includes("bajar de peso"));
  assert.ok(elements.mechanism?.toLowerCase().includes("fibra natural"));
  assert.ok(elements.cta?.toLowerCase().includes("compra ahora"));
  // Sin señal configurada para angle/offer -> el doble elige "ninguno" -> null, nunca inventado.
  assert.equal(elements.angle, null);
  assert.equal(elements.offer, null);
});

test("sin señal suficiente: el elemento queda null -- nunca se fuerza a completar el esquema", async () => {
  const project = `semantic-none-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "post",
    description: "Un texto genérico sin ningún elemento creativo identificable.",
  });

  const jev = fakeSemanticJev({}); // ninguna keyword configurada -> todo "ninguno"
  const provider = createSemanticCreativeAnalysisProvider(jev);
  const result = await analyzeItems({ project_id: projectRow.id, itemIds: [item.id], analysisType: "semantic_creative_test" }, provider);
  const parsed = JSON.parse(result.run.result_json) as { inferred: { items: Record<number, { elements: Record<string, string | null> }> } };
  const elements = parsed.inferred.items[item.id].elements;

  for (const key of ["hook", "problem", "angle", "promise", "mechanism", "offer", "cta"]) {
    assert.equal(elements[key], null, `${key} debe quedar null sin señal suficiente`);
  }
});

test("item sin texto observado: nada que interpretar, todo null, nunca lanza", async () => {
  const project = `semantic-empty-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "ad",
  });

  const jev = fakeSemanticJev({ Hook: "cualquier-cosa" });
  const provider = createSemanticCreativeAnalysisProvider(jev);
  const result = await analyzeItems({ project_id: projectRow.id, itemIds: [item.id], analysisType: "semantic_creative_test" }, provider);
  const parsed = JSON.parse(result.run.result_json) as { inferred: { items: Record<number, { elements: Record<string, string | null> }> } };
  assert.equal(parsed.inferred.items[item.id].elements.hook, null);
});

test("fallback determinista (sin DecisionProvider): solo CTA por frase explícita, el resto queda null a propósito", async () => {
  const project = `semantic-fallback-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    description: "Este producto es increíble y cambió mi vida. Escríbenos para más información.",
  });

  const provider = createSemanticCreativeAnalysisProvider(null); // fuerza el fallback conservador
  const result = await analyzeItems({ project_id: projectRow.id, itemIds: [item.id], analysisType: "semantic_creative_test" }, provider);
  const parsed = JSON.parse(result.run.result_json) as { inferred: { items: Record<number, { elements: Record<string, string | null> }> } };
  const elements = parsed.inferred.items[item.id].elements;

  assert.ok(elements.cta?.toLowerCase().includes("escríbenos"), "CTA se detecta por frase explícita incluso sin JEV");
  // El resto NUNCA se inventa solo porque hay texto -- la primera frase
  // ("Este producto es increíble...") no se convierte automáticamente en hook.
  assert.equal(elements.hook, null);
  assert.equal(elements.problem, null);
  assert.equal(elements.angle, null);
  assert.equal(elements.promise, null);
  assert.equal(elements.mechanism, null);
  assert.equal(elements.offer, null);
});

test("un fallo real de JEV (throw) degrada limpiamente elemento por elemento, nunca rompe el análisis completo", async () => {
  const project = `semantic-jev-throws-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    description: "Compra ahora este producto increíble.",
  });

  const throwingJev: DecisionProvider = {
    name: "throwing-jev",
    classify: async () => {
      throw new Error("simulated JEV outage");
    },
    score: async () => ({ score: 0, confidence: { value: 0 } }),
    choose: async ({ options }) => ({ choice: options[0], confidence: { value: 0 } }),
  };
  const provider = createSemanticCreativeAnalysisProvider(throwingJev);
  const result = await analyzeItems({ project_id: projectRow.id, itemIds: [item.id], analysisType: "semantic_creative_test" }, provider);
  const parsed = JSON.parse(result.run.result_json) as {
    inferred: { items: Record<number, { elements: Record<string, string | null> }> ; degraded_to_fallback: boolean };
  };
  assert.equal(parsed.inferred.degraded_to_fallback, true);
  // Con JEV caído, cae al mismo fallback conservador -- CTA sigue detectable por frase explícita.
  assert.ok(parsed.inferred.items[item.id].elements.cta?.toLowerCase().includes("compra ahora"));
});

test("applySemanticCreativeAnalysis: escribe solo columnas NULL en intelligence_items -- nunca sobrescribe un hecho ya observado", async () => {
  const project = `semantic-apply-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const { item: item1 } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    description: "¿Cansada de dietas? Compra ahora.",
    hook: "hook observado directamente de la fuente", // YA tiene hook -- no debe tocarse
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: projectRow.id,
    source_id: 1,
    content_type: "video",
    description: "¿Cansada de dietas? Compra ahora.",
  });

  const jev = fakeSemanticJev({ Hook: "cansada", CTA: "compra ahora" });
  const provider = createSemanticCreativeAnalysisProvider(jev);
  const result = await analyzeItems(
    { project_id: projectRow.id, itemIds: [item1.id, item2.id], analysisType: "semantic_creative_test" },
    provider
  );
  const parsed = JSON.parse(result.run.result_json) as {
    inferred: { items: Record<number, { elements: Record<string, string | null> }> };
  };

  const { updatedItemIds } = applySemanticCreativeAnalysis(
    [withActiveDays(item1), withActiveDays(item2)],
    parsed.inferred.items
  );

  assert.ok(updatedItemIds.includes(item2.id), "item2 (sin hook previo) debe actualizarse");

  const reloaded1 = getIntelligenceItemById(item1.id)!;
  const reloaded2 = getIntelligenceItemById(item2.id)!;
  assert.equal(reloaded1.hook, "hook observado directamente de la fuente", "un hecho ya observado NUNCA se sobrescribe con una inferencia");
  assert.ok(reloaded2.hook?.toLowerCase().includes("cansada"), "item sin hook previo sí recibe el inferido");
  assert.ok(reloaded2.cta?.toLowerCase().includes("compra ahora"));
});
