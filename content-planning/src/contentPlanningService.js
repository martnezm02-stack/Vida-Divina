// contentPlanningService.js — ContentPlanningService (Fase 12 + Fase 13).
// Orquesta, sin reimplementar ninguno:
//   - buildCreativeProposal (content-orchestrator, ya Strategy-Aware)
//   - generateContent (content-orchestrator/src/contentGenerationEngine.js
//     -- el ÚNICO renderer real, mismo punto de entrada real que
//     dashboard/server/routes/generation.js#handleCreate usa para POST
//     /api/create; Fase 13 Parte 1)
//   - textSafetyChecks.js (Quality Gate, funciones puras de texto)
//   - createScheduledPublication + PublishingScheduler (publishing-scheduler)
//     -- el PublicationRecord real, con approve()/schedule() reales
//   - MediaHostingService + publishingService#publish reales (mismas
//     instancias reales que dashboard/server/lib/schedulerInstance.js,
//     construidas aquí con los MISMOS argumentos para no depender
//     circularmente de dashboard/)
//   - isAutoPublishEligible/getCurrentAutoPublishConfig (este mismo módulo)
//
// LÍMITE DELIBERADO (Fase 12 Parte 5/8, reafirmado en Fase 13 Parte 1):
// generateContent() real requiere hook/script/cta/audio/imagen YA
// resueltos por un humano (el motor "nunca redacta el guion") -- por eso
// planContent() SOLO llama a generateContent() cuando el llamador provee
// `generationInputs` reales (el mismo shape que ya usa handleCreate);
// nunca fabrica esos insumos. Sin ellos, se detiene en PROPOSAL_READY
// (Fase 12, sin cambios).

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { buildCreativeProposal } from '../../content-orchestrator/src/autonomousCreate.js';
import { generateContent } from '../../content-orchestrator/src/contentGenerationEngine.js';
import { parseContentGenerationRequest } from '../../content-orchestrator/src/contentGenerationRequest.js';
import { detectCausalLanguage, detectInventedCertainty } from '../../content-strategy/src/textSafetyChecks.js';
import { createScheduledPublication } from '../../publishing-scheduler/src/scheduledPublication.js';
import { PublishingScheduler } from '../../publishing-scheduler/src/publishingScheduler.js';
import * as defaultPublicationStore from '../../publishing-scheduler/src/scheduledPublicationStore.js';
import { MediaHostingService } from '../../media-hosting/src/mediaHostingService.js';
import { publish as defaultPublish } from '../../content-orchestrator/src/publishing/publishingService.js';
import { createContentPlan, EXECUTION_MODES } from './contentPlan.js';
import { getCurrentAutoPublishConfig } from './autoPublishConfig.js';
import { computeAutoPublishReadiness } from './autoPublishReadiness.js';
import { isAutoPublishEligible } from './autoPublishEligibility.js';

const PROPOSAL_PLATFORM_TO_SCHEDULABLE = Object.freeze({ INSTAGRAM_REEL: 'INSTAGRAM', FACEBOOK_REEL: 'FACEBOOK' });

/** Fase 12 Parte 7 / Fase 13 -- Quality Gate reutilizado tal cual sobre la propuesta (texto), nunca un segundo detector. */
export function runContentPlanQualityGate(proposal) {
  const failures = [];
  if (proposal.status !== 'PROPOSAL_READY') failures.push(`generación no completada (status=${proposal.status})`);
  if (!proposal.hook?.trim()) failures.push('hook ausente');
  if (!Array.isArray(proposal.script) || proposal.script.length === 0) failures.push('script ausente');
  if (!proposal.cta?.trim()) failures.push('cta ausente');

  const fullText = [proposal.hook, ...(proposal.script ?? []), proposal.cta].filter(Boolean).join(' ');
  if (fullText.trim()) {
    const causal = detectCausalLanguage(fullText);
    if (causal) failures.push(`lenguaje de causalidad detectado (${causal})`);
    const invented = detectInventedCertainty(fullText);
    if (invented) failures.push(`afirmación de certeza no verificada ("${invented}")`);
  }
  return { passed: failures.length === 0, failures };
}

