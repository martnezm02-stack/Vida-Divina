// metaAdsAdapter.test.ts — MI-2: normalización de resultados reales de
// Meta Ads Library (shape confirmado por mcp__meta-ads__ads_library_search
// en vivo, y por Graph API /ads_archive en una fase previa de este repo)
// a CanonicalIntelligenceItem. UNKNOWN=NULL siempre; nunca se fabrica
// media_type/format/hook/angle/cta/offer; nunca se filtra un secreto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { metaAdsAdapter, ingestCanonicalItem } from "../../../src/lib/intelligence/ingestion";
import { getOrCreateProject } from "../../../src/lib/intelligence/projects";
import { searchIntelligenceItems } from "../../../src/lib/intelligence/items";
import type { MetaAdsRawItem } from "../../../src/lib/intelligence/ingestion";
import { randomUUID } from "node:crypto";

test("adapter contract: expone `source` y `normalize()`", () => {
  assert.equal(metaAdsAdapter.source, "meta_ads");
  assert.equal(typeof metaAdsAdapter.normalize, "function");
});

test("normalización básica: mapea un resultado real de keyword search (ads_library_search) a CanonicalIntelligenceItem", () => {
  // Fixture fiel al resultado real obtenido en vivo: search_terms="control
  // de peso suplemento", countries=["MX"], ad_active_status="ALL".
  const raw: MetaAdsRawItem = {
    id: "1387147326910806",
    page_id: 102551798150702,
    page_name: "Body Curves",
    ad_creation_time: 1790289826,
    ad_delivery_start_time: 1790294878,
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=1387147326910806",
    currency: "MXN",
    market: "MX",
  };

  const canonical = metaAdsAdapter.normalize(raw, { project: "marketing-intelligence" });

  assert.equal(canonical.project, "marketing-intelligence");
  assert.equal(canonical.source, "meta_ads");
  assert.equal(canonical.content_type, "ad");
  assert.equal(canonical.external_id, "1387147326910806");
  assert.equal(canonical.canonical_url, "https://www.facebook.com/ads/library/?id=1387147326910806");
  assert.equal(canonical.market, "MX");
});

test("advertiser/page: page_id y page_name se mapean al actor como 'advertiser'", () => {
  const raw: MetaAdsRawItem = { id: "1", page_id: 102551798150702, page_name: "Body Curves" };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.actor?.type, "advertiser");
  assert.equal(canonical.actor?.display_name, "Body Curves");
  assert.equal(canonical.actor?.external_id, "102551798150702");
  assert.equal(canonical.actor?.url, "https://www.facebook.com/profile.php?id=102551798150702");
});

test("external_id: preserva el Ad Library ID real, distinto del page_id", () => {
  const raw: MetaAdsRawItem = { id: "1609029917671779", page_id: 129988406875608 };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.external_id, "1609029917671779");
  assert.notEqual(canonical.external_id, canonical.actor?.external_id);
});

test("fechas: ad_delivery_start_time -> published_at; ad_creation_time se conserva aparte en metadata, nunca se confunde con published_at", () => {
  const raw: MetaAdsRawItem = { id: "1", ad_creation_time: 1790289826, ad_delivery_start_time: 1790294878 };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.published_at, 1790294878);
  const meta = canonical.source_metadata as Record<string, unknown>;
  assert.equal(meta.ad_creation_time, 1790289826);
  assert.notEqual(meta.ad_creation_time, canonical.published_at);
});

test("country/market: se toma del campo `market` asignado por quien arma el raw desde `countries`, nunca inferido", () => {
  const raw: MetaAdsRawItem = { id: "1", market: "MX" };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.market, "MX");

  const withoutMarket: MetaAdsRawItem = { id: "2" };
  const canonicalWithoutMarket = metaAdsAdapter.normalize(withoutMarket, { project: "p" });
  assert.equal(canonicalWithoutMarket.market, null);
});

test("source_url: ad_snapshot_url real se conserva como canonical_url y como evidence", () => {
  const raw: MetaAdsRawItem = {
    id: "1",
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=1666721878406654",
  };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.canonical_url, "https://www.facebook.com/ads/library/?id=1666721878406654");
  assert.equal(canonical.evidence?.length, 1);
  assert.equal(canonical.evidence?.[0].kind, "source_url");
  assert.equal(canonical.evidence?.[0].url, "https://www.facebook.com/ads/library/?id=1666721878406654");
});

test("publisher platforms: se preservan en metadata cuando están presentes (solo vía Graph API enriquecida)", () => {
  const raw: MetaAdsRawItem = { id: "1", publisher_platforms: ["facebook", "instagram", "messenger"] };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  const meta = canonical.source_metadata as Record<string, unknown>;
  assert.deepEqual(meta.publisher_platforms, ["facebook", "instagram", "messenger"]);
});

test("UNKNOWN -> NULL: sin media_type/format/hook/angle/cta/offer -- nunca se fabrican", () => {
  const raw: MetaAdsRawItem = { id: "1", page_name: "Anunciante" };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.media_type, null);
  assert.equal(canonical.format, undefined); // nunca se asigna -- ni siquiera null explícito, se omite
  assert.equal(canonical.hook, undefined);
  assert.equal(canonical.angle, undefined);
  assert.equal(canonical.cta, undefined);
  assert.equal(canonical.offer, undefined);
  assert.equal(canonical.language, null);
});

