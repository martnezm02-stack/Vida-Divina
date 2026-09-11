// commercialMedia.test.ts — contra el registry REAL (commercial-media/data/registry/),
// poblado por commercial-media/scan-commercial-media.mjs en esta misma fase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTestimonials, searchCommercialMedia, findAssetByName } from "../src/lib/vidaDivina/commercialMedia";

// FIX "testimonial cross-contamination" (2026-09-11): antes, productId:null
// hacía match genérico con CUALQUIER producto solicitado -- bug real (Ripped
// Capsules recibió el testimonio de Hígado Graso). El registry real hoy no
// tiene NINGÚN testimonio con productId explícito, así que lo honesto es
// found:false -- ver commercialMediaTestimonialStrict.test.ts para el
// camino positivo (producto con testimonio explícito sí lo devuelve).
test("searchTestimonials: sin testimonio explícito para el producto -> NO_TESTIMONIAL_FOR_PRODUCT, nunca uno genérico de otro producto", async () => {
  const res = await searchTestimonials({ productId: "productos/01-control-de-peso/tedivina" });
  assert.equal(res.found, false);
  if (!res.found) assert.match(res.reason, /NO_TESTIMONIAL_FOR_PRODUCT/);
});

test("searchCommercialMedia con intención DISTRIBUTION real", async () => {
  const res = await searchCommercialMedia({ businessIntent: "DISTRIBUTION" });
  // Puede o no haber contenido de distribución clasificado ya -- lo real es
  // que NUNCA se inventa uno si no hay match.
  if (!res.found) {
    assert.match(res.reason, /No hay contenido comercial real aprobado/);
  } else {
    assert.ok(res.mediaId);
  }
});

test("criterios imposibles -> found:false honesto, nunca inventado", async () => {
  const res = await searchCommercialMedia({ productId: "producto-que-no-existe-xyz", mediaType: "TIPO_INEXISTENTE" });
  assert.equal(res.found, false);
});

// FASE "Voice Engine automático + generador de voz" (2026-09-04)
test("findAssetByName resuelve un Asset real de voz generado por el Dashboard, por su nombre semántico", async () => {
  const res = await findAssetByName("bienvenida-vive-vida-divina");
  assert.equal(res.found, true, "requiere haber corrido PRUEBA B/C del generador de voz al menos una vez en este entorno");
  if (res.found) {
    assert.equal(res.displayName, "bienvenida-vive-vida-divina");
    assert.equal(res.mediaType, "AUDIO_OFICIAL");
  }
});

test("findAssetByName: nombre normalizado (mayúsculas/acentos) también resuelve", async () => {
  const res = await findAssetByName("Bienvenida Vive Vida Divina");
  assert.equal(res.found, true);
});

test("findAssetByName: nombre inexistente -> found:false honesto", async () => {
  const res = await findAssetByName("este-asset-no-existe-nunca-xyz");
  assert.equal(res.found, false);
});