/** Fase 13 Parte 4 -- Quality Gate sobre un AssetPackage REAL ya renderizado: solo COMPLETED puede avanzar (mismo criterio que createScheduledPublication ya exige). */
export function runAssetPackageQualityGate(assetPackage) {
  const failures = [];
  if (!assetPackage) failures.push('AssetPackage ausente');
  else if (assetPackage.status !== 'COMPLETED') failures.push(`AssetPackage no está COMPLETED (status=${assetPackage.status}) — ${(assetPackage.errors ?? []).join('; ') || 'sin detalle adicional'}`);
  return { passed: failures.length === 0, failures };
}

function dedupeKey({ strategyDecisionIds, productId, platform, executionMode }) {
  // Fase 19 -- identidad estructurada: nunca caption, nunca timestamp.
  return [[...strategyDecisionIds].sort().join(','), productId ?? 'no-product', platform ?? 'no-platform', executionMode].join('::');
}

function findExisting(store, key) {
  return store.loadAll('content_plan').find((p) => dedupeKey({ strategyDecisionIds: p.strategyDecisionIds, productId: p.generationRequest?.productId ?? null, platform: p.platform, executionMode: p.executionMode }) === key) ?? null;
}

function persist(store, plan) {
  store.save('content_plan', plan);
  return { plan, deduped: false };
}

function schedulablePlatformFor(proposalPlatform) {
  return PROPOSAL_PLATFORM_TO_SCHEDULABLE[proposalPlatform] ?? null;
}

/** Fase 13 -- misma construcción real que dashboard/server/lib/schedulerInstance.js, sin depender de dashboard/ (evita un import circular dashboard<->content-planning). Mismas clases/funciones reales, nunca un segundo scheduler. */
function defaultScheduler() {
  return new PublishingScheduler({ mediaHostingService: new MediaHostingService(), publish: defaultPublish });
}

/**
 * Fase 12 Parte 3/25 + Fase 13 -- punto explícito de planificación (nunca
 * un loop autónomo).
 * @param {{
 *   userIntent:string, executionMode?:string, copyProvider?:object,
 *   assetPackage?:object|null, generationInputs?:object|null,
 *   publishDestination?:string|null, caption?:string|null, requireHumanReview?:boolean,
 *   store?:object, strategyStore?:object, publicationStore?:object, scheduler?:object,
 * }} params
 */
