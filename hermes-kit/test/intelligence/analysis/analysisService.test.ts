// analysisService.test.ts — MI-3: contrato de solicitud, provenance,
// caching/reuse, aislamiento por proyecto, abstracción de provider,
// ejecución query-driven, y un item de TikTok de punta a punta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  addEvidence,
  recordMetrics,
  getDb,
  analyzeItems,
  analyzeQuery,
  performanceAnalysisProvider,
  creativeAnalysisProvider,
  ingestCanonicalItem,
  tiktokAdapter,
} from "../../../src/lib/intelligence";
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../../../src/lib/intelligence";
import type { IntelligenceItemWithDerived } from "../../../src/lib/intelligence";
import type { TikTokRawAd } from "../../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("analysis request: acepta project_id + itemIds + analysisType + context/language/market/options", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "req-contract-1",
    content_type: "ad",
    hook: "hook",
  });

  const { run } = await analyzeItems(
    {
      project_id: project.id,
      itemIds: [item.id],
      analysisType: "creative_summary",
      context: { campaign: "lanzamiento-q1" },
      language: "es",
      market: "MX",
      options: { depth: "basic" },
    },
    creativeAnalysisProvider
  );

  const context = JSON.parse(run.context_json!);
  assert.deepEqual(context.context, { campaign: "lanzamiento-q1" });
  assert.equal(context.language, "es");
  assert.equal(context.market, "MX");
  assert.deepEqual(context.options, { depth: "basic" });
});

test("provenance/evidence: un provider puede referenciar evidence existente y queda trazable", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "provenance-1",
    content_type: "ad",
  });
  const evidence = addEvidence({ item_id: item.id, kind: "transcript_fragment", content: "dato real" });

  const providerWithEvidence: AnalysisProvider = {
    name: "test-with-evidence",
    analyze(): AnalysisProviderOutput {
      return { observed: { note: "basado en evidencia real" }, evidenceIds: [evidence.id] };
    },
  };

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "custom_with_evidence" },
    providerWithEvidence
  );

  const linked = getDb()
    .prepare("SELECT evidence_id FROM analysis_run_evidence WHERE analysis_run_id = ?")
    .all(run.id) as Array<{ evidence_id: number }>;
  assert.equal(linked.length, 1);
  assert.equal(linked[0].evidence_id, evidence.id);
});

test("caching/reuse: repetir la misma solicitud sin cambios reutiliza el análisis, no crea uno nuevo", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "cache-1",
    content_type: "ad",
    hook: "hook estable",
  });

  const first = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  const second = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );

  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.run.id, first.run.id, "debe devolver la misma fila, no una nueva");
});

test("caching/reuse: cambiar options invalida el caché y produce un análisis nuevo", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "cache-2",
    content_type: "ad",
  });

  const first = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary", options: { depth: "basic" } },
    creativeAnalysisProvider
  );
  const second = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "creative_summary", options: { depth: "deep" } },
    creativeAnalysisProvider
  );

  assert.equal(first.cached, false);
  assert.equal(second.cached, false);
  assert.notEqual(second.run.id, first.run.id);
});

test("project isolation: analysis_runs de un proyecto no contaminan a otro con el mismo analysisType", async () => {
  const projectA = getOrCreateProject(`proj-a-${randomUUID()}`);
  const projectB = getOrCreateProject(`proj-b-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);

  const { item: itemA } = upsertIntelligenceItem({
    project_id: projectA.id,
    source_id: source.id,
    external_id: "iso-a",
    content_type: "ad",
  });
  const { item: itemB } = upsertIntelligenceItem({
    project_id: projectB.id,
    source_id: source.id,
    external_id: "iso-b",
    content_type: "ad",
  });

  const runA = await analyzeItems(
    { project_id: projectA.id, itemIds: [itemA.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  const runB = await analyzeItems(
    { project_id: projectB.id, itemIds: [itemB.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );

  assert.equal(runA.run.project_id, projectA.id);
  assert.equal(runB.run.project_id, projectB.id);
  assert.notEqual(runA.run.id, runB.run.id);
});

test("provider abstraction: cualquier AnalysisProvider funciona igual, sin acoplarse a un proveedor concreto", async () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "provider-abstraction-1",
    content_type: "ad",
  });

  const mockLlmProvider: AnalysisProvider = {
    name: "mock-llm-provider",
    async analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): Promise<AnalysisProviderOutput> {
      return {
        inferred: { summary: `análisis simulado de ${items.length} item(s)` },
        confidence: 0.42,
        model: "mock-model-v1",
      };
    },
  };

  const { run } = await analyzeItems(
    { project_id: project.id, itemIds: [item.id], analysisType: "llm_summary" },
    mockLlmProvider
  );

  assert.equal(run.provider, "mock-llm-provider");
  assert.equal(run.model, "mock-model-v1");
  assert.equal(run.confidence, 0.42);
  const result = JSON.parse(run.result_json);
  assert.ok(result.inferred.summary.includes("1 item"));
});

test("TikTok item -> MI-3 end-to-end: ingesta (MI-2) seguida de análisis creativo y de performance", async () => {
  const project = `mktg-intel-${randomUUID()}`;
  const raw: TikTokRawAd = {
    id: `tiktok-${randomUUID()}`,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${randomUUID()}`,
    advertiser: { id: `adv-${randomUUID()}`, name: "Vida Divina", handle: "@vidadivina.oficial" },
    caption: "Transforma tu cuerpo en 30 días",
    publish_time: "2026-01-10T12:00:00.000Z",
    first_seen: "2026-01-11T08:00:00.000Z",
    last_seen: "2026-01-20T08:00:00.000Z",
    video: { url: "https://v16.tiktokcdn.com/ad/sculpt-max.mp4", thumbnail_url: "https://p16.tiktokcdn.com/thumb.jpg" },
    stats: { play_count: 20000, digg_count: 1200, comment_count: 60, share_count: 30 },
    hook_text: "Llevo 30 días tomando esto",
    market: "MX",
  };

  const ingested = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));

  const creative = await analyzeItems(
    { project_id: ingested.item.project_id, itemIds: [ingested.item.id], analysisType: "creative_summary" },
    creativeAnalysisProvider
  );
  const performance = await analyzeItems(
    { project_id: ingested.item.project_id, itemIds: [ingested.item.id], analysisType: "performance_delta" },
    performanceAnalysisProvider
  );

  const creativeResult = JSON.parse(creative.run.result_json);
  assert.equal(creativeResult.observed.items[ingested.item.id].hook, "Llevo 30 días tomando esto");

  const perfResult = JSON.parse(performance.run.result_json);
  assert.equal(perfResult.observed.items[ingested.item.id].latest.views, 20000);
});

test("query-driven execution: analyzeQuery resuelve el conjunto vía búsqueda existente y analiza", async () => {
  const { project, source } = setup();
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "query-driven-mx-1",
    content_type: "ad",
    market: "MX",
    hook: "hook mx uno",
  });
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "query-driven-mx-2",
    content_type: "ad",
    market: "MX",
    hook: "hook mx dos",
  });
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "query-driven-us-1",
    content_type: "ad",
    market: "US",
    hook: "hook us uno",
  });

  const { run } = await analyzeQuery(
    { project_id: project.id, query: { project_id: project.id, market: "MX" }, analysisType: "creative_summary" },
    creativeAnalysisProvider
  );

  assert.equal(run.item_ids.length, 2, "solo debe analizar los items MX resueltos por la búsqueda");
});