test("ausencia de campos opcionales: item mínimo (solo id) no fabrica nada, assets vacío, sin evidence", () => {
  const raw: MetaAdsRawItem = { id: "minimal-1" };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.external_id, "minimal-1");
  assert.equal(canonical.actor, null);
  assert.equal(canonical.description, null);
  assert.equal(canonical.published_at, null);
  assert.equal(canonical.canonical_url, null);
  assert.deepEqual(canonical.assets, []);
  assert.deepEqual(canonical.evidence, []);
});

test("copy: sin ad_creative_bodies (shape MCP), description usa ad_creative_link_title si existe; si tampoco, queda null (nunca se inventa)", () => {
  const withLinkTitle = metaAdsAdapter.normalize(
    { id: "1", ad_creative_link_title: "Pierde peso en 30 días" },
    { project: "p" }
  );
  assert.equal(withLinkTitle.description, "Pierde peso en 30 días");

  const withoutAny = metaAdsAdapter.normalize({ id: "2" }, { project: "p" });
  assert.equal(withoutAny.description, null);
});

test("copy: con ad_creative_bodies (shape Graph API enriquecida), el primer body es el texto primario; el arreglo completo se preserva en metadata", () => {
  const raw: MetaAdsRawItem = {
    id: "1",
    ad_creative_bodies: ["Texto principal del anuncio", "variante B"],
    ad_creative_link_titles: ["Título"],
  };
  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  assert.equal(canonical.description, "Texto principal del anuncio");
  const meta = canonical.source_metadata as Record<string, unknown>;
  assert.deepEqual(meta.ad_creative_bodies, ["Texto principal del anuncio", "variante B"]);
});

test("no fuga de access_token ni secretos: campos inesperados (paging/access_token) en el raw nunca aparecen en el canónico", () => {
  const raw = {
    id: "1",
    page_name: "Anunciante",
    // Campos que NUNCA deberían leerse -- el adapter solo extrae campos
    // conocidos por nombre, nunca hace spread del raw completo.
    access_token: "FAKE_TOKEN_NEVER_REAL",
    paging: { next: "https://graph.facebook.com/v26.0/ads_archive?after=CURSOR&access_token=FAKE_TOKEN_NEVER_REAL" },
  } as MetaAdsRawItem & Record<string, unknown>;

  const canonical = metaAdsAdapter.normalize(raw, { project: "p" });
  const serialized = JSON.stringify(canonical);
  assert.doesNotMatch(serialized, /access_token/i);
  assert.doesNotMatch(serialized, /paging/i);
});

test("keyword result: fixture real de búsqueda por término ingiere correctamente en el Intelligence Store", () => {
  const project = getOrCreateProject(`meta-ads-keyword-${randomUUID()}`);
  const raw: MetaAdsRawItem = {
    id: `kw-${randomUUID()}`,
    page_id: 102551798150702,
    page_name: "Body Curves",
    ad_delivery_start_time: 1790294878,
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${randomUUID()}`,
    currency: "MXN",
    market: "MX",
  };
  const canonical = metaAdsAdapter.normalize(raw, { project: project.slug });
  const { item, created } = ingestCanonicalItem(canonical);
  assert.equal(created, true);
  assert.equal(item.source_id !== undefined, true);

  const stored = searchIntelligenceItems({ project_id: project.id });
  assert.ok(stored.some((i) => i.id === item.id));
});

test("page_id result: fixture con page_id verificado real (Herbalife) ingiere igual que un resultado por keyword -- mismo adapter, sin capa nueva", () => {
  const project = getOrCreateProject(`meta-ads-pageid-${randomUUID()}`);
  const raw: MetaAdsRawItem = {
    id: `pg-${randomUUID()}`,
    page_id: "258101291061120", // Herbalife, verificado en docs/PROJECT_STATE_CHECKPOINT_2026-08-16.md
    page_name: "Herbalife",
    ad_delivery_start_time: 1790200000,
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${randomUUID()}`,
    market: "MX",
  };
  const canonical = metaAdsAdapter.normalize(raw, { project: project.slug });
  const { created } = ingestCanonicalItem(canonical);
  assert.equal(created, true);
  assert.equal(canonical.actor?.external_id, "258101291061120");
});

test("resultado vacío válido: una lista de raw items vacía no ingiere nada y no lanza (Herbalife/Omnilife devolvieron [] en la investigación real)", () => {
  const project = getOrCreateProject(`meta-ads-empty-${randomUUID()}`);
  const emptyRawItems: MetaAdsRawItem[] = [];
  for (const raw of emptyRawItems) {
    ingestCanonicalItem(metaAdsAdapter.normalize(raw, { project: project.slug }));
  }
  const stored = searchIntelligenceItems({ project_id: project.id });
  assert.equal(stored.length, 0, "un resultado vacío es válido, no un error -- cero filas, sin excepción");
});

test("idempotencia: reingerir el mismo Ad Library ID no duplica la fila", () => {
  const project = getOrCreateProject(`meta-ads-idem-${randomUUID()}`);
  const raw: MetaAdsRawItem = {
    id: "idempotent-ad-1",
    page_id: 102551798150702,
    page_name: "Body Curves",
    ad_delivery_start_time: 1790294878,
  };
  const canonical1 = metaAdsAdapter.normalize(raw, { project: project.slug });
  const first = ingestCanonicalItem(canonical1);
  const canonical2 = metaAdsAdapter.normalize(raw, { project: project.slug });
  const second = ingestCanonicalItem(canonical2);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.item.id, first.item.id);

  const stored = searchIntelligenceItems({ project_id: project.id });
  const matching = stored.filter((i) => i.external_id === "idempotent-ad-1");
  assert.equal(matching.length, 1);
});
