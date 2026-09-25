// researchService.test.ts — Research Query orchestrator: reutiliza
// evidencia existente primero, ingiere solo lo necesario, encadena
// analysis→patterns→insights→brief, propaga insufficient_evidence/
// needs_ingestion, mantiene trazabilidad y nunca modifica evidencia
// canónica.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertActor,
  upsertIntelligenceItem,
  getIntelligenceItemById,
  tiktokAdapter,
  runResearchQuery,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  return {
    id: `tiktok-${randomUUID()}`,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${randomUUID()}`,
    advertiser: { id: `adv-${randomUUID()}`, name: "Vida Divina" },
    caption: "Transforma tu cuerpo en 30 días",
    publish_time: "2026-01-10T12:00:00.000Z",
    first_seen: "2026-01-11T08:00:00.000Z",
    last_seen: "2026-01-20T08:00:00.000Z",
    video: { url: "https://v16.tiktokcdn.com/ad/sculpt-max.mp4" },
    stats: { play_count: 20000, digg_count: 1200, comment_count: 60, share_count: 30 },
    hook_text: "Llevo 30 días tomando esto",
    market: "MX",
    ...overrides,
  };
}

/** 2 actores, 2 anuncios con hook compartido -- evidencia ya suficiente sin ingerir nada. */
function realisticFixture() {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "Vida Divina" });
  const advertiserB = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-b", display_name: "Competidor B" });

  const sharedHook = "llevo 30 días tomando esto";
  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "ad-1", content_type: "ad", hook: sharedHook,
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 3 * 86400,
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserB.id,
    external_id: "ad-2", content_type: "ad", hook: sharedHook,
    first_seen_at: 1_700_100_000, last_seen_at: 1_700_100_000 + 3 * 86400,
  });

  return { project, source, item1, item2, sharedHook };
}

// Requisito 1/2/3/4/6: reutiliza evidencia existente, encadena hasta brief, query-driven (se llama explícitamente).
test("usa evidencia existente cuando alcanza -- no ingiere nada, encadena hasta el brief", async () => {
  const { project, item1, item2, sharedHook } = realisticFixture();

  const outcome = await runResearchQuery({
    project: project.slug,
    query: { content_type: "ad" },
    market: "MX",
  });

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  assert.equal(outcome.retrieval.usedExistingEvidenceOnly, true, "requisito 4: reutilizar primero la evidencia existente");
  assert.equal(outcome.retrieval.itemsIngested, 0);
  assert.equal(outcome.retrieval.itemsFoundBeforeIngestion, 2);
  assert.ok(outcome.analysisRuns.length > 0, "debe haber pasado por MI-3 (analysis) en la cadena");
  assert.ok(outcome.brief.patterns.some((p) => p.pattern_type === "creative_hook_repetition"));
  assert.ok(outcome.brief.creative_signals.hooks.includes(sharedHook));
  assert.ok(outcome.brief.provenance.item_ids.includes(item1.id));
  assert.ok(outcome.brief.provenance.item_ids.includes(item2.id));
});

// Requisito 5: solo ingiere cuando la evidencia es insuficiente.
test("evidencia insuficiente + datos para ingerir -> ingiere solo lo necesario y completa la cadena", async () => {
  const { project, source } = setup();
  const advertiserA = upsertActor({ project_id: project.id, source_id: source.id, external_id: "adv-a", display_name: "Vida Divina" });
  const sharedHook = "hook compartido de investigación";
  const { item: existing } = upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, actor_id: advertiserA.id,
    external_id: "existing-1", content_type: "ad", hook: sharedHook,
    first_seen_at: 1_700_000_000, last_seen_at: 1_700_000_000 + 86400,
  });

  const raw = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-b-${randomUUID()}`, name: "Competidor" } });

  const outcome = await runResearchQuery({
    project: project.slug,
    query: { content_type: "ad" },
    minItems: 2,
    ingest: [{ adapter: tiktokAdapter, raw }],
  });

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.retrieval.itemsIngested, 1, "solo debía ingerir lo provisto, ni más ni menos");
  assert.equal(outcome.retrieval.usedExistingEvidenceOnly, false);
  assert.ok(outcome.brief.provenance.item_ids.includes(existing.id), "el item ya existente debe seguir formando parte de la evidencia");

  // No se modificó el item canónico ya existente (requisito 8).
  const reloaded = getIntelligenceItemById(existing.id);
  assert.equal(reloaded?.hook, sharedHook);
  assert.equal(reloaded?.external_id, "existing-1");
});