export async function planContent({
  userIntent, executionMode = 'PREPARE_ONLY', copyProvider = undefined,
  assetPackage = null, generationInputs = null,
  publishDestination = null, caption = null, requireHumanReview = false,
  store = defaultStore, strategyStore = undefined,
  publicationStore = defaultPublicationStore, scheduler = null,
} = {}) {
  if (!EXECUTION_MODES.includes(executionMode)) {
    throw new Error(`planContent: "executionMode" inválido "${executionMode}" (válidos: ${EXECUTION_MODES.join(', ')}).`);
  }

  const proposal = await buildCreativeProposal({ userIntent, copyProvider, strategyStore });
  const strategyDecisionIds = proposal.strategyContext?.strategyDecisionIds ?? [];
  const key = dedupeKey({ strategyDecisionIds, productId: proposal.product?.productId ?? null, platform: proposal.platform ?? null, executionMode });
  const existing = findExisting(store, key);
  if (existing) return { plan: existing, deduped: true };

  const basePlanFields = {
    strategyDecisionIds, strategyContext: proposal.strategyContext ?? null,
    objective: proposal.objective ?? null, platform: proposal.platform ?? null,
    format: proposal.format ?? null, product: proposal.product?.nombreComercial ?? null,
    cta: proposal.cta ?? null, executionMode, requireHumanReview,
    generationRequest: { userIntent, productId: proposal.product?.productId ?? null, status: proposal.status },
  };

  if (proposal.status !== 'PROPOSAL_READY') {
    return persist(store, createContentPlan({ ...basePlanFields, status: 'FAILED_GENERATION', reason: (proposal.errors ?? [proposal.status]).join(' ') }));
  }

  const proposalGate = runContentPlanQualityGate(proposal);
  if (!proposalGate.passed) {
    return persist(store, createContentPlan({ ...basePlanFields, status: 'QUALITY_FAILED', qualityGateResult: proposalGate, reason: proposalGate.failures.join('; ') }));
  }
  basePlanFields.priority = proposal.strategyContext?.applied ? proposal.strategyContext.priority : null;

  // Fase 13 Parte 1/2/3 -- Real Asset Generation: si el llamador provee
  // insumos reales de render (mismo shape que handleCreate ya valida y
  // exige), se llama al ÚNICO renderer real; si no, se detiene en
  // PROPOSAL_READY (Fase 12, comportamiento sin cambios).
  let realAssetPackage = assetPackage;
  if (!realAssetPackage && generationInputs) {
    const request = parseContentGenerationRequest({ rawText: userIntent, productId: generationInputs.productId, forcedMode: 'CREATE' });
    try {
      realAssetPackage = generateContent(request, generationInputs);
    } catch (err) {
      return persist(store, createContentPlan({ ...basePlanFields, status: 'RENDER_FAILED', reason: err.message }));
    }
  }

  // Fase 13 Parte 4 -- Quality Gate obligatorio sobre CUALQUIER AssetPackage
  // real que vaya a avanzar (recién renderizado vía generationInputs, o ya
  // provisto directamente por el llamador): nunca avanza a agendar/publicar
  // sin pasar por aquí.
  if (realAssetPackage) {
    const assetGate = runAssetPackageQualityGate(realAssetPackage);
    if (!assetGate.passed) {
      return persist(store, createContentPlan({ ...basePlanFields, status: 'QUALITY_FAILED', qualityGateResult: assetGate, assetPackageId: realAssetPackage.requestId ?? null, reason: assetGate.failures.join('; ') }));
    }
  }

  if (!realAssetPackage) {
    return persist(store, createContentPlan({ ...basePlanFields, status: 'READY_FOR_REVIEW', reason: 'Propuesta lista. Para completar hasta AssetPackage real, usar el flujo ya existente e intacto (dashboard: "USAR EN CREAR →" / POST /api/create, o pasar "generationInputs"/"assetPackage" a planContent()).' }));
  }

  const schedulablePlatform = schedulablePlatformFor(proposal.platform);

  // Fase 13 Parte 5/15 -- AUTO_PUBLISH: solo si la política global está
  // activada Y el plan es elegible. Nunca decide con LLM, nunca aprueba
  // sin un actor humano real (autoPublishConfig.actorId, capturado al
  // activar la política -- Parte 8: "una sola decisión humana, no una por
  // publicación").
  if (executionMode === 'AUTO_PUBLISH') {
    const autoPublishConfig = getCurrentAutoPublishConfig({ store });
    const readiness = computeAutoPublishReadiness({ store, publicationStore });
    const candidatePlan = { strategyDecisionIds, executionMode, status: 'READY_FOR_REVIEW', assetPackageId: realAssetPackage.requestId ?? null, publicationId: null, platform: proposal.platform, product: proposal.product?.nombreComercial ?? null, requireHumanReview };
    const eligibility = isAutoPublishEligible(candidatePlan, { store, autoPublishConfig, readiness });

    if (!eligibility.eligible || !schedulablePlatform) {
      // Contenido validado pero no auto-publicable ahora: se prepara igual
      // (DRAFT real) para que un humano pueda aprobarlo manualmente vía la
      // CALENDARIO existente -- nunca se descarta el trabajo ya hecho.
      let scheduled = null;
      if (schedulablePlatform) {
        try { scheduled = createScheduledPublication({ assetPackage: realAssetPackage, platform: schedulablePlatform, destination: publishDestination, caption: caption ?? proposal.cta }); publicationStore.save(scheduled); } catch { /* se documenta abajo sin publicationId */ }
      }
      return persist(store, createContentPlan({
        ...basePlanFields, status: 'AUTO_PUBLISH_NOT_ELIGIBLE',
        assetPackageId: realAssetPackage.requestId ?? null, publicationId: scheduled?.id ?? null,
        qualityGateResult: { passed: true, failures: [] },
        autoPublish: { enabled: autoPublishConfig.enabled, actorId: autoPublishConfig.actorId, readiness: readiness.readiness, eligible: false, reasons: [...(schedulablePlatform ? [] : [`Unsupported platform for scheduling (actual: ${proposal.platform}).`]), ...eligibility.reasons] },
        reason: `AUTO_PUBLISH no elegible: ${eligibility.reasons.join('; ') || 'plataforma no soportada'}.`,
      }));
    }

    const activeScheduler = scheduler ?? defaultScheduler();
    const scheduled = createScheduledPublication({ assetPackage: realAssetPackage, platform: schedulablePlatform, destination: publishDestination, caption: caption ?? proposal.cta });
    publicationStore.save(scheduled);
    const approved = activeScheduler.approve(scheduled.id, { approvedBy: autoPublishConfig.actorId });
    // Fase 13 Parte 15/19 -- programado para "ahora" en UTC: el TICK real
    // ya existente (dashboard: setInterval / "VERIFICAR AHORA") es quien
    // efectivamente publica, con su propio APPROVAL_GATE/idempotencia ya
    // probados -- planContent() nunca llama a Meta directamente.
    const now = new Date();
    const scheduledRecord = activeScheduler.schedule(approved.id, { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16), timezone: 'UTC' });

    return persist(store, createContentPlan({
      ...basePlanFields, status: 'SCHEDULED',
      assetPackageId: realAssetPackage.requestId ?? null, publicationId: scheduledRecord.id,
      qualityGateResult: { passed: true, failures: [] },
      autoPublish: { enabled: true, actorId: autoPublishConfig.actorId, readiness: readiness.readiness, eligible: true, reasons: [] },
      reason: 'AUTO_PUBLISH elegible: ScheduledPublication real aprobada y programada -- la publicación real ocurre en el próximo tick del Publishing Scheduler existente, nunca de forma síncrona aquí.',
    }));
  }

  // Fase 12/13 -- HUMAN_REVIEW con AssetPackage real: ScheduledPublication DRAFT real, pendiente de aprobación humana vía la CALENDARIO existente.
  if (executionMode === 'HUMAN_REVIEW') {
    if (!schedulablePlatform) {
      return persist(store, createContentPlan({ ...basePlanFields, status: 'FAILED', assetPackageId: realAssetPackage.requestId ?? null, reason: `Plataforma no soportada para agendar (${proposal.platform}).` }));
    }
    let scheduled;
    try {
      scheduled = createScheduledPublication({ assetPackage: realAssetPackage, platform: schedulablePlatform, destination: publishDestination, caption: caption ?? proposal.cta });
    } catch (err) {
      return persist(store, createContentPlan({ ...basePlanFields, status: 'FAILED', reason: err.message, assetPackageId: realAssetPackage.requestId ?? null }));
    }
    publicationStore.save(scheduled);
    return persist(store, createContentPlan({
      ...basePlanFields, status: 'READY_FOR_REVIEW',
      assetPackageId: realAssetPackage.requestId ?? null, publicationId: scheduled.id,
      reason: 'ScheduledPublication DRAFT real creada -- pendiente de aprobación humana vía la CALENDARIO existente (POST /api/schedule/:id/approve).',
    }));
  }

  // PREPARE_ONLY con AssetPackage real: se documenta, no se agenda.
  return persist(store, createContentPlan({ ...basePlanFields, status: 'READY_FOR_REVIEW', assetPackageId: realAssetPackage.requestId ?? null }));
}

const VALID_STATUS_FILTERS = new Set(['PLANNED', 'READY_FOR_REVIEW', 'QUALITY_FAILED', 'FAILED_GENERATION', 'AUTO_PUBLISH_DISABLED', 'AUTO_PUBLISH_NOT_ELIGIBLE', 'MEDIA_HOSTING_FAILED', 'SCHEDULED']);

/** Fase 12 Parte 22 -- GET /api/content-plans. */
export function listContentPlans({ store = defaultStore, status = null, platform = null, executionMode = null } = {}) {
  let plans = store.loadAll('content_plan');
  if (status) plans = plans.filter((p) => p.status === status);
  if (platform) plans = plans.filter((p) => p.platform === platform);
  if (executionMode) plans = plans.filter((p) => p.executionMode === executionMode);
  return plans;
}

/** Fase 12 Parte 22 -- GET /api/content-plans/:id. */
export function getContentPlan({ store = defaultStore, id }) {
  return store.loadAll('content_plan').find((p) => p.id === id) ?? null;
}

export { VALID_STATUS_FILTERS };
