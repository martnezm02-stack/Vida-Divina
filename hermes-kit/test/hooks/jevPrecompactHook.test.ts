// jevPrecompactHook.test.ts — Hook PreCompact respaldado por JEV: parseo
// tolerante del payload, extracción de candidatos del transcript, ranking
// vía DecisionProvider, y fallback determinista cuando JEV no está
// disponible (nunca bloquea, nunca exige credenciales).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  BASELINE_INSTRUCTIONS,
  buildCustomInstructions,
  extractText,
  parsePayload,
  readRecentCandidates,
} from "../../src/lib/hooks/jevPrecompactHook";
import { createJevDecisionProvider } from "../../src/lib/intelligence/decision";
import type { DecisionProvider } from "../../src/lib/intelligence/decision";

function writeTempTranscript(lines: string[]): string {
  const file = path.join(os.tmpdir(), `jev-precompact-test-${randomUUID()}.jsonl`);
  fs.writeFileSync(file, lines.join("\n"), "utf-8");
  return file;
}

test("parsePayload: JSON válido se parsea; vacío/inválido -> objeto vacío, nunca lanza", () => {
  assert.deepEqual(parsePayload('{"trigger":"auto"}'), { trigger: "auto" });
  assert.deepEqual(parsePayload(""), {});
  assert.deepEqual(parsePayload("   "), {});
  assert.deepEqual(parsePayload("no es json"), {});
});

test("extractText: soporta content string y content en bloques [{type,text}]; shapes desconocidos -> null", () => {
  assert.equal(extractText({ message: { role: "user", content: "hola" } }), "hola");
  assert.equal(
    extractText({ message: { role: "assistant", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }),
    "a b"
  );
  assert.equal(extractText({ message: { role: "user", content: 123 } }), null);
  assert.equal(extractText(null), null);
  assert.equal(extractText({}), null);
});

test("readRecentCandidates: transcript ausente o con ruta inválida -> lista vacía, nunca lanza", () => {
  assert.deepEqual(readRecentCandidates(undefined), []);
  assert.deepEqual(readRecentCandidates("/ruta/que/no/existe.jsonl"), []);
});

test("readRecentCandidates: extrae texto de líneas válidas y descarta líneas malformadas", () => {
  const file = writeTempTranscript([
    JSON.stringify({ type: "user", message: { role: "user", content: "primer mensaje" } }),
    "esto no es json valido {{{",
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "segunda respuesta" }] } }),
    "",
  ]);
  const candidates = readRecentCandidates(file);
  fs.rmSync(file, { force: true });

  assert.deepEqual(candidates, ["primer mensaje", "segunda respuesta"]);
});

test("buildCustomInstructions: sin transcript, siempre devuelve el baseline (con o sin JEV)", async () => {
  const jev = createJevDecisionProvider(); // no configurado
  const result = await buildCustomInstructions({ trigger: "auto" }, jev);
  assert.equal(result, BASELINE_INSTRUCTIONS);
});

test("buildCustomInstructions: JEV no configurado (sin credenciales) -> degrada al baseline, nunca lanza", async () => {
  const file = writeTempTranscript([
    JSON.stringify({ type: "user", message: { role: "user", content: "instrucción importante a preservar" } }),
  ]);
  const jev = createJevDecisionProvider(); // sin JEV_API_KEY
  const result = await buildCustomInstructions({ trigger: "threshold", transcript_path: file }, jev);
  fs.rmSync(file, { force: true });

  assert.equal(result, BASELINE_INSTRUCTIONS, "sin JEV real, nunca debe inventar highlights ni fallar");
});

test("buildCustomInstructions: con un DecisionProvider real (mock), añade los highlights priorizados por relevancia", async () => {
  const file = writeTempTranscript([
    JSON.stringify({ type: "user", message: { role: "user", content: "mensaje poco relevante" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "decisión arquitectónica crítica" } }),
  ]);

  const mockJev: DecisionProvider = {
    name: "mock-jev",
    classify: () => ({ label: "x", confidence: { value: 1 } }),
    score: ({ subject }) => ({
      score: (subject as string).includes("crítica") ? 0.95 : 0.1,
      confidence: { value: 0.9 },
    }),
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };

  const result = await buildCustomInstructions({ trigger: "auto", transcript_path: file }, mockJev);
  fs.rmSync(file, { force: true });

  assert.ok(result.startsWith(BASELINE_INSTRUCTIONS), "el baseline siempre debe seguir presente");
  assert.ok(result.includes("JEV priorizó"));
  assert.ok(result.includes("decisión arquitectónica crítica"));
  const criticalIndex = result.indexOf("decisión arquitectónica crítica");
  const otherIndex = result.indexOf("mensaje poco relevante");
  assert.ok(criticalIndex !== -1 && (otherIndex === -1 || criticalIndex < otherIndex), "el fragmento más relevante debe listarse primero");
});

test("buildCustomInstructions: nunca lanza aunque el DecisionProvider falle a mitad de la lista", async () => {
  const file = writeTempTranscript([
    JSON.stringify({ type: "user", message: { role: "user", content: "primero" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "segundo" } }),
  ]);
  const flakyJev: DecisionProvider = {
    name: "flaky",
    classify: () => ({ label: "x", confidence: { value: 1 } }),
    score: () => {
      throw new Error("fallo simulado de red");
    },
    choose: ({ options }) => ({ choice: options[0], confidence: { value: 1 } }),
  };

  const result = await buildCustomInstructions({ trigger: "auto", transcript_path: file }, flakyJev);
  fs.rmSync(file, { force: true });

  assert.equal(result, BASELINE_INSTRUCTIONS);
});
