// contentPlan.js — Contrato ContentPlan (Fase 2/3/20 de esta fase). Une
// StrategyDecision(ACCEPT) real -> StrategyContext real
// (content-orchestrator/src/strategyContext.js) -> el resultado real de
// Content Generation (buildCreativeProposal) -> un modo de ejecución
// explícito. NO duplica content-strategy/src/contentPlan.js (ver
// performance-learning-intelligence/src/store.js, comentario del kind
// "content_plan") -- pipeline distinto, nunca conectado al real.

import { randomUUID } from 'node:crypto';

// Fase 8/9/11 — modo de ejecución explícito. Por defecto el más seguro
// (PREPARE_ONLY): nunca publica sin que algo/alguien lo pida explícitamente.
export const EXECUTION_MODES = Object.freeze(['PREPARE_ONLY', 'HUMAN_REVIEW', 'AUTO_PUBLISH']);
export const DEFAULT_EXECUTION_MODE = 'PREPARE_ONLY';

// Fase 20 — vocabulario de estados. GENERATING/APPROVED/SCHEDULED/
// PUBLISHING/PUBLISHED/REJECTED describen estados que en esta arquitectura
// VIVEN en el ScheduledPublication real (publishing-scheduler/) una vez
// que ContentPlan le entrega el control (§17/§18 del encargo: no duplicar
// el estado de publicación en dos lugares) -- se listan aquí para
// completar el vocabulario y para los filtros de la API/dashboard, pero
// ContentPlan.status en la práctica de esta fase solo transiciona hasta
// READY_FOR_REVIEW/QUALITY_FAILED/FAILED_GENERATION/AUTO_PUBLISH_DISABLED;
// el resto se consulta siguiendo `publicationId` hacia el registro real.
// RENDER_FAILED — Fase 13, Parte 2: se agrega para cuando el render REAL
// (generateContent(), no solo la propuesta) falla -- reutiliza el mismo
// nombre que ya usa GENERATION_STATUS en contentGenerationEngine.js
// ('RENDER_FAILED'), nunca un término nuevo para el mismo concepto.
export const CONTENT_PLAN_STATUSES = Object.freeze([
  'PLANNED', 'GENERATING', 'GENERATED', 'RENDERING', 'RENDER_FAILED', 'QUALITY_FAILED', 'READY_FOR_REVIEW',
  'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED',
  'FAILED_GENERATION', 'MEDIA_HOSTING_FAILED', 'PUBLISH_FAILED', 'AUTO_PUBLISH_DISABLED', 'AUTO_PUBLISH_NOT_ELIGIBLE',
]);

/**
 * @param {{
 *   strategyDecisionIds:string[], strategyContext:object|null, objective?:string|null,
 *   platform?:string|null, format?:string|null, product?:string|null, contentType?:string|null,
 *   topic?:string|null, cta?:string|null, priority?:string|null, scheduledAt?:string|null,
 *   executionMode?:string, status:string, reason?:string|null, generationRequest?:object|null,
 *   assetPackageId?:string|null, publicationId?:string|null, requireHumanReview?:boolean,
 *   qualityGateResult?:object|null, autoPublish?:object|null, source?:string,
 * }} fields
 */
export function createContentPlan(fields) {
  const {
    strategyDecisionIds, strategyContext = null, objective = null,
    platform = null, format = null, product = null, contentType = null,
    topic = null, cta = null, priority = null, scheduledAt = null,
    executionMode = DEFAULT_EXECUTION_MODE, status, reason = null,
    generationRequest = null, assetPackageId = null, publicationId = null,
    requireHumanReview = false, qualityGateResult = null, autoPublish = null,
    source = 'content_planning',
  } = fields;

  if (!Array.isArray(strategyDecisionIds)) throw new Error('ContentPlan: "strategyDecisionIds" debe ser un arreglo (vacío si no hubo StrategyContext aplicable).');
  if (!EXECUTION_MODES.includes(executionMode)) throw new Error(`ContentPlan: "executionMode" inválido "${executionMode}" (válidos: ${EXECUTION_MODES.join(', ')}).`);
  if (!CONTENT_PLAN_STATUSES.includes(status)) throw new Error(`ContentPlan: "status" inválido "${status}" (válidos: ${CONTENT_PLAN_STATUSES.join(', ')}).`);

  return Object.freeze({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    strategyDecisionIds: Object.freeze([...strategyDecisionIds]),
    strategyContext: strategyContext ? Object.freeze({ ...strategyContext }) : null,
    objective, platform, format, product, contentType, topic, cta, priority,
    scheduledAt, executionMode, status, reason,
    generationRequest: generationRequest ? Object.freeze({ ...generationRequest }) : null,
    assetPackageId, publicationId, requireHumanReview,
    // Fase 13, Parte 22 (Audit Trail): resultado real del Quality Gate y
    // estado real de la política de AUTO_PUBLISH EN EL MOMENTO de esta
    // decisión -- responde "¿por qué se publicó (o no)?" sin depender de logs.
    qualityGateResult: qualityGateResult ? Object.freeze({ ...qualityGateResult }) : null,
    autoPublish: autoPublish ? Object.freeze({ ...autoPublish }) : null,
    source,
  });
}
