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

// --- Deduplicación de actores (bug real detectado en validación end-to-end,
// 22 posts/5 cuentas -> 22 actores en vez de 5 porque external_id quedaba
// null y upsertActor nunca podía reutilizar el actor). ---

// 1. actor.external_id se genera correctamente (fallback: handle normalizado)
test("actor.external_id: sin ID de perfil real, usa el handle normalizado (sin @, minúsculas) -- nunca queda null si hay username", () => {
  const raw: InstagramRawItem = { id: "1", shortcode: "a", owner: { username: "@VidaDivina.Oficial" } };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor?.external_id, "vidadivina.oficial");
});

// 2. Dos posts del mismo handle -> mismo external_id
test("dos posts de la misma cuenta producen el mismo actor.external_id", () => {
  const post1 = instagramAdapter.normalize(
    { id: "post-1", shortcode: "a", owner: { username: "mundofitmexico01" } },
    { project: "p" }
  );
  const post2 = instagramAdapter.normalize(
    { id: "post-2", shortcode: "b", owner: { username: "mundofitmexico01" } },
    { project: "p" }
  );
  assert.equal(post1.actor?.external_id, post2.actor?.external_id);
  assert.equal(post1.actor?.external_id, "mundofitmexico01");
});

// 3. Handles diferentes -> external_id diferentes
test("dos cuentas distintas producen actor.external_id distintos", () => {
  const postA = instagramAdapter.normalize({ id: "1", owner: { username: "bajar_de_peso_y_quemar_grasa" } }, { project: "p" });
  const postB = instagramAdapter.normalize({ id: "2", owner: { username: "pastillaslucebienoficial" } }, { project: "p" });
  assert.notEqual(postA.actor?.external_id, postB.actor?.external_id);
});

// 4. ID real de perfil (owner.id/owner.pk) tiene prioridad sobre el handle
test("con owner.id real presente, se usa ese ID (no el handle) como external_id -- estable aunque cambie el username mostrado", () => {
  const raw: InstagramRawItem = { id: "1", owner: { id: 179831923, username: "mundofitmexico01" } };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor?.external_id, "179831923");

  const rawPk: InstagramRawItem = { id: "2", owner: { pk: "179831923", username: "mundofitmexico01_rebrand" } };
  const canonicalPk = instagramAdapter.normalize(rawPk, { project: "p" });
  assert.equal(canonicalPk.actor?.external_id, "179831923", "owner.pk también se acepta como ID real de perfil");
});

test("con owner.id real, dos posts con username temporalmente distinto (rebrand) siguen produciendo el mismo external_id", () => {
  const before = instagramAdapter.normalize({ id: "1", owner: { id: 555, username: "cuenta_vieja" } }, { project: "p" });
  const after = instagramAdapter.normalize({ id: "2", owner: { id: 555, username: "cuenta_nueva" } }, { project: "p" });
  assert.equal(before.actor?.external_id, after.actor?.external_id);
  assert.equal(before.actor?.external_id, "555");
});

// 5. No se fabrican IDs
test("no se fabrica un external_id a partir de la URL del post ni de ningún otro campo ajeno al perfil", () => {
  const raw: InstagramRawItem = {
    id: "post-real-1",
    url: "https://www.instagram.com/reel/AbCdEfGh/",
    owner: { username: "tematchasurimx" },
  };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.notEqual(canonical.actor?.external_id, canonical.external_id, "el external_id del actor nunca debe ser el external_id/URL del post");
  assert.equal(canonical.actor?.external_id, "tematchasurimx");
});

// 6. El actor conserva nombre/handle/URL existentes (sin regresión)
test("el resto de campos del actor (handle mostrado, type, url) no cambia con este fix", () => {
  const raw: InstagramRawItem = { id: "1", owner: { id: 42, username: "PorUnMexicoSinObesidad" } };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor?.handle, "PorUnMexicoSinObesidad"); // sin normalizar aquí -- ingestionService.ts ya lo normaliza al persistir
  assert.equal(canonical.actor?.type, "creator");
  assert.equal(canonical.actor?.url, "https://www.instagram.com/PorUnMexicoSinObesidad/");
  assert.equal(canonical.actor?.display_name, null);
});

// 7. El comportamiento de items (no actores) no cambia
test("el fix de actor no afecta el external_id/canonical_url del item (siguen viniendo de id/shortcode del post, no del owner)", () => {
  const raw: InstagramRawItem = { id: "post-xyz", shortcode: "Cxyz123ABC", owner: { id: 999, username: "cuenta" } };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.external_id, "post-xyz");
  assert.equal(canonical.canonical_url, "https://www.instagram.com/reel/Cxyz123ABC");
});

// 8. UNKNOWN permanece NULL cuando no existe identificador utilizable
test("sin username ni owner.id/pk: el item no tiene actor -- nunca se fabrica uno con external_id inventado", () => {
  const raw: InstagramRawItem = { id: "1", shortcode: "a" }; // sin owner/user
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor, null);
});

test("owner como string vacío: no hay handle ni ID real utilizable -> sin actor, nunca un external_id fabricado", () => {
  const raw: InstagramRawItem = { id: "1", owner: "" };
  const canonical = instagramAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor, null);
});
