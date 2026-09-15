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

test("buildSystemPrompt: language='en' -> instrucción real en inglés, prioritaria y con directiva de traducción (endurecida 2026-09-12 tras hallazgo real: el catálogo/tools están siempre en español y competían contra esta instrucción)", () => {
  const prompt = buildSystemPrompt("", "en");
  assert.match(prompt, /PRIORITY.*reply language:\s*ENGLISH/i);
  assert.match(prompt, /write your own English sentences/i);
  assert.match(prompt, /never copy a Spanish sentence/i);
});

test("buildSystemPrompt: language='es' -> instrucción real en español, prioritaria", () => {
  const prompt = buildSystemPrompt("", "es");
  assert.match(prompt, /PRIORIDAD.*idioma de esta respuesta:\s*ESPAÑOL/i);
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

test("Nombre visible (2026-09-12): la instrucción de idioma remite al nombre que dé la tool, nunca deja que el LLM elija entre variantes por su cuenta", () => {
  assert.match(buildSystemPrompt("", "es"), /nombre a usar con el cliente/i);
  assert.match(buildSystemPrompt("", "en"), /name a tool gives you/i);
});

test("Corrección real 2026-09-17: prompts/negocio.md prohíbe explícitamente pedir correo electrónico para comprar/pagar, con el cierre correcto tras dar precio/info", () => {
  const prompt = buildSystemPrompt("", "es");
  assert.match(prompt, /Nunca pidas correo electrónico ni otros datos personales para continuar/i);
  assert.match(prompt, /realizar tu pedido o necesitas más información, ¡dímelo!/i);
  // El ejemplo "incorrecto" documentado es justo la frase real que se
  // reportó en producción -- se busca en el bloque "No hagas esto", nunca
  // como instrucción real a seguir.
  assert.match(prompt, /proporcionar tu correo electrónico para continuar con el proceso de pago/i);
});
