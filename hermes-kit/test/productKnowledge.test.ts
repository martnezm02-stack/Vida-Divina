// productKnowledge.test.ts — contra el catálogo REAL (docs/productos/), sin mocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchKnowledge, getProductKnowledge } from "../src/lib/vidaDivina/productKnowledge";

test("searchKnowledge encuentra un producto real por palabra clave", async () => {
  const hits = await searchKnowledge("tongkat");
  assert.ok(hits.length > 0, "debe encontrar al menos un producto real");
  assert.match(hits[0].titulo.toLowerCase(), /tongkat/);
});

test("getProductKnowledge trae el contenido real del markdown fuente", async () => {
  const res = await getProductKnowledge("tongkat");
  assert.equal(res.found, true);
  if (res.found) {
    assert.ok(res.contenidoMarkdown.length > 100, "el markdown real no debe estar vacío");
    assert.match(res.rutaFuente, /docs[\\/]productos/);
  }
});

test("fallback honesto: producto inexistente -> found:false, nunca inventado", async () => {
  const res = await getProductKnowledge("producto-inventado-que-no-existe-xyz-987");
  assert.equal(res.found, false);
  if (!res.found) {
    assert.match(res.reason, /No se encontró/);
  }
});

// Fallback fuzzy (hallazgo real 2026-09-11): "Ripet" es la transcripción de
// voz real de Gemini para "Ripped" -- ninguna coincidencia exacta/substring/
// token tolera esa diferencia de ortografía.
test("Problema 2 -- searchKnowledge('Ripet') devuelve Ripped Capsules como candidato válido (fuzzy fallback)", async () => {
  const hits = await searchKnowledge("Ripet");
  assert.ok(hits.length > 0, "el fallback fuzzy debe encontrar al menos un candidato");
  assert.equal(hits[0].id, "productos/07-rendimiento-fisico/ripped-capsules");
});

test("Problema 2 -- getProductKnowledge tolera variantes reales de transcripción/typo: Ripet, Riped, Ripped", async () => {
  for (const variante of ["Ripet", "Riped", "Ripped", "cápsulas Ripet"]) {
    const res = await getProductKnowledge(variante);
    assert.equal(res.found, true, `debería resolver "${variante}"`);
    if (res.found) assert.equal(res.productId, "productos/07-rendimiento-fisico/ripped-capsules");
  }
});

test("Problema 2 -- el fuzzy fallback nunca compite con una coincidencia exacta/substring/token ya existente (no degrada resultados correctos)", async () => {
  // "tongkat" ya resuelve por substring/keyword real -- el fuzzy fallback
  // solo se activa cuando scored.length === 0, así que esto sigue devolviendo
  // exactamente lo mismo que antes del fix.
  const hits = await searchKnowledge("tongkat");
  assert.ok(hits.length > 0);
  assert.match(hits[0].titulo.toLowerCase(), /tongkat/);

  const reishi = await getProductKnowledge("Reishi Capsules");
  assert.equal(reishi.found, true);
  if (reishi.found) assert.equal(reishi.productId, "productos/03-longevidad-bienestar/reishi-capsules");
});
