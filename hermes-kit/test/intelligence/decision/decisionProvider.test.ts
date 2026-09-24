// decisionProvider.test.ts — DecisionProvider: la interfaz es usable con
// un provider determinista sin JEV, y el adaptador de JEV sin configurar
// falla de forma clara e inmediata (nunca bloquea, nunca pide credenciales).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deterministicDecisionProvider,
  createJevDecisionProvider,
  JevNotConfiguredError,
} from "../../../src/lib/intelligence/decision";
import type { DecisionProvider } from "../../../src/lib/intelligence/decision";

test("deterministicDecisionProvider.classify: match exacto por string, con confidence 1", async () => {
  const result = await deterministicDecisionProvider.classify({
    subject: "market",
    labels: ["actor", "market"],
  });
  assert.equal(result.label, "market");
  assert.equal(result.confidence.value, 1);
});

test("deterministicDecisionProvider.classify: sin match -> primera etiqueta, confidence reducida", async () => {
  const result = await deterministicDecisionProvider.classify({
    subject: "algo-que-no-esta-en-la-lista",
    labels: ["a", "b", "c"],
  });
  assert.equal(result.label, "a");
  assert.ok(result.confidence.value < 1);
});

test("deterministicDecisionProvider.score: clamp numérico a [0,1]", async () => {
  assert.equal((await deterministicDecisionProvider.score({ subject: 0.42 })).score, 0.42);
  assert.equal((await deterministicDecisionProvider.score({ subject: 5 })).score, 1);
  assert.equal((await deterministicDecisionProvider.score({ subject: -5 })).score, 0);
  assert.equal((await deterministicDecisionProvider.score({ subject: "no-numérico" })).score, 0);
});

test("deterministicDecisionProvider.choose: devuelve una opción real del conjunto", async () => {
  const options = ["opcion-a", "opcion-b"];
  const result = await deterministicDecisionProvider.choose({ options });
  assert.ok(options.includes(result.choice));
});

test("provider abstraction: cualquier objeto con la forma DecisionProvider es intercambiable", async () => {
  const customProvider: DecisionProvider = {
    name: "custom-test-provider",
    classify: async () => ({ label: "custom", confidence: { value: 0.9 } }),
    score: async () => ({ score: 0.7, confidence: { value: 0.9 } }),
    choose: async ({ options }) => ({ choice: options[0], confidence: { value: 0.5 } }),
  };
  const result = await customProvider.classify({ subject: "x", labels: ["custom"] });
  assert.equal(result.label, "custom");
});

test("JEV sin configurar: cada método falla de inmediato con JevNotConfiguredError, sin red ni credenciales", () => {
  const jev = createJevDecisionProvider();
  assert.equal(jev.name, "jev");
  assert.throws(() => jev.classify({ subject: "x", labels: ["a"] }), JevNotConfiguredError);
  assert.throws(() => jev.score({ subject: "x" }), JevNotConfiguredError);
  assert.throws(() => jev.choose({ options: ["a"] }), JevNotConfiguredError);
});

test("JEV con config sin apiKey real sigue tratándose como no configurado", () => {
  const jev = createJevDecisionProvider({});
  assert.throws(() => jev.classify({ subject: "x", labels: ["a"] }), JevNotConfiguredError);
});
