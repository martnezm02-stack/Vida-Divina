// multiSourceResearch.test.ts — Composición explícita de varias fuentes
// (Instagram + Meta Ads Library, con TikTok marcada unavailable) sobre
// runResearchQuery() (MI-1..MI-5), vía runMultiSourceResearchQuery().
// Verifica: selección explícita de fuentes, provenance por fuente
// (ingested/unavailable), que una fuente no disponible nunca fabrica
// evidencia, y que el resto del pipeline (retrieval→analysis→patterns→
// insights→brief) sigue funcionando con las fuentes que sí participaron.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  searchIntelligenceItems,
  instagramAdapter,
  metaAdsAdapter,
  runMultiSourceResearchQuery,
} from "../../../src/lib/intelligence";
import type { InstagramRawItem, MetaAdsRawItem } from "../../../src/lib/intelligence";

function igFixture(overrides: Partial<InstagramRawItem> = {}): InstagramRawItem {
  return {
    id: `ig-${randomUUID()}`,
    shortcode: randomUUID().slice(0, 11),
    caption: "Control de peso real, sin dietas extremas #controlDePeso",
    owner: { username: "vidadivina.oficial" },
    video_play_count: 18000,
    like_count: 900,
    comment_count: 40,
    video_duration: 22,
    taken_at: "2026-03-01T10:00:00.000Z",
    market: "MX",
    ...overrides,
  };
}

function metaAdsFixture(overrides: Partial<MetaAdsRawItem> = {}): MetaAdsRawItem {
  // Shape real confirmado en vivo (mcp__meta-ads__ads_library_search,
  // search_terms="control de peso suplemento", countries=["MX"]).
  return {
    id: `meta-${randomUUID()}`,
    page_id: 102551798150702,
    page_name: "Body Curves",
    ad_creation_time: 1790289826,
    ad_delivery_start_time: 1790294878,
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${randomUUID()}`,
    currency: "MXN",
    market: "MX",
    ...overrides,
  };
}

test("multi-source: Instagram + Meta Ads disponibles, TikTok marcada unavailable -> provenance correcta y pipeline completo", async () => {
  const project = `multisource-mx-${randomUUID()}`;
  const sharedHook = "Control de peso real, sin dietas extremas";

  const ig1 = igFixture({ caption: `${sharedHook} #controlDePeso`, owner: { username: "vidadivina.oficial" } });
  const ig2 = igFixture({ caption: `${sharedHook} tambien lo logré`, owner: { username: "competidor_bienestar" } });
  const meta1 = metaAdsFixture();

  const result = await runMultiSourceResearchQuery({
    project,
    query: { market: "MX" },
    minItems: 2,
    sources: [
      { name: "instagram", adapter: instagramAdapter, raw: [ig1, ig2] },
      { name: "meta_ads", adapter: metaAdsAdapter, raw: [meta1] },
      { name: "tiktok", unavailable: true, reason: "sin conector Monid alcanzable desde este runtime" },
    ],
    market: "MX",
    objective: "Investigar cómo se anuncia el control de peso en México",
  });

  // Provenance: las tres fuentes quedan reportadas, cada una con su estado real.
  assert.equal(result.sources.length, 3);
  const byName = Object.fromEntries(result.sources.map((s) => [s.source, s]));
  assert.equal(byName.instagram.status, "ingested");
  assert.equal(byName.instagram.itemsProvided, 2);
  assert.equal(byName.meta_ads.status, "ingested");
  assert.equal(byName.meta_ads.itemsProvided, 1);
  assert.equal(byName.tiktok.status, "unavailable");
  assert.equal(byName.tiktok.reason, "sin conector Monid alcanzable desde este runtime");
  assert.equal((byName.tiktok as { itemsProvided?: number }).itemsProvided, undefined, "una fuente unavailable nunca reporta items fabricados");

  // El pipeline completo (retrieval -> analysis -> patterns -> insights -> brief) corrió con lo disponible.
  assert.equal(result.outcome.status, "ok");
  if (result.outcome.status !== "ok") return;
  assert.equal(result.outcome.retrieval.itemsIngested, 3, "2 de Instagram + 1 de Meta Ads, nada de TikTok");
  assert.equal(result.outcome.retrieval.itemsAfterIngestion, 3, "los 3 items ingeridos deben ser recuperables por la query (market: MX)");
  assert.ok(result.outcome.analysisRuns.length > 0);
  // El contexto relevante del brief prioriza lo que forma patrón (el hook
  // compartido entre los 2 items de Instagram); el item de Meta Ads no
  // comparte patrón con ellos, así que puede quedar fuera de la selección
  // de "contexto relevante" sin que eso sea un fallo -- MI-1 (el Store,
  // verificado más abajo) es la fuente de verdad de qué se ingirió, no el
  // subconjunto que el optimizador de contexto priorizó para el brief.
  assert.ok(result.outcome.brief.provenance.item_ids.length >= 2, "al menos el patrón compartido de Instagram debe quedar trazable en el brief");

  // Los items realmente aterrizaron en el Intelligence Store -- cada
  // external_id de cada fuente disponible es recuperable; nada de TikTok
  // (nunca se fabricó evidencia para la fuente unavailable).
  const projectRow = getOrCreateProject(project);
  const stored = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(stored.length, 3);
  const externalIds = new Set(stored.map((i) => i.external_id));
  assert.ok(externalIds.has(String(ig1.id)), "el item de Instagram 1 debe estar en el Store");
  assert.ok(externalIds.has(String(ig2.id)), "el item de Instagram 2 debe estar en el Store");
  assert.ok(externalIds.has(String(meta1.id)), "el item de Meta Ads debe estar en el Store");
});

test("multi-source: todas las fuentes unavailable -> nunca fabrica evidencia, refleja needs_ingestion/insufficient_evidence real", async () => {
  const project = `multisource-allunavailable-${randomUUID()}`;

  const result = await runMultiSourceResearchQuery({
    project,
    query: { market: "MX" },
    minItems: 2,
    sources: [
      { name: "instagram", unavailable: true, reason: "sin credenciales ScrapeCreators en este entorno" },
      { name: "tiktok", unavailable: true, reason: "sin conector Monid alcanzable desde este runtime" },
      { name: "meta_ads", unavailable: true, reason: "sin credenciales Meta Ads en este entorno" },
    ],
  });

  assert.equal(result.sources.every((s) => s.status === "unavailable"), true);
  assert.equal(result.outcome.status, "needs_ingestion");
});

test("multi-source: una fuente con 0 items crudos (ejecutó pero no encontró nada) se reporta distinto de una fuente unavailable", async () => {
  const project = `multisource-zeroitems-${randomUUID()}`;

  const result = await runMultiSourceResearchQuery({
    project,
    query: {},
    minItems: 1,
    sources: [
      { name: "meta_ads", adapter: metaAdsAdapter, raw: [] },
      { name: "tiktok", unavailable: true, reason: "sin conector Monid alcanzable desde este runtime" },
    ],
  });

  const byName = Object.fromEntries(result.sources.map((s) => [s.source, s]));
  assert.equal(byName.meta_ads.status, "ingested");
  assert.equal(byName.meta_ads.itemsProvided, 0, "ejecutó pero no aportó items -- distinto de no haber podido ejecutarse");
  assert.equal(byName.tiktok.status, "unavailable");
});
