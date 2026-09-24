// patternDetection.test.ts — MI-4: signals, creative/performance/cross-
// actor pattern detection, evidencia, relaciones, idempotencia, aislamiento
// por proyecto, comportamiento con datos insuficientes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  addEvidence,
  recordMetrics,
  listRelationshipsForItem,
  detectPatterns,
  detectPatternsFromQuery,
  getPatternSupportingItems,
  getPatternSupportingActors,
  getPatternSupportingEvidence,
  getPatternSignals,
} from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

/** Fixture realista: 3 actores, 5 anuncios. Un hook compartido por A y B (mercado, 2 actores). Un CTA repetido solo por A (patrón de actor, no de mercado). */
function realisticFixture() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "Vida Divina" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b", display_name: "Competidor B" });
  const advertiserC = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-c", display_name: "Competidor C" });

  const sharedHook = "llevo 30 días tomando esto";
  const sharedCta = "compra ya";

  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "ad-1", content_type: "ad", hook: sharedHook, cta: sharedCta,
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 3 * 86400,
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "ad-2", content_type: "ad", hook: sharedHook, cta: "ordena hoy",
    first_seen_at: 1_700_100_000, last_seen_at: 1_700_100_000 + 3 * 86400,
  });
  const { item: item3 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "ad-3", content_type: "ad", hook: "otro hook distinto", cta: sharedCta,
    first_seen_at: 1_700_200_000, last_seen_at: 1_700_200_000 + 3 * 86400,
  });
  const { item: item4 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserC.id,
    external_id: "ad-4", content_type: "ad", hook: "hook único de C",
    first_seen_at: 1_700_300_000, last_seen_at: 1_700_300_000 + 3 * 86400,
  });
  const { item: item5 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "ad-5", content_type: "ad", hook: "hook único de B",
    first_seen_at: 1_700_400_000, last_seen_at: 1_700_400_000 + 3 * 86400,
  });

  return { project, source, advertiserA, advertiserB, advertiserC, item1, item2, item3, item4, item5, sharedHook, sharedCta };
}

function findPattern(result: ReturnType<typeof detectPatterns>, type: string, key?: string) {
  return result.patterns.find((p) => p.pattern_type === type && (key === undefined || p.pattern_key === key));
}

// 1-2. signal creation + persistence
test("signal creation + persistence: HOOK_FREQUENCY se crea cuando el hook aparece en 2+ items", () => {
  const { project, item1, item2, item3, sharedHook } = realisticFixture();
  const result = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });

  const hookSignal = result.signals.find((s) => s.signal_type === "HOOK_FREQUENCY" && s.signal_key === sharedHook);
  assert.ok(hookSignal, "debe existir una señal HOOK_FREQUENCY para el hook compartido");
  assert.equal(hookSignal!.project_id, project.id);
  assert.ok(hookSignal!.strength! > 0 && hookSignal!.strength! <= 1);

  // No debe haber señal para un hook que aparece una sola vez.
  assert.ok(!result.signals.some((s) => s.signal_type === "HOOK_FREQUENCY" && s.signal_key === "otro hook distinto"));
});

// 3-4. deterministic + creative pattern detection
test("creative pattern detection: repetición de hook queda persistida con frecuencia/soporte correctos", () => {
  const { project, item1, item2, item3, sharedHook } = realisticFixture();
  const result = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });

  const pattern = findPattern(result, "creative_hook_repetition", sharedHook);
  assert.ok(pattern, "debe detectarse el patrón de repetición de hook");
  assert.equal(pattern!.item_support, 2);
  assert.equal(pattern!.total_items_examined, 3);
  assert.ok(Math.abs(pattern!.frequency! - 2 / 3) < 1e-9);
  assert.equal(pattern!.confidence, pattern!.frequency, "confidence es la medida de soporte, no una evaluación de calidad");
});

// 5-6. cross-actor detection: actor-only repetition vs market pattern
test("cross-actor detection: hook sustentado por 2 actores es 'market'; CTA sustentado por 1 actor es 'actor'", () => {
  const { project, item1, item2, item3, sharedHook, sharedCta } = realisticFixture();
  const result = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });

  const hookPattern = findPattern(result, "creative_hook_repetition", sharedHook);
  assert.equal(hookPattern!.scope, "market", "2 actores distintos sustentan el hook -> patrón de mercado");
  assert.equal(hookPattern!.actor_support, 2);

  const ctaPattern = findPattern(result, "creative_cta_repetition", sharedCta);
  assert.ok(ctaPattern, "debe detectarse la repetición del CTA (mismo actor, 2 anuncios)");
  assert.equal(ctaPattern!.scope, "actor", "un solo actor sustenta el CTA -> patrón de actor, nunca de mercado");
  assert.equal(ctaPattern!.actor_support, 1);
});

// 7. frequency/ratio calculation (cubierto también arriba) -- caso adicional con más items
test("frequency/ratio: 2 de 5 items examinados = 0.4 exacto", () => {
  const { project, item1, item2, item3, item4, item5, sharedHook } = realisticFixture();
  const result = detectPatterns({
    project_id: project.id,
    itemIds: [item1.id, item2.id, item3.id, item4.id, item5.id],
  });
  const pattern = findPattern(result, "creative_hook_repetition", sharedHook);
  assert.equal(pattern!.frequency, 0.4);
  assert.equal(pattern!.total_items_examined, 5);
});

