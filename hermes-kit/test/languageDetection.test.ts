// languageDetection.test.ts — detección determinista de idioma (FASE
// "Idioma de la conversación", 2026-09-12). Funciones puras, sin red, sin
// LLM, sin DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarIdioma, idiomaEfectivo } from "../src/lib/vidaDivina/languageDetection";

test("Validación 1: mensaje real en español -> es", () => {
  assert.equal(detectarIdioma("¿Cuánto cuestan las cápsulas Ripped?", "es"), "es");
  assert.equal(detectarIdioma("cuánto vale el tongkat ali?", "es"), "es");
});

test("Validación 2: mensaje real en inglés -> en", () => {
  // Mensaje real de la conversación investigada (2026-09-12).
  assert.equal(detectarIdioma("how much does the ripped capsules cost?", "es"), "en");
});

test("Validación 3: conversación en español, cliente cambia a inglés -> pasa a en", () => {
  const previo: "es" | "en" = "es";
  const nuevo = detectarIdioma("hello, do you have this product in stock?", previo);
  assert.equal(nuevo, "en");
});

test("Validación 4: conversación en inglés, cliente cambia a español -> pasa a es", () => {
  const previo: "es" | "en" = "en";
  const nuevo = detectarIdioma("hola, cuánto cuesta este producto?", previo);
  assert.equal(nuevo, "es");
});

test("Validación 5: mensaje ambiguo/corto -> conserva el idioma previo, nunca cambia sin evidencia", () => {
  // Nombres de producto solos (sin ninguna palabra funcional alrededor) no
  // deben voltear el idioma de la conversación por su cuenta.
  assert.equal(detectarIdioma("Ripped", "es"), "es");
  assert.equal(detectarIdioma("Ripped", "en"), "en");
  assert.equal(detectarIdioma("Reishi", "es"), "es");
  assert.equal(detectarIdioma("ok", "en"), "en");
});

test("Validación 6: conversación antigua sin language (columna NULL) -> fallback es", () => {
  assert.equal(idiomaEfectivo(null), "es");
  assert.equal(idiomaEfectivo(undefined), "es");
  assert.equal(idiomaEfectivo("es"), "es");
  assert.equal(idiomaEfectivo("en"), "en");
  assert.equal(idiomaEfectivo("fr"), "es"); // valor desconocido -- nunca se inventa un tercer idioma, cae al fallback
});

test("mensaje vacío -> conserva el idioma previo (nunca lanza)", () => {
  assert.equal(detectarIdioma("", "en"), "en");
  assert.equal(detectarIdioma("   ", "es"), "es");
});

test("señal de acentos/¿/¡ por sí sola basta para inclinar hacia español", () => {
  assert.equal(detectarIdioma("¿Sí?", "en"), "es");
});
