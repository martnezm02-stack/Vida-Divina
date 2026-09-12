// systemPrompt.test.ts — instrucción de idioma real en el system prompt
// (FASE "Idioma de la conversación", 2026-09-12). Contra prompts/negocio.md
// real (sin mocks): confirma que la regla rígida anterior ya no existe y
// que la instrucción de idioma real cambia según el parámetro `language`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSystemPrompt } from "../src/lib/system-prompt";

test("buildSystemPrompt: sin language explícito -> instrucción real en español (compatibilidad, comportamiento de siempre)", () => {
  const prompt = buildSystemPrompt("");
  assert.match(prompt, /Idioma de esta respuesta: español/i);
});

test("buildSystemPrompt: language='en' -> instrucción real en inglés", () => {
  const prompt = buildSystemPrompt("", "en");
  assert.match(prompt, /Idioma de esta respuesta: inglés/i);
});

test("buildSystemPrompt: language='es' -> instrucción real en español", () => {
  const prompt = buildSystemPrompt("", "es");
  assert.match(prompt, /Idioma de esta respuesta: español/i);
});

test("ya NO existe la regla rígida anterior ('responde siempre en español')", () => {
  const prompt = buildSystemPrompt("", "en");
  assert.doesNotMatch(prompt, /responde siempre en español/i);
});

test("prompts/negocio.md real ya no tiene la regla rígida anterior", () => {
  const negocio = fs.readFileSync(path.resolve(process.cwd(), "prompts", "negocio.md"), "utf-8");
  assert.doesNotMatch(negocio, /responde siempre en español.*aunque te escriban en otro idioma/i);
  assert.match(negocio, /idioma real detectado/i);
});