// 8. temporal pattern detection
test("temporal pattern: performance_growth_trend solo con >=2 snapshots por item y >= minSupport items creciendo", () => {
  const { project, source } = setup();
  const { item: itemA } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "growth-1", content_type: "ad" });
  const { item: itemB } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, external_id: "growth-2", content_type: "ad" });

  recordMetrics({ item_id: itemA.id, views: 1000, captured_at: 1_700_000_000 });
  recordMetrics({ item_id: itemA.id, views: 5000, captured_at: 1_700_100_000 });
  recordMetrics({ item_id: itemB.id, views: 2000, captured_at: 1_700_000_000 });
  recordMetrics({ item_id: itemB.id, views: 9000, captured_at: 1_700_100_000 });

  const result = detectPatterns({ project_id: project.id, itemIds: [itemA.id, itemB.id] });
  const pattern = findPattern(result, "performance_growth_trend");
  assert.ok(pattern, "debe detectarse la tendencia de crecimiento");
  assert.equal(pattern!.item_support, 2);
});

// 9. supporting evidence
test("supporting evidence: getPatternSupportingEvidence recupera la evidencia de los items del patrón", () => {
  const { project, item1, item2, item3, sharedHook } = realisticFixture();
  const ev1 = addEvidence({ item_id: item1.id, kind: "transcript_fragment", content: "evidencia 1" });
  const ev2 = addEvidence({ item_id: item2.id, kind: "transcript_fragment", content: "evidencia 2" });

  const result = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  const pattern = findPattern(result, "creative_hook_repetition", sharedHook)!;

  const evidenceIds = getPatternSupportingEvidence(pattern.id);
  assert.ok(evidenceIds.includes(ev1.id));
  assert.ok(evidenceIds.includes(ev2.id));

  const supportingItems = getPatternSupportingItems(pattern.id);
  assert.deepEqual([...supportingItems].sort(), [item1.id, item2.id].sort());

  const supportingActors = getPatternSupportingActors(pattern.id);
  assert.equal(supportingActors.length, 2);

  const signals = getPatternSignals(pattern.id);
  assert.ok(signals.some((s) => s.signal_type === "HOOK_FREQUENCY"));
});

// 10. item relationships
test("item relationships: SAME_HOOK y SAME_ACTOR se crean entre pares que comparten valor/actor", () => {
  const { project, item1, item2, item3 } = realisticFixture();
  const result = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  assert.ok(result.relationshipsCreated > 0);

  const rels1 = listRelationshipsForItem(item1.id);
  assert.ok(rels1.some((r) => r.related_item_id === item2.id && r.relation_type === "SAME_HOOK"));
  assert.ok(rels1.some((r) => r.related_item_id === item3.id && r.relation_type === "SAME_ACTOR"));
});

// 11. idempotent repeated detection
test("idempotent repeated detection: repetir sobre el mismo conjunto no duplica patterns/signals/relationships", () => {
  const { project, item1, item2, item3 } = realisticFixture();

  const first = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });
  const second = detectPatterns({ project_id: project.id, itemIds: [item1.id, item2.id, item3.id] });

  assert.equal(first.patterns.length, second.patterns.length);
  for (const p of second.patterns) {
    const before = first.patterns.find((x) => x.pattern_type === p.pattern_type && x.pattern_key === p.pattern_key);
    assert.ok(before, `el patrón ${p.pattern_type}:${p.pattern_key} debe seguir existiendo`);
    assert.equal(p.id, before!.id, "no debe crear una fila nueva para el mismo patrón");
  }
  assert.equal(second.relationshipsCreated, 0, "las relaciones ya creadas no deben duplicarse en la segunda pasada");
});

// 12. project isolation
test("project isolation: detectar sobre un proyecto no crea/afecta patterns de otro", () => {
  const fixtureA = realisticFixture();
  const fixtureB = realisticFixture();

  const resultA = detectPatterns({ project_id: fixtureA.project.id, itemIds: [fixtureA.item1.id, fixtureA.item2.id, fixtureA.item3.id] });
  const resultB = detectPatterns({ project_id: fixtureB.project.id, itemIds: [fixtureB.item1.id, fixtureB.item2.id, fixtureB.item3.id] });

  for (const p of resultA.patterns) assert.equal(p.project_id, fixtureA.project.id);
  for (const p of resultB.patterns) assert.equal(p.project_id, fixtureB.project.id);
  assert.notEqual(resultA.patterns[0].id, resultB.patterns[0]?.id);
});

// 13. insufficient-data behavior
test("insuficient data: un solo item, o un solo snapshot de métricas, no produce signals/patterns fabricados", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, external_id: "solo-item", content_type: "ad", hook: "hook solitario",
  });
  recordMetrics({ item_id: item.id, views: 1000, captured_at: 1_700_000_000 });

  const result = detectPatterns({ project_id: project.id, itemIds: [item.id] });
  assert.equal(result.signals.length, 0, "un solo item no puede sustentar una señal de repetición");
  assert.equal(result.patterns.length, 0, "un solo snapshot no permite declarar tendencia; un solo item no permite declarar repetición");
});

// 15. query-driven execution
test("query-driven execution: detectPatternsFromQuery resuelve el conjunto vía búsqueda existente", () => {
  const { project, item1, item2, item3 } = realisticFixture();

  const result = detectPatternsFromQuery({ project_id: project.id, query: { project_id: project.id, content_type: "ad" } });
  assert.ok(result.itemsExamined.length >= 3);
  assert.ok(result.itemsExamined.includes(item1.id));
  assert.ok(result.itemsExamined.includes(item2.id));
  assert.ok(result.itemsExamined.includes(item3.id));
});
