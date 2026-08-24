import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { PublishingScheduler } from '../../publishing-scheduler/src/publishingScheduler.js';
import { planContent, listContentPlans, getContentPlan, runContentPlanQualityGate, runAssetPackageQualityGate } from '../src/contentPlanningService.js';
import { setAutoPublishEnabled } from '../src/autoPublishConfig.js';
import { createStrategyDecision } from '../../strategy-decision-engine/src/strategyDecision.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../performance-learning-intelligence/src/performanceSignal.js';

function seedRealAcceptDecision(store, { platform = 'instagram' } = {}) {
  store.save('strategy_decision', createStrategyDecision({
    strategyFeedbackId: 'sf-test', decision: 'ACCEPT', decisionReason: 'La recomendación cumple evidencia mínima.',
    evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' }, confidence: 'HIGH', evidenceCount: 12,
    scope: `${platform} (N=12)`, scopeType: 'PLATFORM', affectedPlatform: platform, expectedDirection: 'IMPROVE', expectedImpact: 'MEDIUM', risk: 'LOW',
  }));
}
/** Fase 13, Parte 12: readiness=READY exige evidencia real en 3 capas (Performance/Publication/Strategy) -- se siembra explícitamente aquí solo para el test que necesita eligible=true de punta a punta. */
function seedReadinessEvidence(store) {
  for (let i = 0; i < MIN_BASELINE_SAMPLE_SIZE; i++) {
    store.save('published_content', createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'video', topic: 'x' }));
  }
}

function fakePublicationStore() {
  const map = new Map();
  return { save: (r) => { map.set(r.id, r); return r; }, get: (id) => map.get(id) ?? null, exists: (id) => map.has(id), list: () => [...map.values()], del: (id) => map.delete(id) };
}
function fakeScheduler(publicationStore) {
  // Reutiliza la clase REAL (publishing-scheduler), nunca reimplementa approve()/schedule() -- solo evita instanciar MediaHostingService/publish reales en tests unitarios (nunca invocados por approve/schedule).
  return new PublishingScheduler({ mediaHostingService: {}, publish: () => {}, store: publicationStore });
}
function realCompletedAssetPackage(overrides = {}) {
  return { requestId: 'req-real-1', mode: 'CREATE', status: 'COMPLETED', outputAssets: [{ assetId: 'asset-1', path: '/tmp/asset-1.mp4' }], sourceAssets: [], derivedAssets: [], audioAssets: [], outputProfiles: ['INSTAGRAM_REEL'], lineage: [], errors: [], warnings: [], ...overrides };
}

