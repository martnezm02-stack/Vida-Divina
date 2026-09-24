// contextOptimizer.test.ts — MI-5: abstracción ContextOptimizer,
// integración con DecisionProvider (JEV u otro), fallback cuando JEV no
// está disponible, provenance de la selección hecha por JEV, y presupuesto
// de contexto (maxPatterns/maxItems/maxEvidence/maxTokens/relevanceThreshold).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  addEvidence,
  detectPatterns,
  createJevDecisionProvider,
  deterministicContextOptimizer,
  createDecisionBackedContextOptimizer,
  withFallback,
} from "../../../src/lib/intelligence";
import type { DecisionProvider, ContextCandidates } from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

/** 3 patrones con distinta frecuencia/confidence: hook (0.66), angle (1.0 sobre subconjunto), format (0.5). */
function fixtureWithMultiplePatterns() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "A" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b", display_name: "B" });

  const items = [];
  for (let i = 0; i < 3; i++) {
    const { item } = upsertIntelligenceItem({
      project_id: project.id, source_id: source.id, actor_id: i % 2 === 0 ? advertiserA.id : advertiserB.id,
      external_id: `ad-${i}`, content_type: "ad",
      hook: "hook compartido", angle: i < 2 ? "angle compartido" : "angle distinto", format: i === 0 ? "video" : "imagen",
      first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 86400,
    });
    addEvidence({ item_id: item.id, kind: "source_url", url: `https://example.com/${i}` });
    items.push(item);
  }

  const detection = detectPatterns({ project_id: project.id, itemIds: items.map((i) => i.id) });
  return { project, items, detection };
}

// 17. ContextOptimizer abstraction
test("ContextOptimizer abstraction: deterministic selecciona y rankea por confidence del pattern", async () => {
  const { project, detection } = fixtureWithMultiplePatterns();
  const candidates: ContextCandidates = { items: [], patterns: detection.patterns, actors: [] };
  const relevant = await deterministicContextOptimizer.optimize(candidates);

  assert.equal(relevant.optimizer, "deterministic");
  assert.equal(relevant.totalCandidates, detection.patterns.length);
  for (let i = 1; i < relevant.entries.filter((e) => e.kind === "pattern").length; i++) {
    const patternEntries = relevant.entries.filter((e) => e.kind === "pattern");
    assert.ok(patternEntries[i - 1].relevance >= patternEntries[i].relevance, "debe venir ordenado por relevancia descendente");
  }
  void project;
});

// 16. DecisionProvider integration
test("DecisionProvider integration: createDecisionBackedContextOptimizer usa .score() de cualquier DecisionProvider", async () => {
  const { detection } = fixtureWithMultiplePatterns();
  const reversedScoreProvider: DecisionProvider = {
    name: "reversed-mock",
    classify: () => ({ label: "x", confidence: { value: 1 } }),
    // Invierte el orden: el pattern con MENOR confidence determinista gana más score aquí,
    // demostrando que el optimizer usa el score del provider, no pattern.confidence directamente.
    score: ({ subject }) => ({ score: 1 - (subject as number), confidence: { value: 1 } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const optimizer = createDecisionBackedContextOptimizer(reversedScoreProvider);
  const candidates: ContextCandidates = { items: [], patterns: detection.patterns, actors: [] };
  const relevant = await optimizer.optimize(candidates);

  assert.equal(relevant.optimizer, "decision:reversed-mock");
  const lowestConfidencePattern = [...detection.patterns].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))[0];
  assert.equal(relevant.patternIds[0], lowestConfidencePattern.id, "con score invertido, el de menor confidence debe quedar primero");
});

// 18. JEV-unavailable fallback
test("JEV-unavailable fallback: withFallback degrada automáticamente al determinista sin bloquear", async () => {
  const { detection } = fixtureWithMultiplePatterns();
  const unconfiguredJev = createDecisionBackedContextOptimizer(createJevDecisionProvider());
  const withFallbackOptimizer = withFallback(unconfiguredJev, deterministicContextOptimizer);

  const candidates: ContextCandidates = { items: [], patterns: detection.patterns, actors: [] };
  const relevant = await withFallbackOptimizer.optimize(candidates);

  assert.ok(relevant.optimizer.includes("fallback:deterministic"));
  assert.ok(relevant.selectedCount > 0, "debe producir una selección real vía el fallback, no quedar vacío/bloqueado");
});

// 19. JEV-selected-context provenance
test("JEV-selected-context provenance: cuando JEV participa, el nombre del optimizer y la selección quedan trazables", async () => {
  const { detection } = fixtureWithMultiplePatterns();
  const mockJev: DecisionProvider = {
    name: "mock-jev",
    classify: () => ({ label: "x", confidence: { value: 1 } }),
    score: ({ subject }) => ({ score: subject as number, confidence: { value: 0.9, provenance: "mock-jev heuristic" } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const optimizer = createDecisionBackedContextOptimizer(mockJev);
  const candidates: ContextCandidates = { items: [], patterns: detection.patterns, actors: [] };
  const relevant = await optimizer.optimize(candidates);

  assert.equal(relevant.optimizer, "decision:mock-jev");
  assert.ok(relevant.patternIds.length > 0);
  // Toda referencia seleccionada sigue apuntando a un pattern real -- nunca contenido sintetizado sin origen.
  for (const id of relevant.patternIds) {
    assert.ok(detection.patterns.some((p) => p.id === id));
  }
});

// 21. context budget
test("context budget: maxPatterns/relevanceThreshold limitan la selección de forma predecible", async () => {
  const { detection } = fixtureWithMultiplePatterns();
  const candidates: ContextCandidates = { items: [], patterns: detection.patterns, actors: [] };

  const capped = await deterministicContextOptimizer.optimize(candidates, { maxPatterns: 1 });
  assert.equal(capped.selectedCount, 1);

  const highThreshold = await deterministicContextOptimizer.optimize(candidates, { relevanceThreshold: 1.01 });
  assert.equal(highThreshold.selectedCount, 0, "ningún pattern puede superar un umbral imposible (>1)");
});
