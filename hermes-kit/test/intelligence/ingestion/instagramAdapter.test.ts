// instagramAdapter.test.ts — MI-2: normalización de items de Instagram
// (shape real de ScrapeCreators, confirmado contra last30days/.../
// lib/instagram.py#_parse_items) a CanonicalIntelligenceItem. UNKNOWN=NULL
// siempre -- ninguna métrica ausente se convierte en 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { instagramAdapter } from "../../../src/lib/intelligence/ingestion";
import type { InstagramRawItem } from "../../../src/lib/intelligence/ingestion";

test("adapter contract: expone `source` y `normalize()`", () => {
  assert.equal(instagramAdapter.source, "instagram");
  assert.equal(typeof instagramAdapter.normalize, "function");
});

test("normalize(): mapea un reel real de ScrapeCreators a CanonicalIntelligenceItem", () => {
  const raw: InstagramRawItem = {
    id: "3412345678901234567",
    shortcode: "Cxyz123ABC",
    caption: { text: "Transforma tu cuerpo en 30 días #controlDePeso" },
    owner: { username: "vidadivina.oficial" },
    video_play_count: 84200,
    like_count: 6100,
    comment_count: 340,
    video_duration: 32.5,
    taken_at: "2026-01-15T12:00:00.000Z",
  };

  const canonical = instagramAdapter.normalize(raw, { project: "marketing-intelligence" });

  assert.equal(canonical.project, "marketing-intelligence");
  assert.equal(canonical.source, "instagram");
  assert.equal(canonical.external_id, "3412345678901234567");
  assert.equal(canonical.canonical_url, "https://www.instagram.com/reel/Cxyz123ABC");
  assert.equal(canonical.content_type, "reel");
  assert.equal(canonical.media_type, "video");
  assert.equal(canonical.description, "Transforma tu cuerpo en 30 días #controlDePeso");

  assert.equal(canonical.actor?.handle, "vidadivina.oficial");
  assert.equal(canonical.actor?.type, "creator");
  assert.equal(canonical.actor?.url, "https://www.instagram.com/vidadivina.oficial/");

  assert.equal(canonical.metrics?.views, 84200);
  assert.equal(canonical.metrics?.likes, 6100);
  assert.equal(canonical.metrics?.comments, 340);

  assert.equal(canonical.assets?.length, 1);
  assert.equal(canonical.assets?.[0].kind, "video");
  assert.equal(canonical.assets?.[0].duration_seconds, 32.5);

  assert.equal(canonical.evidence?.length, 1);
  assert.equal(canonical.evidence?.[0].kind, "source_url");

  assert.equal(typeof canonical.published_at, "number");
});

test("normalize(): soporta caption como string plano y owner como string plano", () => {
  const raw: InstagramRawItem = {
    id: "111",
    shortcode: "abc",
    caption: "caption como string",
    owner: "usuario_plano",
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.description, "caption como string");
  assert.equal(canonical.actor?.handle, "usuario_plano");
});

test("normalize(): métricas ausentes -> NULL, nunca 0", () => {
  const raw: InstagramRawItem = {
    id: "222",
    shortcode: "def",
    caption: "sin métricas todavía",
    owner: { username: "alguien" },
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.metrics?.views, null);
  assert.equal(canonical.metrics?.likes, null);
  assert.equal(canonical.metrics?.comments, null);
});

test("normalize(): sin señal de video -> content_type 'post', media_type null (nunca se inventa 'image' sin evidencia de asset)", () => {
  const raw: InstagramRawItem = {
    id: "333",
    shortcode: "ghi",
    caption: "post de foto/carrusel",
    owner: { username: "alguien" },
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.content_type, "post");
  assert.equal(canonical.media_type, null);
  assert.equal(canonical.assets?.[0].kind, "image");
});

test("normalize(): content_type explícito del caller tiene prioridad sobre la inferencia por señal de video", () => {
  const raw: InstagramRawItem = {
    id: "444",
    shortcode: "jkl",
    content_type: "story",
    video_play_count: 100,
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.content_type, "story");
});

test("normalize(): sin url ni shortcode -> canonical_url null, sin assets ni evidence fabricados", () => {
  const raw: InstagramRawItem = { id: "555", caption: "sin identificador de url" };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.canonical_url, null);
  assert.deepEqual(canonical.assets, []);
  assert.deepEqual(canonical.evidence, []);
});

test("normalize(): transcript opcional se conserva como evidence adicional", () => {
  const raw: InstagramRawItem = {
    id: "666",
    shortcode: "mno",
    transcript: "llevo treinta días tomando esto y no lo puedo creer",
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  const kinds = canonical.evidence?.map((e) => e.kind) ?? [];
  assert.ok(kinds.includes("source_url"));
  assert.ok(kinds.includes("transcript_fragment"));
});

test("normalize(): campos ausentes en el raw quedan ausentes/null en el canónico, nunca inventados (published_at, actor)", () => {
  const raw: InstagramRawItem = { id: "777", shortcode: "pqr" };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.published_at, null);
  assert.equal(canonical.actor, null);
  assert.equal(canonical.description, null);
});