describe('ContentPlanningService — planContent (Fase 12 + Fase 13)', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'cp-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('userIntent sin producto real -> FAILED_GENERATION, nunca inventa un producto', async () => {
    const { plan } = await planContent({ userIntent: 'Quiero vender algo, no sé qué.', store });
    assert.equal(plan.status, 'FAILED_GENERATION');
  });

  test('PROPOSAL_READY real + Quality Gate pasado -> READY_FOR_REVIEW, sin AssetPackage (Fase 12, sin cambios)', async () => {
    const { plan, deduped } = await planContent({ userIntent: 'Campaña de TéDivina', store });
    assert.equal(deduped, false);
    assert.equal(plan.status, 'READY_FOR_REVIEW');
    assert.equal(plan.assetPackageId, null);
    assert.equal(plan.publicationId, null);
  });

  test('idempotencia: misma entrada efectiva -- la segunda corrida reutiliza el ContentPlan existente', async () => {
    const before = store.loadAll('content_plan').length;
    const { deduped } = await planContent({ userIntent: 'Campaña de TéDivina', store });
    assert.equal(deduped, true);
    assert.equal(store.loadAll('content_plan').length, before);
  });

  test('Quality Gate real sobre la propuesta: lenguaje causal -> QUALITY_FAILED, nunca avanza', async () => {
    const causalCopyProvider = { generate: async () => ({ hook: 'x', script: ['Este producto causa una mejora real.'], voiceoverText: 'x', cta: 'Escríbenos', variants: [], provider: 'fake_test', mode: 'fake', missingFields: [] }) };
    const { plan } = await planContent({ userIntent: 'Campaña de TéDivina para quality gate', executionMode: 'HUMAN_REVIEW', copyProvider: causalCopyProvider, store });
    assert.equal(plan.status, 'QUALITY_FAILED');
    assert.ok(plan.qualityGateResult && plan.qualityGateResult.passed === false);
  });

  test('HUMAN_REVIEW con AssetPackage real ya provisto -> ScheduledPublication DRAFT real, nunca aprobada/publicada aquí', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-hr-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    const { plan } = await planContent({
      userIntent: 'Necesito contenido de Instagram para TéDivina para revisión humana',
      executionMode: 'HUMAN_REVIEW', assetPackage: realCompletedAssetPackage(), caption: 'Caption real.', store: store2, strategyStore: store2, publicationStore: pubStore,
    });
    assert.equal(plan.status, 'READY_FOR_REVIEW');
    const scheduled = pubStore.get(plan.publicationId);
    assert.equal(scheduled.status, 'DRAFT');
    assert.equal(scheduled.externalPublicationId, null);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('AssetPackage real no-COMPLETED (Quality Gate real) -> QUALITY_FAILED, nunca avanza a agendar', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-badpkg-'));
    const store2 = new PerformanceLearningStore(dir2);
    const { plan } = await planContent({
      userIntent: 'Necesito contenido de Instagram para TéDivina paquete incompleto',
      executionMode: 'HUMAN_REVIEW', assetPackage: realCompletedAssetPackage({ status: 'PARTIAL', errors: ['render parcial'] }), store: store2, strategyStore: store2,
    });
    assert.equal(plan.status, 'QUALITY_FAILED');
    rmSync(dir2, { recursive: true, force: true });
  });

  test('AUTO_PUBLISH sin AssetPackage real -- genera y valida la propuesta igual que los otros modos (Fase 13 Parte 5), nunca publica sin un asset real', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-noasset-'));
    const store2 = new PerformanceLearningStore(dir2);
    const { plan } = await planContent({ userIntent: 'Campaña de TéDivina para auto publish sin asset', executionMode: 'AUTO_PUBLISH', store: store2, strategyStore: store2 });
    assert.equal(plan.status, 'READY_FOR_REVIEW');
    assert.equal(plan.publicationId, null);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('AUTO_PUBLISH con AssetPackage real pero política GLOBAL deshabilitada (default) -> AUTO_PUBLISH_NOT_ELIGIBLE, DRAFT preparado, nunca aprobado (Fase 13 Parte 6/9/11)', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-disabled-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    const { plan } = await planContent({
      userIntent: 'Necesito contenido de Instagram para TéDivina auto publish deshabilitado',
      executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore),
    });
    assert.equal(plan.status, 'AUTO_PUBLISH_NOT_ELIGIBLE');
    assert.equal(plan.autoPublish.eligible, false);
    assert.ok(plan.autoPublish.reasons.some((r) => r.includes('disabled')));
    const scheduled = pubStore.get(plan.publicationId);
    assert.equal(scheduled.status, 'DRAFT'); // preparado, nunca aprobado
    rmSync(dir2, { recursive: true, force: true });
  });

  test('AUTO_PUBLISH plenamente elegible (política ON + AssetPackage COMPLETED + StrategyDecision ACCEPT real) -> SCHEDULED real, aprobado por el actor humano que activó la política, nunca publicado síncronamente aquí (Fase 13 Parte 11/15)', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-eligible-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    pubStore.save({ id: 'prior-published', status: 'PUBLISHED' }); // evidencia real de publicación previa exitosa -- Parte 12/13 readiness
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store: store2 });
    seedRealAcceptDecision(store2, { platform: 'instagram' });
    seedReadinessEvidence(store2);

    const { plan } = await planContent({
      userIntent: 'Necesito contenido de Instagram para TéDivina auto publish elegible',
      executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore),
    });
    assert.equal(plan.status, 'SCHEDULED');
    assert.equal(plan.autoPublish.eligible, true);
    const scheduled = pubStore.get(plan.publicationId);
    assert.equal(scheduled.status, 'SCHEDULED');
    assert.equal(scheduled.approvedBy, 'Manuel Martínez'); // nunca "system"/"auto"/"bot"
    assert.equal(scheduled.externalPublicationId, null); // NUNCA publicado por planContent() -- solo el tick real del scheduler lo hace
    rmSync(dir2, { recursive: true, force: true });
  });

  test('política ON pero readiness NOT_READY (sin evidencia real suficiente) -> AUTO_PUBLISH_NOT_ELIGIBLE, nunca aprueba (Fase 13 Parte 15: enabled+readiness son condiciones independientes)', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-notready-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore(); // sin ningún PUBLISHED -- readiness real será NOT_READY
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store: store2 });
    seedRealAcceptDecision(store2, { platform: 'instagram' });

    const { plan } = await planContent({
      userIntent: 'Necesito contenido de Instagram para TéDivina readiness insuficiente',
      executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore),
    });
    assert.equal(plan.status, 'AUTO_PUBLISH_NOT_ELIGIBLE');
    assert.ok(plan.autoPublish.reasons.some((r) => r.includes('readiness')));
    rmSync(dir2, { recursive: true, force: true });
  });

  test('idempotencia AUTO_PUBLISH: no existe publicación previa (regla #10) -- segunda corrida deduplica el ContentPlan, nunca crea una segunda ScheduledPublication', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-idem-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store: store2 });
    seedRealAcceptDecision(store2, { platform: 'instagram' });
    const r1 = await planContent({ userIntent: 'Necesito contenido de Instagram para TéDivina idempotencia auto publish', executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore) });
    const r2 = await planContent({ userIntent: 'Necesito contenido de Instagram para TéDivina idempotencia auto publish', executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore) });
    assert.equal(r2.deduped, true);
    assert.equal(r1.plan.id, r2.plan.id);
    assert.equal(pubStore.list().length, 1);
    rmSync(dir2, { recursive: true, force: true });
  });

  test('DEFER/REJECT bloquean AUTO_PUBLISH: sin StrategyDecision ACCEPT real, la elegibilidad falla (regla #3/#4)', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-noaccept-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store: store2 });
    // Sin StrategyDecision real en el store (aislado vía strategyStore: store2) -> strategyContext.applied=false -> strategyDecisionIds=[] -> elegibilidad debe fallar por "No StrategyDecision associated".
    const { plan } = await planContent({ userIntent: 'Necesito contenido de Facebook para TéDivina sin decision', executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore) });
    assert.equal(plan.status, 'AUTO_PUBLISH_NOT_ELIGIBLE');
    assert.ok(plan.autoPublish.reasons.some((r) => r.includes('No StrategyDecision')));
    rmSync(dir2, { recursive: true, force: true });
  });

  test('plataforma no soportada para agendar bloquea AUTO_PUBLISH y HUMAN_REVIEW (regla #8)', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cp-ap-badplat-'));
    const store2 = new PerformanceLearningStore(dir2);
    const pubStore = fakePublicationStore();
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store: store2 });
    const { plan } = await planContent({ userIntent: 'Campaña de TéDivina sin plataforma explícita', executionMode: 'AUTO_PUBLISH', assetPackage: realCompletedAssetPackage(), store: store2, strategyStore: store2, publicationStore: pubStore, scheduler: fakeScheduler(pubStore) });
    // Sin "instagram"/"facebook" mencionados, platform cae a WHATSAPP_VIDEO -- no schedulable.
    assert.equal(plan.status, 'AUTO_PUBLISH_NOT_ELIGIBLE');
    assert.equal(plan.publicationId, null); // sin plataforma agendable, ni siquiera se prepara un DRAFT
    rmSync(dir2, { recursive: true, force: true });
  });

  test('filtros de listContentPlans/getContentPlan', () => {
    const readyPlans = listContentPlans({ store, status: 'READY_FOR_REVIEW' });
    assert.ok(readyPlans.length > 0);
    assert.ok(readyPlans.every((p) => p.status === 'READY_FOR_REVIEW'));
    assert.equal(getContentPlan({ store, id: 'no-existe' }), null);
  });

  test('backward compatibility: buildCreativeProposal sigue funcionando igual, sin ContentPlan', async () => {
    const { buildCreativeProposal } = await import('../../content-orchestrator/src/autonomousCreate.js');
    const proposal = await buildCreativeProposal({ userIntent: 'Campaña de TéDivina' });
    assert.equal(proposal.status, 'PROPOSAL_READY');
  });
});

describe('runContentPlanQualityGate / runAssetPackageQualityGate — Fase 7 / Fase 13 Parte 4', () => {
  test('propuesta sin PROPOSAL_READY nunca pasa', () => {
    assert.equal(runContentPlanQualityGate({ status: 'MISSING_PRODUCT', hook: null, script: [], cta: null }).passed, false);
  });
  test('texto limpio pasa', () => {
    assert.equal(runContentPlanQualityGate({ status: 'PROPOSAL_READY', hook: 'Un hook real', script: ['Una línea real'], cta: 'Escríbenos por WhatsApp' }).passed, true);
  });
  test('certeza inventada detectada -> falla', () => {
    assert.equal(runContentPlanQualityGate({ status: 'PROPOSAL_READY', hook: 'x', script: ['Resultado garantizado desde la primera semana.'], cta: 'x' }).passed, false);
  });
  test('AssetPackage COMPLETED pasa, cualquier otro status falla (mismo criterio que createScheduledPublication)', () => {
    assert.equal(runAssetPackageQualityGate({ status: 'COMPLETED' }).passed, true);
    assert.equal(runAssetPackageQualityGate({ status: 'PARTIAL' }).passed, false);
    assert.equal(runAssetPackageQualityGate(null).passed, false);
  });
});
