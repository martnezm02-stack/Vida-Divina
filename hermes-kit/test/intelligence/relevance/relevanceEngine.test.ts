// relevanceEngine.test.ts — evaluateChangeRelevance(): JEV real/mockeado
// vs fallback determinista, sobre ChangeContext puro (sin depender del
// Intelligence Store real para estos casos -- buildChangeContext se
// prueba aparte, integrado).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateChangeRelevance } from "../../../src/lib/intelligence/relevance/relevanceEngine";
import { createJevDecisionProvider } from "../../../src/lib/intelligence/decision";
import type { DecisionProvider } from "../../../src/lib/intelligence/decision";
import type { ChangeContext } from "../../../src/lib/intelligence/relevance/types";

function baseContext(overrides: Partial<ChangeContext> = {}): ChangeContext {
  return {
    change_type: "NEW",
    project: { id: 1, slug: "p" },
    source: "tiktok",
    actor: { external_id: "a1", handle: "vidadivina.oficial", display_name: "Vida Divina" },
    item: { id: 42, external_id: "ext-42", canonical_url: "https://example.com/42" },
    content: { hook: null, angle: null, cta: null, offer: null, format: "video", description_snippet: "Contenido de prueba" },
    metrics_observed: null,
    watchlist: { id: 1, name: "WL", watchlist_type: "keyword" },
    provenance: { watchlistId: 1, runCheckedAt: 1000 },
    ...overrides,
  };
}

test("1) NEW -> relevance evaluable (fallback determinista, sin JEV inyectado)", async () => {
  const decision = await evaluateChangeRelevance(baseContext({ change_type: "NEW" }), null);
  assert.ok(["HIGH", "MEDIUM", "LOW", "IGNORE"].includes(decision.decision));
  assert.equal(decision.provider, "fallback:deterministic");
});

test("2) UPDATED -> relevance evaluable, distingue campo creativo vs no-creativo", async () => {
  const creative = await evaluateChangeRelevance(
    baseContext({ change_type: "UPDATED", updated_fields: ["cta"] }),
    null
  );
  assert.equal(creative.decision, "MEDIUM");

  const nonCreative = await evaluateChangeRelevance(
    baseContext({ change_type: "UPDATED", updated_fields: ["format"] }),
    null
  );
  assert.equal(nonCreative.decision, "LOW");
});

test("3) METRICS_CHANGED -> utiliza delta correctamente (magnitud determina la categoría)", async () => {
  const bigJump = await evaluateChangeRelevance(
    baseContext({
      change_type: "METRICS_CHANGED",
      metrics_delta: { views: { old: 100, new: 300, delta: 200, percent: 2.0 } },
    }),
    null
  );
  assert.equal(bigJump.decision, "HIGH");
  assert.equal(bigJump.evidence.largest_metric_percent_change, 2.0);

  const smallChange = await evaluateChangeRelevance(
    baseContext({
      change_type: "METRICS_CHANGED",
      metrics_delta: { views: { old: 1000, new: 1050, delta: 50, percent: 0.05 } },
    }),
    null
  );
  assert.equal(smallChange.decision, "LOW");

  const noBaseline = await evaluateChangeRelevance(baseContext({ change_type: "METRICS_CHANGED" }), null);
  assert.equal(noBaseline.decision, "LOW", "sin delta calculable -- categoría conservadora, nunca se infla");
});

test("4) UNCHANGED -> IGNORE inmediato, nunca invoca ningún provider", async () => {
  let called = false;
  const provider: DecisionProvider = {
    name: "should-not-be-called",
    classify: () => {
      called = true;
      return { label: "HIGH", confidence: { value: 1 } };
    },
    score: () => ({ score: 1, confidence: { value: 1 } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const decision = await evaluateChangeRelevance(baseContext({ change_type: "UNCHANGED" }), provider);
  assert.equal(decision.decision, "IGNORE");
  assert.equal(called, false, "UNCHANGED nunca debe llegar a invocar un DecisionProvider");
});

test("5) JEV configurado (mockeado, mismo patrón que contextOptimizer.test.ts) -> usa el DecisionProvider real inyectado", async () => {
  const mockJev: DecisionProvider = {
    name: "mock-jev",
    classify: () => ({
      label: "HIGH",
      confidence: { value: 0.87, provenance: { model: "mock-model", probabilities: { HIGH: 0.87, MEDIUM: 0.1, LOW: 0.02, IGNORE: 0.01 } } },
    }),
    score: () => ({ score: 1, confidence: { value: 1 } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const decision = await evaluateChangeRelevance(baseContext(), mockJev);
  assert.equal(decision.decision, "HIGH");
  assert.equal(decision.provider, "mock-jev");
});

test("6) JEV no configurado (createJevDecisionProvider() real, sin key en el entorno de test) -> fallback determinista", async () => {
  const unconfiguredJev = createJevDecisionProvider();
  const decision = await evaluateChangeRelevance(baseContext({ change_type: "NEW" }), unconfiguredJev);
  assert.equal(decision.provider, "fallback:deterministic");
  assert.match(String((decision.provenance as { reason?: string })?.reason ?? ""), /jev/i);
});

test("7) provenance distingue JEV de fallback", async () => {
  const mockJev: DecisionProvider = {
    name: "mock-jev",
    classify: () => ({ label: "MEDIUM", confidence: { value: 0.6 } }),
    score: () => ({ score: 1, confidence: { value: 1 } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const viaJev = await evaluateChangeRelevance(baseContext(), mockJev);
  const viaFallback = await evaluateChangeRelevance(baseContext(), null);
  assert.equal(viaJev.provider, "mock-jev");
  assert.equal(viaFallback.provider, "fallback:deterministic");
  assert.notEqual(viaJev.provider, viaFallback.provider);
});

test("8) confidence/probabilities se conservan cuando JEV las entrega", async () => {
  const mockJev: DecisionProvider = {
    name: "mock-jev",
    classify: () => ({
      label: "MEDIUM",
      confidence: { value: 0.73, provenance: { model: "mock-model", probabilities: { HIGH: 0.2, MEDIUM: 0.73, LOW: 0.05, IGNORE: 0.02 } } },
    }),
    score: () => ({ score: 1, confidence: { value: 1 } }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };
  const decision = await evaluateChangeRelevance(baseContext(), mockJev);
  assert.equal(decision.confidence, 0.73);
  assert.deepEqual((decision.provenance as { probabilities?: unknown })?.probabilities, { HIGH: 0.2, MEDIUM: 0.73, LOW: 0.05, IGNORE: 0.02 });
});

test("9) relevance nunca se interpreta como quality/performance score -- rationale/evidence solo describen evidencia observable", async () => {
  const decision = await evaluateChangeRelevance(
    baseContext({
      change_type: "METRICS_CHANGED",
      metrics_delta: { views: { old: 100, new: 400, delta: 300, percent: 3.0 } },
    }),
    null
  );
  const forbiddenWords = ["exitoso", "bueno", "excelente", "estratégico", "de calidad", "alto rendimiento"];
  for (const word of forbiddenWords) {
    assert.equal(
      decision.rationale.toLowerCase().includes(word),
      false,
      `rationale no debe afirmar juicios de calidad ("${word}")`
    );
  }
  assert.ok(decision.rationale.match(/\d/), "el rationale debe anclarse en un número observable, no una opinión");
});
