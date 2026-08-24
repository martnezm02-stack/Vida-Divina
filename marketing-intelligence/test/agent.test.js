import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecord } from '../src/contract.js';
import { RawStore } from '../src/storage/rawStore.js';
import { IntelligenceStore } from '../src/storage/intelligenceStore.js';
import { AnalysisCache } from '../src/storage/analysisCache.js';
import { CostGuard } from '../src/agent/costGuard.js';
import { HeuristicLLMProvider } from '../src/llm/heuristicProvider.js';
import { LLMProvider } from '../src/llm/llmProvider.js';
import { MarketingIntelligenceAgent } from '../src/agent/marketingIntelligenceAgent.js';

class FakePaidProvider extends LLMProvider {
  get name() { return 'fake_paid_v1'; }
  get costPerDocumentUsd() { return 0.05; }
  async analyze() { return [{ dimension: 'HOOK', value: 'pregunta', evidence_quote: 'x', confidence: 0.5, confidence_basis: 'fixture' }]; }
}

// Simula un proveedor real (Fase 5): expone model/promptVersion/lastUsage,
// tal como haría AnthropicLLMProvider tras una llamada real.
class FakeRealProvider extends LLMProvider {
  get name() { return 'fake_real_v1'; }
  get model() { return 'fake-model-1'; }
  get promptVersion() { return 'fake-prompt-v1'; }
  get costPerDocumentUsd() { return 0.02; }
  get lastUsage() { return this._lastUsage ?? null; }
  async analyze(content) {
    this._lastUsage = {
      provider: this.name, model: this.model, prompt_version: this.promptVersion,
      input_tokens: 42, output_tokens: 7, estimated_cost_usd: 0.0009,
      analysis_timestamp: new Date().toISOString(),
    };
    return [{ dimension: 'CTA', value: 'x', evidence_quote: content.slice(0, 3), confidence: 0.5, confidence_basis: 'fixture' }];
  }
}

function makeRawRecord(content, url = 'https://fixture.test/agent') {
  return createRecord({ source: 'web', platform_object_type: 'article', url, content, access_method: 'specialized_tool' });
}

