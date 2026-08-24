// strategyContext.js — Fase 11 (Strategy-Aware Content Generation), Fases
// 2/3/4/5/6/7. Traduce StrategyDecision=ACCEPT reales (strategy-decision-engine/,
// ya READY) en una capa de contexto pequeña, ADITIVA y OPCIONAL para
// autonomousCreate.js -- nunca reimplementa Decision/Learning/Intelligence,
// solo lee lo ya persistido y estructura el resultado.
//
// Regla central (Fase 7): nunca convierte "recommendation"/"decisionReason"
// (texto) en instrucción de generación -- solo platform/format/product/
// priority ESTRUCTURADOS se usan como señal; evidence/confidence/scope se
// conservan tal cual para trazabilidad, nunca se interpretan como prompt.
//
// Solo ACCEPT alimenta el contexto (Fase 5); DEFER/REJECT quedan
// excluidos por construcción porque listStrategyDecisions({decision:'ACCEPT'})
// ya filtra en el origen.

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { listStrategyDecisions } from '../../strategy-decision-engine/src/strategyDecisionService.js';
import { listStrategyFeedback } from '../../learning-strategy-engine/src/learningService.js';

// scopeType (strategy-decision-engine, Fase 13 de esa fase) -- solo estos
// cuatro son ACCIONABLES para generación hoy (Fase 4/5). CONTENT_TYPE/
// CAMPAIGN existen en el vocabulario de esa fase pero NUNCA los produce
// scopeTypeFor() con datos reales (contentType/campaignId siempre null) --
// se tratan como NOT_ACTIONABLE_FOR_GENERATION si alguna vez aparecieran,
// nunca se inventa una traducción para ellos.
const ACTIONABLE_SCOPE_TYPES = Object.freeze(['PRODUCT', 'FORMAT', 'PLATFORM', 'GLOBAL']);

// Traduce el vocabulario de plataforma de Performance/Attribution
// (instagram/facebook, minúsculas -- PublishedContent.platform real) al
// vocabulario de destino de Content Generation (autonomousCreate.js#detectarObjetivo,
// mismo valor que produciría detectar "instagram"/"facebook" explícito en
// el userIntent). Deliberadamente NO incluye youtube_shorts/whatsapp/all:
// no hay un Output Profile de autonomousCreate equivalente hoy -- una
// decisión sobre esas plataformas queda sin traducción utilizable (ver
// resolveApplicableDecision) en vez de inventar un mapeo.
const PLATFORM_TO_PROPOSAL_PLATFORM = Object.freeze({ instagram: 'INSTAGRAM_REEL', facebook: 'FACEBOOK_REEL' });

const CONFIDENCE_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 });
// Fase 6 §1 -- "scope más específico" gana. PRODUCT/FORMAT son igual de
// específicos entre sí (ambos más que PLATFORM, que a su vez es más
// específico que GLOBAL) -- ninguno dispara ambigüedad porque
// resolveApplicableDecision solo evalúa un target por vez (product XOR
// platform XOR format, nunca los tres simultáneamente en la misma corrida).
const SCOPE_RANK = Object.freeze({ PRODUCT: 3, FORMAT: 3, PLATFORM: 2, GLOBAL: 1 });

/** Fase 6 -- orden determinístico: scope > confidence > evidenceCount > ausencia de contradicción. Nunca usa LLM. */
function rank(decision) {
  return [SCOPE_RANK[decision.scopeType] ?? 0, CONFIDENCE_RANK[decision.confidence] ?? 0, decision.evidenceCount, decision.contradictions.length === 0 ? 1 : 0];
}
function byRankDesc(a, b) {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
  return 0;
}

/**
 * Fase 4 -- una decisión solo es aplicable dentro de su propio scope
 * declarado; nunca se amplía artificialmente. PRODUCT compara contra
 * `productName` (nombreComercial, ej. "TéDivina"), NO contra `productId`
 * (slug, ej. "tedivina"): StrategyDecision.affectedProduct hereda
 * PublishedContent.product_ref, que en todo el pipeline de Performance/
 * Attribution/Marketing Intelligence SIEMPRE guarda el nombre comercial
 * real (ver productIntelligence.js de marketing-intelligence-engine), no
 * el slug de Content Generation -- confirmado con datos reales durante la
 * validación de esta fase (Fase 19), nunca se asume un match por
 * normalización de texto entre ambos vocabularios.
 */