// Requisito 5/10: sin evidencia suficiente y sin nada que ingerir -> needs_ingestion, nunca fabrica un brief.
test("sin evidencia suficiente y sin datos para ingerir -> needs_ingestion, nunca inventa un brief", async () => {
  const { project, source } = setup();
  upsertIntelligenceItem({
    project_id: project.id, source_id: source.id, external_id: "solo-uno", content_type: "ad", hook: "hook solitario",
  });

  const outcome = await runResearchQuery({
    project: project.slug,
    query: {},
    minItems: 5,
  });

  assert.equal(outcome.status, "needs_ingestion");
  if (outcome.status !== "needs_ingestion") return;
  assert.ok(outcome.reason.length > 0);
  assert.equal(outcome.retrieval.itemsIngested, 0);
});

// Requisito 10: se ingiere lo provisto pero sigue sin alcanzar -> insufficient_evidence (no needs_ingestion, ya se intentó).
test("se ingiere lo provisto pero sigue sin alcanzar el mínimo -> insufficient_evidence", async () => {
  const { project } = setup();
  const raw = tiktokFixture();

  const outcome = await runResearchQuery({
    project: project.slug,
    query: {},
    minItems: 5,
    ingest: [{ adapter: tiktokAdapter, raw }],
  });

  assert.equal(outcome.status, "insufficient_evidence");
  if (outcome.status !== "insufficient_evidence") return;
  assert.equal(outcome.retrieval.itemsIngested, 1);
});

// Requisito 5: freshness -- evidencia suficiente en cantidad pero obsoleta -> needs_ingestion.
test("evidencia suficiente en cantidad pero obsoleta (fuera de la ventana de frescura) -> needs_ingestion", async () => {
  const { project, item1, item2 } = realisticFixture();
  void item2;

  const now = item1.last_seen_at + 999_999; // muy posterior a last_seen_at de ambos items
  const outcome = await runResearchQuery({
    project: project.slug,
    query: {},
    minItems: 2,
    freshnessWindowSeconds: 60,
  });
  // La ventana de frescura se evalúa contra Date.now() real (no `now` de
  // este test), así que fijamos el fixture con last_seen_at ya viejo por
  // diseño (año 2023 aprox, epoch 1_700_000_000) -- siempre estará fuera de
  // cualquier ventana corta real.
  assert.equal(outcome.status, "needs_ingestion");
  void now;
});

// Requisito 7: provenance hasta la evidencia original (vía brief + analysisRuns).
test("provenance: analysisRuns y brief.provenance permiten rastrear hasta los items originales", async () => {
  const { project, item1, item2 } = realisticFixture();
  const outcome = await runResearchQuery({
    project: project.slug,
    query: {},
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;

  assert.ok(outcome.analysisRuns[0].item_ids.includes(item1.id));
  assert.ok(outcome.analysisRuns[0].item_ids.includes(item2.id));
  assert.ok(outcome.brief.provenance.pattern_ids.length > 0);
});

// Requisito 9: JEV/DecisionProvider solo si el caller lo pide explícitamente -- por defecto no se usa.
test("sin contextOptimizer/generationProvider explícitos, no se fuerza ningún uso de JEV", async () => {
  const { project } = realisticFixture();
  const outcome = await runResearchQuery({ project: project.slug, query: {} });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.brief.context_optimization.optimizer, "deterministic");
});

// Cadena completa end-to-end con ingesta real vía adapter de TikTok (MI-2).
test("TikTok end-to-end vía el orquestador: sin evidencia previa, ingiere y completa la cadena hasta el brief", async () => {
  const project = `mktg-intel-${randomUUID()}`;
  const sharedHook = "Llevo 30 días tomando esto";
  const raw1 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-a-${randomUUID()}`, name: "Vida Divina" } });
  const raw2 = tiktokFixture({ hook_text: sharedHook, advertiser: { id: `adv-b-${randomUUID()}`, name: "Competidor" } });

  const outcome = await runResearchQuery({
    project,
    query: { content_type: "ad" },
    minItems: 2,
    ingest: [
      { adapter: tiktokAdapter, raw: raw1 },
      { adapter: tiktokAdapter, raw: raw2 },
    ],
    market: "MX",
    objective: "Investigar hooks de control de peso en TikTok MX",
  });

  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.retrieval.itemsIngested, 2);
  assert.ok(outcome.brief.patterns.some((p) => p.pattern_type === "creative_hook_repetition" && p.scope === "market"));
});
