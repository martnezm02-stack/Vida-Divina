// generateInsightsFromSignals.test.ts — Signal -> Evidence (signal_items)
// -> MI-5 existente (generateInsights, sin tocar). Signals reales creadas
// vía el pipeline completo ya validado (runWatchlistRun +
// processWatchlistRunRelevance con fallback determinista -- no depende de
// JEV real en este suite, igual convención que el resto de la suite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  createWatchlist,
  runWatchlistRun,
  processWatchlistRunRelevance,
  generateInsightsFromSignals,
  getInsightSourceSignalIds,
  listPatternsByProject,
  tiktokAdapter,
} from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function tiktokFixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  const id = `si-${randomUUID()}`;
  return {
    id,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${id}`,
    advertiser: { id: "advertiser-vd-1", name: "Vida Divina" },
    caption: "Contenido de prueba signal->insight",
    video: { url: "https://v16.tiktokcdn.com/si-test.mp4" },
    stats: { play_count: 100, digg_count: 10 },
    ...overrides,
  };
}

async function setup() {
  const project = `signal-insights-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const watchlist = createWatchlist(projectRow.id, "Watchlist signal->insight", "keyword");
  return { project, projectRow, watchlist };
}

/** Ingiere UN item real (con hook dado) y produce SU signal real (fallback determinista, sin JEV). */
async function realSignal(watchlist: { id: number }, hook: string) {
  const raw = tiktokFixture({ hook_text: hook });
  const run = await runWatchlistRun({ watchlistId: watchlist.id, source: "tiktok", adapter: tiktokAdapter, rawItems: [raw] });
  const [processed] = await processWatchlistRunRelevance(run, null);
  return { itemId: run.newItems[0], signal: processed.signal! };
}

test("1) Signal válida -> Insight generado (evidencia real, 2 items comparten hook)", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook compartido ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });

  assert.equal(outcome.status, "ok");
  if (outcome.status === "ok") {
    assert.ok(outcome.insights.length > 0);
    assert.deepEqual(outcome.sourceSignalIds, [a.signal.id, b.signal.id]);
  }
});

test("2) Signal con evidencia insuficiente -> insufficient_evidence (first-class, no se inventa)", async () => {
  const { projectRow, watchlist } = await setup();
  const a = await realSignal(watchlist, `hook único sin repetición ${randomUUID()}`);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id] });

  assert.equal(outcome.status, "insufficient_evidence");
  if (outcome.status === "insufficient_evidence") {
    assert.deepEqual(outcome.sourceSignalIds, [a.signal.id]);
    assert.ok(outcome.reason.length > 0);
  }
});

test("3) Signal vinculada a Pattern ya existente -> lo reutiliza (upsert por pattern_key, sin duplicar)", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook reutilizado ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  const patternsAfterFirst = listPatternsByProject(projectRow.id);
  const matching = patternsAfterFirst.filter((p) => p.pattern_key === sharedHook);
  assert.equal(matching.length, 1, "un solo pattern real para este hook");

  // Un tercer item real con el MISMO hook -- su evidencia, unida a la anterior, debe REUTILIZAR (upsert) el mismo pattern_key, nunca duplicarlo.
  const c = await realSignal(watchlist, sharedHook);
  await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id, c.signal.id] });

  const patternsAfterSecond = listPatternsByProject(projectRow.id);
  const matchingAfter = patternsAfterSecond.filter((p) => p.pattern_key === sharedHook);
  assert.equal(matchingAfter.length, 1, "sigue siendo UN solo pattern -- reutilizado, no duplicado");
  assert.equal(matchingAfter[0].item_support, 3, "el pattern reutilizado refleja la evidencia unida real (3 items)");
});

