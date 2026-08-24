// learningTypes.js — Learning & Strategy Feedback Engine, Fase 3 + Fase 13
// + Fase 20. Vocabulario cerrado y determinístico -- ningún tipo se genera
// sin evidencia real (ver patternToLearning.js).

export const LEARNING_TYPES = Object.freeze([
  'PERFORMANCE_LEARNING',
  'CONTENT_LEARNING',
  'PLATFORM_LEARNING',
  'FORMAT_LEARNING',
  'PRODUCT_LEARNING',
  'COMMERCIAL_LEARNING',
  'ENGAGEMENT_LEARNING',
  'OPPORTUNITY_LEARNING',
  'STRATEGY_LEARNING',
  'DATA_QUALITY_LEARNING',
]);

// Fase 20 — historial: un LearningRecord nunca se borra ni se sobrescribe.
// "status" documenta su ciclo de vida propio (ACTIVE = vigente al momento
// de generarse); la supersesión por un aprendizaje más reciente y
// potencialmente contradictorio sobre el MISMO scope se calcula en tiempo
// de lectura (ver learningService.js#annotateSupersession) -- el store
// append-only nunca se muta.
export const LEARNING_STATUSES = Object.freeze(['ACTIVE']);

// Fase 13 — StrategyFeedback.status. Por defecto siempre PROPOSED (§13:
// "NO implementar todavía workflow automático de aprobación").
export const STRATEGY_FEEDBACK_STATUSES = Object.freeze(['PROPOSED', 'REVIEWED', 'ACCEPTED', 'REJECTED']);

// Fase 14 — EXPECTED_DIRECTION: qué se espera que ocurra si se sigue la
// recomendación, nunca una garantía de resultado.
export const EXPECTED_DIRECTIONS = Object.freeze(['IMPROVE', 'MAINTAIN', 'REDUCE', 'INVESTIGATE']);

// Subconjunto de LEARNING_TYPES cuyo "subject" (learningType+platform+format+
// product) representa una conclusión AGREGADA/generalizable (un patrón, no
// una publicación puntual) -- son los únicos comparables entre sí para
// supersesión (learningService.js#annotateSupersession, Fase 20) y para
// detección de contradicciones (strategy-decision-engine/src/decisionRules.js,
// Fase 9 de la fase siguiente). CONTENT_LEARNING/ENGAGEMENT_LEARNING/
// PERFORMANCE_LEARNING describen UNA publicación específica: dos registros
// de ese tipo sobre la misma plataforma/producto no son "la misma
// afirmación reevaluada con más evidencia", son dos publicaciones
// DISTINTAS -- tratarlas como si una reemplazara a la otra generaría
// supersesiones/contradicciones falsas (bug real detectado en la
// validación de Fase 26 de Strategy Decision Engine: un TOP_PERFORMER de
// una publicación aparecía "superseded" por el UNDERPERFORMER de OTRA
// publicación distinta solo por compartir plataforma+producto).
export const STRATEGIC_LEARNING_TYPES = Object.freeze(['FORMAT_LEARNING', 'PLATFORM_LEARNING', 'PRODUCT_LEARNING', 'COMMERCIAL_LEARNING', 'OPPORTUNITY_LEARNING', 'STRATEGY_LEARNING']);
