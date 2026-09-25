// instagramResearch.test.ts — Instagram -> SourceAdapter (MI-2) ->
// runResearchQuery -> MI-1..MI-5, punta a punta con un conjunto pequeño de
// datos reales de Instagram (shape ScrapeCreators). Verifica
// canonicalización, deduplicación/idempotencia, provenance, patrones/
// insights/brief cuando hay evidencia suficiente, insufficient_evidence
// cuando no, y que un fallo de JEV nunca bloquea el almacenamiento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  searchIntelligenceItems,
  instagramAdapter,
  createJevDecisionProvider,
  createDecisionBackedContextOptimizer,
  deterministicContextOptimizer,
  withFallback,
  runResearchQuery,
} from "../../../src/lib/intelligence";
import type { InstagramRawItem } from "../../../src/lib/intelligence";

function igFixture(overrides: Partial<InstagramRawItem> = {}): InstagramRawItem {
  return {
    id: `ig-${randomUUID()}`,
    shortcode: randomUUID().slice(0, 11),
    caption: "Llevo 30 días tomando esto y no lo puedo creer #controlDePeso",
    owner: { username: "vidadivina.oficial" },
    video_play_count: 42000,
    like_count: 2100,
    comment_count: 95,
    video_duration: 28,
    taken_at: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

test("Instagram end-to-end: sin evidencia previa, ingiere vía el adapter y completa retrieval->analysis->patterns->insights->brief", async () => {
  const project = `ig-research-${randomUUID()}`;
  const sharedHook = "Llevo 30 días tomando esto y no lo puedo creer";

  const raw1 = igFixture({ caption: `${sharedHook} #controlDePeso`, owner: { username: "vidadivina.oficial" } });
  const raw2 = igFixture({ caption: `${sharedHook} tambien lo probé`, owner: { username: "competidor_bienestar" } });

  const outcome = await runResearchQuery({
    project,
    query: { content_type: "video" },
    minItems: 2,
    ingest: [
      { adapter: instagramAdapter, raw: raw1 },
      { adapter: instagramAdapter, raw: raw2 },
    ],
    market: "MX",
    objective: "Investigar hooks de control de peso en Instagram MX",
  });

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.retrieval.itemsIngested, 2);
  assert.ok(outcome.brief.patterns.length > 0, "el hook compartido entre dos actores debe producir al menos un patrón");
  assert.ok(outcome.brief.provenance.item_ids.length === 2);
  assert.ok(outcome.analysisRuns.length > 0, "debe haber pasado por MI-3 (analysis)");
});

test("deduplicación/idempotencia: reingerir el mismo item de Instagram no crea una fila duplicada", async () => {
  const project = `ig-dedup-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const raw = igFixture();

  await runResearchQuery({
    project,
    query: {},
    minItems: 1,
    ingest: [{ adapter: instagramAdapter, raw }],
  });
  await runResearchQuery({
    project,
    query: {},
    minItems: 1,
    ingest: [{ adapter: instagramAdapter, raw }],
  });

  const items = searchIntelligenceItems({ project_id: projectRow.id });
  const matching = items.filter((i) => i.external_id === String(raw.id));
  assert.equal(matching.length, 1, "el mismo external_id de Instagram no debe duplicarse");
});

test("provenance: el brief permite rastrear hasta el item de Instagram y su evidencia original (source_url)", async () => {
  const project = `ig-provenance-${randomUUID()}`;
  const raw1 = igFixture({ caption: "hook compartido de prueba" });
  const raw2 = igFixture({ caption: "hook compartido de prueba", owner: { username: "otro_actor" } });

  const outcome = await runResearchQuery({
    project,
    query: {},
    minItems: 2,
    ingest: [
      { adapter: instagramAdapter, raw: raw1 },
      { adapter: instagramAdapter, raw: raw2 },
    ],
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  assert.ok(outcome.brief.provenance.evidence_ids.length > 0, "debe haber evidence (source_url) trazable");
  assert.ok(outcome.brief.provenance.item_ids.length === 2);
});

test("insufficient_evidence: sin datos suficientes y sin nada para ingerir, Instagram no fabrica un brief", async () => {
  const project = `ig-insufficient-${randomUUID()}`;
  const outcome = await runResearchQuery({
    project,
    query: { content_type: "video" },
    minItems: 3,
  });
  assert.equal(outcome.status, "needs_ingestion");
});

test("JEV fail-open: un ContextOptimizer respaldado por JEV sin configurar nunca bloquea la ingesta/almacenamiento de Instagram", async () => {
  const project = `ig-jev-failopen-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const raw1 = igFixture({ caption: "hook jev fail-open" });
  const raw2 = igFixture({ caption: "hook jev fail-open", owner: { username: "otro_actor_jev" } });

  const unconfiguredJev = createDecisionBackedContextOptimizer(createJevDecisionProvider());
  const resilientOptimizer = withFallback(unconfiguredJev, deterministicContextOptimizer);

  const outcome = await runResearchQuery({
    project,
    query: {},
    minItems: 2,
    ingest: [
      { adapter: instagramAdapter, raw: raw1 },
      { adapter: instagramAdapter, raw: raw2 },
    ],
    contextOptimizer: resilientOptimizer,
  });

  // La evidencia canónica debe quedar almacenada independientemente de que
  // JEV haya fallado -- la ingesta ya ocurrió en MI-2/MI-1 antes de que el
  // ContextOptimizer (que sí puede fallar) entre en juego.
  const items = searchIntelligenceItems({ project_id: projectRow.id });
  assert.equal(items.length, 2, "el almacenamiento no debe depender de que JEV esté disponible");

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.ok(outcome.brief.context_optimization.optimizer.includes("fallback"), "debe quedar registrado que se usó el fallback determinista, no JEV");
});