test("4) Signal sin Pattern preexistente -> utiliza evidencia directa de las signals cuando es suficiente", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook evidencia directa ${randomUUID()}`;

  assert.equal(listPatternsByProject(projectRow.id).filter((p) => p.pattern_key === sharedHook).length, 0, "sin pattern previo");

  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);
  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });

  assert.equal(outcome.status, "ok");
  const patternsAfter = listPatternsByProject(projectRow.id).filter((p) => p.pattern_key === sharedHook);
  assert.equal(patternsAfter.length, 1, "el pattern se derivó FRESCO de la evidencia unida de las signals, no de uno preexistente");
});

test("5) La rationale de JEV/fallback NUNCA se trata como evidencia primaria", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook rationale test ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  // La rationale real de estas signals es texto generado por el fallback determinista (ver relevance/relevanceEngine.ts) -- nunca debe aparecer en el insight.
  assert.ok(a.signal.description && a.signal.description.length > 0);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status === "ok") {
    for (const insight of outcome.insights) {
      assert.equal(insight.content_json?.includes(a.signal.description!), false, "el insight nunca debe incluir literalmente la rationale de la signal");
    }
  }
});

test("6) Insight mantiene provenance de la evidencia (items/patterns reales, vía relevantContext)", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook provenance ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status === "ok") {
    assert.ok(outcome.relevantContext.itemIds.includes(a.itemId));
    assert.ok(outcome.relevantContext.itemIds.includes(b.itemId));
  }
});

test("7) Insight mantiene vínculo trazable con la Signal de origen", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook trazabilidad ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status === "ok") {
    for (const insight of outcome.insights) {
      const sourceIds = getInsightSourceSignalIds(insight);
      assert.ok(sourceIds.includes(a.signal.id));
      assert.ok(sourceIds.includes(b.signal.id));
    }
  }
});

test("8/9) Recommendation mantiene is_recommendation=true y queda separada de facts/findings/interpretation", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook recommendation ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const outcome = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  assert.equal(outcome.status, "ok");
  if (outcome.status === "ok") {
    for (const insight of outcome.insights) {
      const content = JSON.parse(insight.content_json!);
      assert.equal(content.recommendation.is_recommendation, true);
      assert.equal(content.interpretation.is_recommendation, false);
      assert.ok(content.evidence);
      assert.ok(content.finding);
      assert.notEqual(content.finding.statement, content.recommendation.text);
    }
  }
});

test("10) reprocesar la MISMA signal -> no genera duplicación incorrecta (cache/versioning existente de MI-5)", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook reprocess ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const first = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  const second = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  if (first.status === "ok" && second.status === "ok") {
    assert.deepEqual(first.insights.map((i) => i.id), second.insights.map((i) => i.id), "mismo input -> misma versión reutilizada (caching de MI-5), no una fila nueva");
  }
});

test("11) nueva evidencia real -> nueva versión, según las reglas YA existentes de MI-5", async () => {
  const { projectRow, watchlist } = await setup();
  const sharedHook = `hook version ${randomUUID()}`;
  const a = await realSignal(watchlist, sharedHook);
  const b = await realSignal(watchlist, sharedHook);

  const first = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id] });
  assert.equal(first.status, "ok");

  // input_hash de MI-5 depende de pattern.updated_at con granularidad de
  // segundo (unixepoch()) -- dentro del mismo segundo real, más evidencia
  // real produce el MISMO hash y por lo tanto reutiliza la versión
  // existente (caching correcto de MI-5, no un bug de este puente). Para
  // demostrar el mecanismo de versionado YA existente de forma confiable
  // (sin depender de que el reloj real avance entre líneas), se usa
  // force:true -- el mismo flag que ya expone generateInsights().
  const c = await realSignal(watchlist, sharedHook);
  const second = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [a.signal.id, b.signal.id, c.signal.id], force: true });
  assert.equal(second.status, "ok");

  if (first.status === "ok" && second.status === "ok") {
    const firstInsight = first.insights.find((i) => i.source_pattern_id === second.insights.find((s) => s.source_pattern_id === i.source_pattern_id)?.source_pattern_id);
    const matchingSecond = second.insights.find((i) => i.source_pattern_id === firstInsight?.source_pattern_id);
    assert.ok(firstInsight && matchingSecond);
    assert.ok(matchingSecond!.version > firstInsight!.version, "force:true (mecanismo YA existente de MI-5) produce una versión nueva, nunca sobrescribe la anterior");
  }
});

test("12) multi-source: Instagram/Meta Ads/TikTok pasan por el MISMO pipeline signal->insight, sin lógica por plataforma", async () => {
  const { projectRow, watchlist } = await setup();
  const { instagramAdapter, metaAdsAdapter } = await import("../../../src/lib/intelligence");
  const sharedHook = `hook multi-source ${randomUUID()}`;

  // Ni instagramAdapter.ts ni metaAdsAdapter.ts poblan hook/cta/offer (por
  // diseño explícito de ambos -- ver sus propios docstrings: requeriría
  // interpretar texto libre, fuera de lo que MI-2 normaliza de forma
  // determinista). Solo TikTok lo hace directamente desde hook_text. Por
  // eso la evidencia que SÍ comparte hook es TikTok+TikTok -- lo real y
  // honesto aquí es demostrar que el MISMO pipeline (a) procesa señales de
  // las tres fuentes sin ninguna rama específica por plataforma, y (b) al
  // combinar evidencia real de varias fuentes en un solo pool, el patrón
  // se detecta igual sobre la unión, sin importar de qué fuente vino cada item.
  const igRaw = { id: `ig-${randomUUID()}`, shortcode: `ig-${randomUUID()}`, caption: "Post real de Instagram, sin hook estructurado", owner: { username: "vidadivina.oficial" } };
  const igRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "instagram", adapter: instagramAdapter, rawItems: [igRaw] });
  const [igProcessed] = await processWatchlistRunRelevance(igRun, null);

  const metaRaw = { id: `meta-${randomUUID()}`, page_id: 102551798150702, page_name: "Vida Divina", ad_creation_time: 1790289826, ad_delivery_start_time: 1790294878, ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${randomUUID()}`, currency: "MXN" };
  const metaRun = await runWatchlistRun({ watchlistId: watchlist.id, source: "meta_ads", adapter: metaAdsAdapter, rawItems: [metaRaw] });
  const [metaProcessed] = await processWatchlistRunRelevance(metaRun, null);

  const tiktokA = await realSignal(watchlist, sharedHook);
  const tiktokB = await realSignal(watchlist, sharedHook);

  // Instagram/Meta Ads solas: evidencia real pero sin repetición -> insufficient_evidence, resultado honesto (no un error del pipeline).
  const igOnly = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [igProcessed.signal!.id] });
  const metaOnly = await generateInsightsFromSignals({ project_id: projectRow.id, signalIds: [metaProcessed.signal!.id] });
  assert.equal(igOnly.status, "insufficient_evidence");
  assert.equal(metaOnly.status, "insufficient_evidence");

  // Las 4 signals juntas (Instagram + Meta Ads + 2 TikTok): MISMA llamada, MISMA función,
  // sin ninguna rama por fuente -- el patrón real (hook compartido por los 2 items TikTok
  // dentro del pool) se detecta igual, la evidencia de Instagram/Meta Ads se examina pero no aporta repetición.
  const pooled = await generateInsightsFromSignals({
    project_id: projectRow.id,
    signalIds: [igProcessed.signal!.id, metaProcessed.signal!.id, tiktokA.signal.id, tiktokB.signal.id],
  });
  assert.equal(pooled.status, "ok", "evidencia real de 3 fuentes combinada en un solo pool, mismo pipeline");
  if (pooled.status === "ok") {
    assert.equal(pooled.items.length, 4, "las 4 signals -> 4 items reales examinados, de 3 fuentes distintas");
    const sourceIds = new Set(pooled.items.map((i) => i.source_id));
    assert.equal(sourceIds.size, 3, "items de 3 source_id distintos en el mismo pool");
  }
});
