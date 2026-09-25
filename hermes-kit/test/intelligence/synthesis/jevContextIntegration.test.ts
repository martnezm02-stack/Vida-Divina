// jevContextIntegration.test.ts — MI-5: JEV real (cliente inyectado, sin
// credenciales de red) conduciendo createDecisionBackedContextOptimizer
// sobre patterns reales de MI-4. Confirma: JEV se usa cuando está
// disponible, provenance distingue jev de fallback, un fallo de JEV nunca
// rompe el flujo, y la evidencia canónica (patterns/items en el Store)
// nunca se modifica como efecto de una decisión de JEV.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  detectPatterns,
  getPatternById,
  createJevDecisionProvider,
  createDecisionBackedContextOptimizer,
  deterministicContextOptimizer,
  withFallback,
} from "../../../src/lib/intelligence";
import type { TypeSafeClientLike } from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function fakeClient(): TypeSafeClientLike {
  return {
    systemOne: async () => ({
      model: "jev-latest",
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: {
        result: {
          type: "score",
          score: 3,
          confidence: 0.8,
          probabilities: { "3": 0.8 },
          legend: { "3": "Muy relevante" },
        },
      },
    }),
  } as unknown as TypeSafeClientLike;
}

function fixtureWithPatterns() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b" });
  const items = [];
  for (let i = 0; i < 2; i++) {
    const { item } = upsertIntelligenceItem({
      project_id: project.id,
      source_id: source.id,
      actor_id: i === 0 ? advertiserA.id : advertiserB.id,
      external_id: `ad-${i}`,
      content_type: "ad",
      hook: "hook compartido de prueba",
      first_seen_at: 1_700_000_000,
      last_seen_at: 1_700_000_000 + 86400,
    });
    items.push(item);
  }
  const detection = detectPatterns({ project_id: project.id, itemIds: items.map((i) => i.id) });
  return { project, detection };
}

// 6. JEV se utiliza cuando está disponible
test("JEV se usa cuando está disponible: createDecisionBackedContextOptimizer llama al cliente inyectado y produce una selección real", async () => {
  const { detection } = fixtureWithPatterns();
  const client = fakeClient();
  const jev = createJevDecisionProvider({ client });
  const optimizer = createDecisionBackedContextOptimizer(jev);

  const relevant = await optimizer.optimize({ items: [], patterns: detection.patterns, actors: [] });
  assert.equal(relevant.optimizer, "decision:jev");
  assert.ok(relevant.selectedCount > 0);
});

// 10. provenance identifica correctamente JEV vs fallback
test("provenance: cuando JEV responde, el optimizer queda como 'decision:jev' (sin prefijo fallback)", async () => {
  const { detection } = fixtureWithPatterns();
  const client = fakeClient();
  const jev = createJevDecisionProvider({ client });
  const withFallbackOptimizer = withFallback(createDecisionBackedContextOptimizer(jev), deterministicContextOptimizer);

  const relevant = await withFallbackOptimizer.optimize({ items: [], patterns: detection.patterns, actors: [] });
  assert.equal(relevant.optimizer, "decision:jev");
  assert.ok(!relevant.optimizer.includes("fallback"));
});

// 8/10. un fallo de JEV nunca rompe el flujo -- cae al fallback determinista, con provenance honesta
test("un fallo real del cliente JEV degrada limpiamente al fallback determinista, con provenance que lo identifica", async () => {
  const { detection } = fixtureWithPatterns();
  const failingClient: TypeSafeClientLike = {
    systemOne: async () => {
      throw new Error("APIError simulado: 503 Service Unavailable");
    },
  } as unknown as TypeSafeClientLike;
  const jev = createJevDecisionProvider({ client: failingClient });
  const resilient = withFallback(createDecisionBackedContextOptimizer(jev), deterministicContextOptimizer);

  const relevant = await resilient.optimize({ items: [], patterns: detection.patterns, actors: [] });
  assert.equal(relevant.optimizer, "fallback:deterministic");
  assert.ok(relevant.selectedCount > 0, "el fallo de JEV no debe dejar la investigación sin resultado");
});

// 11. canonical evidence no es modificada por JEV
test("canonical evidence no se modifica: los patterns en el Store quedan idénticos antes/después de que JEV los puntúe", async () => {
  const { detection } = fixtureWithPatterns();
  const patternId = detection.patterns[0].id;
  const before = getPatternById(patternId);

  const client = fakeClient();
  const jev = createJevDecisionProvider({ client });
  const optimizer = createDecisionBackedContextOptimizer(jev);
  await optimizer.optimize({ items: [], patterns: detection.patterns, actors: [] });

  const after = getPatternById(patternId);
  assert.deepEqual(after, before, "JEV solo produce una selección/score derivado -- nunca escribe en el Intelligence Store");
});
