// autoPublishEligibility.js — isAutoPublishEligible (Fase 13, Parte 11).
// Determinístico, sin ML/LLM (mismo principio ya usado en
// strategy-decision-engine/src/decisionRules.js). Verifica las 14
// condiciones mínimas pedidas -- cualquiera que falle bloquea, con el
// motivo real explícito, nunca en silencio.

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { listStrategyDecisions } from '../../strategy-decision-engine/src/strategyDecisionService.js';

const SCHEDULABLE_PLATFORM_BY_PROPOSAL_PLATFORM = Object.freeze({ INSTAGRAM_REEL: 'INSTAGRAM', FACEBOOK_REEL: 'FACEBOOK' });

// Fase 13, Parte 21 -- límites conservadores explícitos: no existe una
// regla equivalente ya establecida en el proyecto para límites de
// AUTO_PUBLISH específicamente (Publishing Scheduler solo limita retries,
// MAX_RETRY_COUNT=3). Números deliberadamente bajos, documentados, no
// arbitrarios en el sentido de "sin razón": el objetivo es evitar un error
// catastrófico de volumen, no optimizar alcance.
export const MAX_AUTO_PUBLISH_PER_PLATFORM_PER_DAY = 3;
export const MAX_AUTO_PUBLISH_PER_PRODUCT_PER_DAY = 2;
export const MIN_INTERVAL_MINUTES_BETWEEN_AUTO_PUBLISH = 30;

function withinLastHours(isoDate, hours, now) {
  return (now.getTime() - new Date(isoDate).getTime()) <= hours * 60 * 60 * 1000;
}

/** Parte 12 (rate limits) -- cuenta sobre content_plan reales ya auto-publicados (publicationId set, executionMode=AUTO_PUBLISH), nunca sobre texto/caption. */
function checkRateLimits({ store, plan, now }) {
  const reasons = [];
  const autoPublished = store.loadAll('content_plan').filter((p) => p.executionMode === 'AUTO_PUBLISH' && p.publicationId && withinLastHours(p.createdAt, 24, now));

  const samePlatform = autoPublished.filter((p) => p.platform === plan.platform);
  if (samePlatform.length >= MAX_AUTO_PUBLISH_PER_PLATFORM_PER_DAY) reasons.push(`Límite de plataforma alcanzado (${samePlatform.length}/${MAX_AUTO_PUBLISH_PER_PLATFORM_PER_DAY} en 24h para ${plan.platform}).`);

  const sameProduct = autoPublished.filter((p) => p.product === plan.product);
  if (plan.product && sameProduct.length >= MAX_AUTO_PUBLISH_PER_PRODUCT_PER_DAY) reasons.push(`Límite de producto alcanzado (${sameProduct.length}/${MAX_AUTO_PUBLISH_PER_PRODUCT_PER_DAY} en 24h para ${plan.product}).`);

  const mostRecent = autoPublished.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (mostRecent) {
    const minutesSince = (now.getTime() - new Date(mostRecent.createdAt).getTime()) / 60000;
    if (minutesSince < MIN_INTERVAL_MINUTES_BETWEEN_AUTO_PUBLISH) reasons.push(`Intervalo mínimo no cumplido (${minutesSince.toFixed(1)}/${MIN_INTERVAL_MINUTES_BETWEEN_AUTO_PUBLISH} minutos desde el último auto-publish).`);
  }
  return reasons;
}

/**
 * @param {object} plan - ContentPlan real (ya generado + Quality Gate evaluado)
 * @param {{store?:object, autoPublishConfig:object, readiness:object, now?:Date}} params
 * @returns {{eligible:boolean, reasons:string[]}}
 */
export function isAutoPublishEligible(plan, { store = defaultStore, autoPublishConfig, readiness, now = new Date() } = {}) {
  const reasons = [];

  // 1. Política global activada.
  if (!autoPublishConfig?.enabled) reasons.push('AUTO_PUBLISH policy is disabled (autoPublish.enabled=false).');
  // Parte 15 -- el flujo real exige explícitamente enabled=true Y
  // readiness=READY como condiciones INDEPENDIENTES (no una sub-condición
  // de la otra). Re-verificado aquí, nunca confiado ciegamente del momento
  // de activación (defensa en profundidad, mismo criterio ya usado en
  // publishingScheduler.js#approve/APPROVAL_GATE): "enabled" pudo haberse
  // activado en un momento con datos suficientes y el readiness real de
  // AHORA puede diferir si algo cambió.
  if (readiness?.readiness !== 'READY') reasons.push(`AUTO_PUBLISH readiness is not READY (actual: ${readiness?.readiness ?? 'UNKNOWN'}).`);

  // 2. executionMode correcto.
  if (plan.executionMode !== 'AUTO_PUBLISH') reasons.push(`executionMode is not AUTO_PUBLISH (actual: ${plan.executionMode}).`);

  // 3/4. StrategyDecision real y ACCEPT.
  if (!plan.strategyDecisionIds || plan.strategyDecisionIds.length === 0) {
    reasons.push('No StrategyDecision associated with this ContentPlan.');
  } else {
    const decisions = plan.strategyDecisionIds.map((id) => listStrategyDecisions({ store }).find((d) => d.id === id)).filter(Boolean);
    if (decisions.length !== plan.strategyDecisionIds.length) reasons.push('One or more referenced StrategyDecision no longer exist.');
    if (decisions.some((d) => d.decision !== 'ACCEPT')) reasons.push('One or more referenced StrategyDecision is not ACCEPT.');
  }

  // 5. ContentPlan en un estado válido para avanzar.
  if (!['READY_FOR_REVIEW', 'GENERATED'].includes(plan.status)) reasons.push(`ContentPlan status not eligible (actual: ${plan.status}).`);

  // 6/9. AssetPackage completo (implica también media localizable -- el hosting real lo verifica MediaHostingService, nunca se fabrica una URL aquí).
  if (!plan.assetPackageId) reasons.push('No completed AssetPackage associated with this ContentPlan.');

  // 7. Quality Gate ya debió pasar para llegar a READY_FOR_REVIEW -- re-verificación defensiva.
  if (plan.status === 'QUALITY_FAILED') reasons.push('Quality Gate did not pass.');

  // 8. Plataforma soportada por el Publishing Scheduler real.
  const schedulablePlatform = SCHEDULABLE_PLATFORM_BY_PROPOSAL_PLATFORM[plan.platform] ?? null;
  if (!schedulablePlatform) reasons.push(`Unsupported platform for scheduling (actual: ${plan.platform}).`);

  // 10. Sin publicación previa para este mismo plan.
  if (plan.publicationId) reasons.push('A publication already exists for this ContentPlan (idempotency).');

  // 11. Sin retry activo -- no aplica antes de crear el ScheduledPublication (documentado, no fabricado).
  // 12. Rate limits reales.
  reasons.push(...checkRateLimits({ store, plan, now }));

  // 13. Bloqueo manual -- sin mecanismo granular todavía (Parte 24 cubre el toggle global, ya verificado en #1); preparado para una fase futura.
  // 14. HumanReview no marcado REQUIRED.
  if (plan.requireHumanReview === true) reasons.push('HumanReview is explicitly marked REQUIRED for this ContentPlan.');

  return { eligible: reasons.length === 0, reasons };
}
