// commercialMediaTestimonialStrict.test.ts — FIX "testimonial cross-contamination"
// (2026-09-11): un testimonio real solo se entrega si está EXPLÍCITAMENTE
// asociado al mismo producto solicitado -- nunca uno de otro producto ni un
// productId:null genérico como si fuera prueba social de ese producto
// (bug real: Ripped Capsules recibió el testimonio de Hígado Graso).
//
// Registry aislado (COMMERCIAL_MEDIA_DATA_ROOT temporal, mismo patrón que
// commercial-media/test/selector.test.js) porque el registry real hoy no
// tiene NINGÚN testimonio con productId explícito -- necesario para probar
// el camino positivo (Validación B) y la no-contaminación cruzada
// (Validación C), no solo el rechazo honesto (Validación A).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-testimonial-strict-test-"));

const RIPPED_ID = "productos/07-rendimiento-fisico/ripped-capsules";
const TEDIVINA_ID = "productos/01-control-de-peso/tedivina";
const REISHI_ID = "productos/03-longevidad-bienestar/reishi-capsules"; // sin testimonio en este fixture -- caso Validación A

let searchTestimonials: (typeof import("../src/lib/vidaDivina/commercialMedia"))["searchTestimonials"];

before(async () => {
  process.env.COMMERCIAL_MEDIA_DATA_ROOT = TEST_DATA_ROOT;
  const { upsertCommercialMedia } = await import("../../commercial-media/src/commercialMediaStore.js");
  ({ searchTestimonials } = await import("../src/lib/vidaDivina/commercialMedia"));

  upsertCommercialMedia({
    displayName: "Testimonio Ripped Capsules",
    filePath: "ripped-testimonio.mp4",
    mimeType: "video/mp4",
    mediaType: "VIDEO_TESTIMONIAL",
    businessIntent: "CONSUMPTION",
    productId: RIPPED_ID,
    audience: null,
    needTags: [],
    fileSizeBytes: 1,
    contentHash: "h-ripped",
    classificationConfidence: "HIGH",
    classificationReason: "fixture",
  });
  upsertCommercialMedia({
    displayName: "Testimonio TéDivina",
    filePath: "tedivina-testimonio.mp4",
    mimeType: "video/mp4",
    mediaType: "VIDEO_TESTIMONIAL",
    businessIntent: "CONSUMPTION",
    productId: TEDIVINA_ID,
    audience: null,
    needTags: [],
    fileSizeBytes: 1,
    contentHash: "h-tedivina",
    classificationConfidence: "HIGH",
    classificationReason: "fixture",
  });
  upsertCommercialMedia({
    displayName: "Testimonio genérico sin producto (Hígado Graso)",
    filePath: "higado-testimonio.mp4",
    mimeType: "video/mp4",
    mediaType: "VIDEO_TESTIMONIAL",
    businessIntent: "CONSUMPTION",
    productId: null,
    audience: null,
    needTags: [],
    fileSizeBytes: 1,
    contentHash: "h-higado",
    classificationConfidence: "HIGH",
    classificationReason: "fixture",
  });
});

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

test("Validación B: producto CON testimonio explícito -> devuelve únicamente el suyo", async () => {
  const res = await searchTestimonials({ productId: RIPPED_ID });
  assert.equal(res.found, true);
  if (res.found) assert.equal(res.displayName, "Testimonio Ripped Capsules");
});

test("Validación C: no cruza -- pedir el testimonio de TéDivina nunca devuelve el de Ripped ni el genérico productId:null", async () => {
  const res = await searchTestimonials({ productId: TEDIVINA_ID });
  assert.equal(res.found, true);
  if (res.found) assert.equal(res.displayName, "Testimonio TéDivina");
});

test("Validación A: producto SIN testimonio explícito -> NO_TESTIMONIAL_FOR_PRODUCT, nunca el genérico ni el de otro producto", async () => {
  const res = await searchTestimonials({ productId: REISHI_ID });
  assert.equal(res.found, false);
  if (!res.found) assert.match(res.reason, /NO_TESTIMONIAL_FOR_PRODUCT/);
});
