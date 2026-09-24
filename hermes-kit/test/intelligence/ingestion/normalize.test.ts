// normalize.test.ts — MI-2: normalización determinista de URLs/timestamps
// y demás funciones puras de la capa de ingesta.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  normalizeTimestamp,
  normalizeSourceSlug,
  normalizeContentType,
  normalizeAssetKind,
  normalizeActorHandle,
  normalizeMetricValue,
} from "../../../src/lib/intelligence/ingestion";

test("normalizeUrl: minúsculas en host, sin barra final, sin params de tracking, orden estable", () => {
  const a = normalizeUrl("HTTPS://TikTok.com/@marca/video/123/?utm_source=fb&b=2&a=1");
  const b = normalizeUrl("https://tiktok.com/@marca/video/123?a=1&b=2&utm_source=ig");
  assert.equal(a, b, "dos URLs equivalentes salvo tracking/orden deben normalizar exactamente igual");
  assert.ok(!a!.includes("utm_source"));
});

test("normalizeUrl: valor ausente o vacío -> null, nunca inventa", () => {
  assert.equal(normalizeUrl(null), null);
  assert.equal(normalizeUrl(undefined), null);
  assert.equal(normalizeUrl("   "), null);
});

test("normalizeUrl: entrada no parseable como URL se conserva tal cual (no se descarta)", () => {
  assert.equal(normalizeUrl("no-es-una-url"), "no-es-una-url");
});

test("normalizeTimestamp: segundos, milisegundos, ISO string y Date normalizan al mismo valor", () => {
  const seconds = 1_700_000_000;
  const ms = seconds * 1000;
  const iso = new Date(ms).toISOString();
  const date = new Date(ms);

  assert.equal(normalizeTimestamp(seconds), seconds);
  assert.equal(normalizeTimestamp(ms), seconds);
  assert.equal(normalizeTimestamp(iso), seconds);
  assert.equal(normalizeTimestamp(date), seconds);
});

test("normalizeTimestamp: ausente o inválido -> null, nunca 'ahora'", () => {
  assert.equal(normalizeTimestamp(null), null);
  assert.equal(normalizeTimestamp(undefined), null);
  assert.equal(normalizeTimestamp(""), null);
  assert.equal(normalizeTimestamp("no es una fecha"), null);
});

test("normalizeSourceSlug: alias de plataformas a slug canónico", () => {
  assert.equal(normalizeSourceSlug("TikTok"), "tiktok");
  assert.equal(normalizeSourceSlug("Facebook Ads"), "meta_ads");
  assert.equal(normalizeSourceSlug("Twitter"), "x");
  assert.equal(normalizeSourceSlug("Mi Fuente Nueva"), "mi_fuente_nueva");
});

test("normalizeContentType y normalizeAssetKind: alias a vocabulario estable", () => {
  assert.equal(normalizeContentType("Advertisement"), "ad");
  assert.equal(normalizeContentType("Reel"), "video");
  assert.equal(normalizeAssetKind("IMG"), "image");
  assert.equal(normalizeAssetKind("Thumb"), "thumbnail");
});

test("normalizeActorHandle: sin @, sin espacios, minúsculas", () => {
  assert.equal(normalizeActorHandle("@VidaDivina.Oficial "), "vidadivina.oficial");
  assert.equal(normalizeActorHandle(null), null);
});

test("normalizeMetricValue: números y strings numéricos limpios, nunca adivina abreviaciones", () => {
  assert.equal(normalizeMetricValue(1000), 1000);
  assert.equal(normalizeMetricValue("1000"), 1000);
  assert.equal(normalizeMetricValue("1.2K"), null, "no debe inventar una interpretación de '1.2K'");
  assert.equal(normalizeMetricValue(null), null);
  assert.equal(normalizeMetricValue(undefined), null);
});