describe('MarketingIntelligenceAgent — desacoplado de adapters y de proveedor', () => {
  let dir, rawStore, intelligenceStore, analysisCache;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'mi-agent-'));
    rawStore = new RawStore(join(dir, 'raw'));
    intelligenceStore = new IntelligenceStore(join(dir, 'intelligence'));
    analysisCache = new AnalysisCache(join(dir, 'cache'));
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test('analiza un registro RAW y genera observaciones trazables', async () => {
    const record = makeRawRecord('¿Sabías que compra ahora es la mejor decisión?');
    rawStore.save(record);

    const agent = new MarketingIntelligenceAgent({
      provider: new HeuristicLLMProvider(),
      intelligenceStore, analysisCache,
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10 }),
    });

    const result = await agent.analyzeRecord(record);
    assert.equal(result.skipped, false);
    assert.ok(result.observations.length > 0);
    for (const obs of result.observations) {
      assert.equal(obs.raw_id, record.record_id);
      assert.equal(obs.basis, 'OBSERVADO');
    }
  });

  test('no reanaliza el mismo contenido con el mismo proveedor (AnalysisCache)', async () => {
    const record = makeRawRecord('Contenido único para probar el cache de análisis.', 'https://fixture.test/cache');
    rawStore.save(record);

    const agent = new MarketingIntelligenceAgent({
      provider: new HeuristicLLMProvider(),
      intelligenceStore, analysisCache,
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10 }),
    });

    const first = await agent.analyzeRecord(record);
    const second = await agent.analyzeRecord(record);
    assert.equal(first.skipped, false);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'already_analyzed');
  });

  test('forceReanalyze ignora el cache deliberadamente', async () => {
    const record = makeRawRecord('Otro contenido distinto para forceReanalyze.', 'https://fixture.test/force');
    rawStore.save(record);

    const agent = new MarketingIntelligenceAgent({
      provider: new HeuristicLLMProvider(),
      intelligenceStore, analysisCache,
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10 }),
    });

    await agent.analyzeRecord(record);
    const forced = await agent.analyzeRecord(record, { forceReanalyze: true });
    assert.equal(forced.skipped, false);
  });

  test('un proveedor pagado se detiene al agotar max_llm_budget_usd dentro de un lote', async () => {
    const records = [
      makeRawRecord('doc 1', 'https://fixture.test/paid-1'),
      makeRawRecord('doc 2', 'https://fixture.test/paid-2'),
      makeRawRecord('doc 3', 'https://fixture.test/paid-3'),
    ];
    for (const r of records) rawStore.save(r);

    const localCache = new AnalysisCache(join(dir, 'cache-paid'));
    const agent = new MarketingIntelligenceAgent({
      provider: new FakePaidProvider(),
      intelligenceStore: new IntelligenceStore(join(dir, 'intelligence-paid')),
      analysisCache: localCache,
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0.10, maxDocumentsPerRun: 100 }), // alcanza para 2 documentos, no 3
    });

    const results = await agent.analyzeBatch(records);
    const processed = results.filter((r) => !r.skipped);
    const stopped = results.filter((r) => r.skipped && r.reason === 'max_llm_budget_usd_reached');

    assert.equal(processed.length, 2, 'debe procesar exactamente 2 documentos antes de agotar el presupuesto');
    assert.equal(stopped.length, 1, 'el tercer documento debe detenerse por presupuesto, no procesarse de todos modos');
  });

  test('un documento que excede max_tokens_per_document se omite ANTES de llamar al proveedor (Fase 5, §3)', async () => {
    const bigRecord = makeRawRecord('palabra '.repeat(2000), 'https://fixture.test/too-big');
    rawStore.save(bigRecord);

    let providerCalled = false;
    class NeverCalledProvider extends HeuristicLLMProvider {
      async analyze(...args) { providerCalled = true; return super.analyze(...args); }
    }

    const agent = new MarketingIntelligenceAgent({
      provider: new NeverCalledProvider(),
      intelligenceStore, analysisCache: new AnalysisCache(join(dir, 'cache-toobig')),
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10, maxTokensPerDocument: 100 }),
    });

    const result = await agent.analyzeRecord(bigRecord);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'max_tokens_per_document_exceeded');
    assert.equal(providerCalled, false, 'el proveedor nunca debe invocarse si el documento excede el límite de tokens');
  });

  test('registra una auditoría de costos (cost_audit) cuando el proveedor reporta uso real — nunca para el proveedor heurístico', async () => {
    const record = makeRawRecord('Contenido para auditoría de costos.', 'https://fixture.test/cost-audit');
    rawStore.save(record);

    const localIntelligenceStore = new IntelligenceStore(join(dir, 'intelligence-cost-audit'));
    const agent = new MarketingIntelligenceAgent({
      provider: new FakeRealProvider(),
      intelligenceStore: localIntelligenceStore,
      analysisCache: new AnalysisCache(join(dir, 'cache-cost-audit')),
      costGuard: new CostGuard({ maxLlmBudgetUsd: 1, maxDocumentsPerRun: 10 }),
    });

    await agent.analyzeRecord(record);

    const audits = localIntelligenceStore.loadAll('cost_audit');
    assert.equal(audits.length, 1);
    assert.equal(audits[0].provider, 'fake_real_v1');
    assert.equal(audits[0].model, 'fake-model-1');
    assert.equal(audits[0].prompt_version, 'fake-prompt-v1');
    assert.equal(audits[0].raw_id, record.record_id);
    assert.equal(audits[0].content_hash, record.content_hash);
    assert.ok(!('apiKey' in audits[0]) && !JSON.stringify(audits[0]).match(/sk-ant/i), 'la auditoría de costos nunca debe contener credenciales');
  });

  test('las observaciones producidas por un proveedor real incluyen requires_human_review, model y prompt_version', async () => {
    const record = makeRawRecord('Otro contenido distinto para verificar campos.', 'https://fixture.test/fields');
    rawStore.save(record);

    const agent = new MarketingIntelligenceAgent({
      provider: new FakeRealProvider(),
      intelligenceStore: new IntelligenceStore(join(dir, 'intelligence-fields')),
      analysisCache: new AnalysisCache(join(dir, 'cache-fields')),
      costGuard: new CostGuard({ maxLlmBudgetUsd: 1, maxDocumentsPerRun: 10 }),
    });

    const result = await agent.analyzeRecord(record);
    assert.equal(result.observations[0].requires_human_review, true);
    assert.equal(result.observations[0].model, 'fake-model-1');
    assert.equal(result.observations[0].prompt_version, 'fake-prompt-v1');
  });
});
