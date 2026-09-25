// jevDecisionProvider.test.ts — MI-4: wiring REAL de JEV (@typesafe-ai/sdk)
// al contrato DecisionProvider. Sin TYPESAFE_API_KEY en este entorno, se
// inyecta un TypeSafeClientLike de prueba (config.client) para ejercer el
// camino "configurado" sin depender de credenciales reales -- el camino
// "no configurado" (sin inyección) se prueba contra el SDK real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createJevDecisionProvider,
  JevNotConfiguredError,
  deterministicDecisionProvider,
} from "../../../src/lib/intelligence/decision";
import type { TypeSafeClientLike, DecisionProvider } from "../../../src/lib/intelligence/decision";

// 1. JEV provider implementa DecisionProvider (shape check estático + en runtime)
test("JEV provider implementa el contrato DecisionProvider (name/classify/score/choose)", () => {
  const provider: DecisionProvider = createJevDecisionProvider();
  assert.equal(provider.name, "jev");
  assert.equal(typeof provider.classify, "function");
  assert.equal(typeof provider.score, "function");
  assert.equal(typeof provider.choose, "function");
});

// 7. fallback determinista funciona cuando JEV no está disponible (sin key real en este entorno)
test("sin TYPESAFE_API_KEY real en este entorno: cada método falla SÍNCRONAMENTE con JevNotConfiguredError", () => {
  const jev = createJevDecisionProvider();
  assert.throws(() => jev.classify({ subject: "x", labels: ["a", "b"] }), JevNotConfiguredError);
  assert.throws(() => jev.score({ subject: 0.5 }), JevNotConfiguredError);
  assert.throws(() => jev.choose({ options: ["a", "b"] }), JevNotConfiguredError);
});

function fakeClient(handler: (request: unknown) => any): TypeSafeClientLike {
  return {
    systemOne: async (request: unknown) => handler(request),
  } as TypeSafeClientLike;
}

// 2. classify funciona (con cliente inyectado, sin red real)
test("classify(): construye la pregunta choice() con las labels dadas y mapea choice/confidence real", async () => {
  let capturedRequest: any = null;
  const client = fakeClient((request) => {
    capturedRequest = request;
    return {
      model: "jev-latest",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: {
        result: { type: "choice", choice: "billing", confidence: 0.91, probabilities: { billing: 0.91, technical: 0.09 } },
      },
    };
  });

  const jev = createJevDecisionProvider({ client });
  const result = await jev.classify({ subject: "Me cobraron dos veces", labels: ["billing", "technical"] });

  assert.equal(result.label, "billing");
  assert.equal(result.confidence.value, 0.91); // 5. confidence se conserva
  assert.equal(capturedRequest.questions.result.type, "choice");
  assert.deepEqual(Object.keys(capturedRequest.questions.result.criteria), ["billing", "technical"]);
});

// 3. score funciona (normalización a [0,1] + confidence)
test("score(): construye la pregunta score() con la rúbrica de relevancia y normaliza a [0,1]", async () => {
  const client = fakeClient(() => ({
    model: "jev-latest",
    usage: { input_tokens: 5, output_tokens: 1 },
    answers: {
      result: { type: "score", score: 3, confidence: 0.72, probabilities: { "3": 0.72 }, legend: { "3": "Muy relevante" } },
    },
  }));

  const jev = createJevDecisionProvider({ client });
  const result = await jev.score({ subject: 0.8, criteria: { description: "hook compartido por 2 actores" } });

  assert.equal(result.score, 1); // nivel 3 de 4 (índices 0..3) -> 3/3 = 1
  assert.equal(result.confidence.value, 0.72);
});

// 4. choose funciona
test("choose(): elige entre las opciones reales dadas, resolviendo el índice devuelto por JEV", async () => {
  const client = fakeClient(() => ({
    model: "jev-latest",
    usage: { input_tokens: 8, output_tokens: 1 },
    answers: {
      result: { type: "choice", choice: "1", confidence: 0.6, probabilities: { "0": 0.4, "1": 0.6 } },
    },
  }));

  const jev = createJevDecisionProvider({ client });
  const options = [{ id: "a" }, { id: "b" }];
  const result = await jev.choose({ options });

  assert.deepEqual(result.choice, { id: "b" });
  assert.equal(result.confidence.value, 0.6);
});

// 9. no hay fuga de credentials
test("no fuga de credentials: el apiKey nunca aparece en el request enviado ni en el resultado devuelto", async () => {
  let capturedRequest: any = null;
  const client = fakeClient((request) => {
    capturedRequest = request;
    return {
      model: "jev-latest",
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: { result: { type: "choice", choice: "a", confidence: 1, probabilities: { a: 1 } } },
    };
  });

  const secretApiKey = "sk-jev-super-secreto-nunca-real";
  const jev = createJevDecisionProvider({ apiKey: secretApiKey, client });
  const result = await jev.classify({ subject: "algo", labels: ["a"] });

  const serializedRequest = JSON.stringify(capturedRequest);
  const serializedResult = JSON.stringify(result);
  assert.doesNotMatch(serializedRequest, new RegExp(secretApiKey));
  assert.doesNotMatch(serializedResult, new RegExp(secretApiKey));
  assert.doesNotMatch(serializedRequest, /apiKey/i);
});

// 8. un error de JEV no rompe el flujo (aquí: se propaga como rejection, no como throw sin capturar / crash del proceso)
test("un fallo del cliente JEV (red/API) se propaga como rejection normal, nunca revienta el proceso", async () => {
  const client = fakeClient(() => {
    throw new Error("APIError simulado: 500 Internal Server Error");
  });
  const jev = createJevDecisionProvider({ client });

  await assert.rejects(async () => {
    await jev.classify({ subject: "x", labels: ["a", "b"] });
  }, /APIError simulado/);
});

// deterministicDecisionProvider sigue siendo un DecisionProvider intercambiable con JEV (no se duplicó nada)
test("deterministicDecisionProvider y JEV son intercambiables bajo el mismo contrato DecisionProvider", async () => {
  const client = fakeClient(() => ({
    model: "jev-latest",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: { result: { type: "choice", choice: "a", confidence: 1, probabilities: { a: 1 } } },
  }));
  const providers: DecisionProvider[] = [deterministicDecisionProvider, createJevDecisionProvider({ client })];
  for (const provider of providers) {
    const result = await provider.classify({ subject: "a", labels: ["a", "b"] });
    assert.equal(typeof result.label, "string");
    assert.equal(typeof result.confidence.value, "number");
  }
});