function isInScope(decision, { productName }) {
  if (!ACTIONABLE_SCOPE_TYPES.includes(decision.scopeType)) return false;
  if (decision.scopeType === 'PRODUCT') return Boolean(productName) && decision.affectedProduct === productName;
  return true; // FORMAT/PLATFORM/GLOBAL: aplicables sin requerir un producto específico
}

/** Traduce UNA StrategyDecision ya elegida en los campos concretos de contexto -- null si su target no tiene traducción utilizable hoy (Fase 5: NOT_ACTIONABLE_FOR_GENERATION, se prueba con la siguiente candidata en vez de inventar una). */
function translate(decision) {
  if (decision.scopeType === 'PLATFORM') {
    const preferredPlatformProfile = PLATFORM_TO_PROPOSAL_PLATFORM[decision.affectedPlatform] ?? null;
    if (!preferredPlatformProfile) return null;
    return { platform: decision.affectedPlatform, preferredPlatformProfile, format: null, product: null };
  }
  if (decision.scopeType === 'FORMAT') {
    // Informativo/trazable -- autonomousCreate.js no tiene hoy un selector
    // de formato independiente del CreativeCell resuelto (§ comentario en
    // contentGenerationEngine.js: "este motor nunca redacta copy"), así
    // que no hay lever real que aplicar todavía. Se documenta como tal, no
    // se fabrica uno.
    return { platform: null, preferredPlatformProfile: null, format: decision.affectedFormat, product: null };
  }
  if (decision.scopeType === 'PRODUCT') {
    return { platform: null, preferredPlatformProfile: null, format: null, product: decision.affectedProduct };
  }
  return { platform: null, preferredPlatformProfile: null, format: null, product: null }; // GLOBAL
}

const DIRECTION_TO_PRIORITY = Object.freeze({ IMPROVE: 'HIGH', REDUCE: 'LOW', MAINTAIN: 'MEDIUM', INVESTIGATE: 'MEDIUM' });

/**
 * Fase 3 -- StrategyDecision(ACCEPT) + LearningRecord (vía StrategyFeedback)
 * -> StrategyContext. Nunca lanza: sin evidencia aplicable, `applied:false`
 * es un resultado válido (mismo criterio que INSUFFICIENT_DATA en las
 * fases anteriores).
 * @param {{productId?:string|null, productName?:string|null, store?:object}} params
 * @param {?string} params.productId - slug de Content Generation (ej. "tedivina"); solo se conserva por referencia, NO se usa para matchear scope PRODUCT.
 * @param {?string} params.productName - nombreComercial real (ej. "TéDivina"), el mismo valor que PublishedContent.product_ref -- es la clave real de match para scope PRODUCT.
 */
export function buildStrategyContext({ productId = null, productName = null, store = defaultStore } = {}) {
  const accepted = listStrategyDecisions({ store, decision: 'ACCEPT' });
  const candidates = accepted.filter((d) => isInScope(d, { productName })).sort(byRankDesc);

  for (const decision of candidates) {
    const translated = translate(decision);
    if (!translated) continue; // NOT_ACTIONABLE_FOR_GENERATION para esta candidata -- se intenta la siguiente, nunca se fuerza

    const feedback = listStrategyFeedback({ store }).find((sf) => sf.id === decision.strategyFeedbackId) ?? null;

    return Object.freeze({
      applied: true,
      strategyDecisionIds: Object.freeze([decision.id]),
      learningIds: Object.freeze(feedback ? [feedback.learningId] : []),
      platform: translated.platform,
      preferredPlatformProfile: translated.preferredPlatformProfile,
      format: translated.format,
      product: translated.product,
      contentType: null, // nunca poblado hoy (ver comentario ACTIONABLE_SCOPE_TYPES) -- nunca inventado
      objective: null, // Content Generation no tiene un target de "objective" estructurado que Strategy Decision pueda fijar hoy -- se deja explícito en null, no se infiere del texto de decisionReason
      priority: DIRECTION_TO_PRIORITY[decision.expectedDirection] ?? 'MEDIUM',
      strategicDirection: decision.expectedDirection,
      rationale: decision.decisionReason,
      evidence: decision.evidence,
      confidence: decision.confidence,
      constraints: Object.freeze([]),
      expectedDirection: decision.expectedDirection,
      scopeType: decision.scopeType,
    });
  }

  return Object.freeze({
    applied: false,
    reason: accepted.length === 0 ? 'NO_ACCEPT_DECISIONS' : 'NO_APPLICABLE_ACCEPT_DECISION',
    strategyDecisionIds: Object.freeze([]),
    learningIds: Object.freeze([]),
  });
}
