// patternToLearning.js — Learning & Strategy Feedback Engine, Fases 6-12.
// Transforma MarketingInsight/DataQualitySignal (marketing-intelligence-engine/,
// ya calculados) en LearningRecord + StrategyFeedback -- MECÁNICO, plantillas
// determinísticas por insightType, nunca texto libre generado por el
// modelo. Todo template usa lenguaje de señal/asociación/patrón/tendencia
// (Fase 15) -- nunca causalidad.

import { createLearningRecord } from './learningRecord.js';
import { createStrategyFeedback } from './strategyFeedback.js';

// insightType (MarketingInsight, Fase 8) -> learningType (Fase 3).
const INSIGHT_TYPE_TO_LEARNING_TYPE = Object.freeze({
  TOP_PERFORMER: 'CONTENT_LEARNING',
  UNDERPERFORMER: 'CONTENT_LEARNING',
  FORMAT_PATTERN: 'FORMAT_LEARNING',
  PLATFORM_COMPARISON: 'PLATFORM_LEARNING',
  ENGAGEMENT_PATTERN: 'ENGAGEMENT_LEARNING',
  AMPLIFICATION_PATTERN: 'ENGAGEMENT_LEARNING',
  SCHEDULE_PATTERN: 'PERFORMANCE_LEARNING', // sin un tipo SCHEDULE_LEARNING dedicado en el encargo -- PERFORMANCE_LEARNING es el bucket genérico de timing
  PRODUCT_PERFORMANCE: 'PRODUCT_LEARNING',
  COMMERCIAL_CONVERSION: 'COMMERCIAL_LEARNING',
  COMMERCIAL_REVENUE: 'COMMERCIAL_LEARNING',
  HIGH_ENGAGEMENT_LOW_CONVERSION: 'OPPORTUNITY_LEARNING',
  LOW_ENGAGEMENT_HIGH_CONVERSION: 'OPPORTUNITY_LEARNING',
  HIGH_PERFORMANCE_LOW_VOLUME: 'OPPORTUNITY_LEARNING',
  HIGH_REVENUE_LOW_REACH: 'OPPORTUNITY_LEARNING',
  STRONG_PLATFORM_SIGNAL: 'OPPORTUNITY_LEARNING',
  WEAK_PLATFORM_SIGNAL: 'OPPORTUNITY_LEARNING',
  EMERGING_PATTERN: 'OPPORTUNITY_LEARNING',
});

// insightType cuyo delta tiene signo (positivo/negativo) y por lo tanto
// necesita una plantilla distinta por dirección -- el resto tiene una sola
// plantilla fija (la dirección ya está en el nombre del insightType, ej.
// UNDERPERFORMER, o no aplica, ej. PRODUCT_PERFORMANCE).
const DIRECTIONAL_TEMPLATES = Object.freeze({
  FORMAT_PATTERN: {
    positive: { pattern: 'Diferencia relativa de rendimiento entre formatos', implication: 'Existe una señal para priorizar este formato en producciones futuras.', recommendation: 'Evaluar mayor proporción de este formato en futuras estrategias.', direction: 'IMPROVE' },
    negative: { pattern: 'Diferencia relativa de rendimiento entre formatos', implication: 'Existe una señal para revisar este formato antes de repetirlo a mayor escala.', recommendation: 'Evaluar reducir la proporción de este formato o ajustar su enfoque.', direction: 'REDUCE' },
  },
  PLATFORM_COMPARISON: {
    positive: { pattern: 'Diferencia relativa de rendimiento entre plataformas', implication: 'Existe una señal para priorizar inversión de producción en esta plataforma.', recommendation: 'Evaluar mayor inversión de producción en esta plataforma.', direction: 'IMPROVE' },
    negative: { pattern: 'Diferencia relativa de rendimiento entre plataformas', implication: 'Existe una señal para revisar el enfoque en esta plataforma antes de escalarlo.', recommendation: 'Evaluar ajustar el enfoque en esta plataforma antes de escalar producción.', direction: 'REDUCE' },
  },
  ENGAGEMENT_PATTERN: {
    positive: { pattern: 'Publicación con engagement por encima del rango habitual', implication: 'Existe una señal de resonancia con la audiencia superior a lo habitual.', recommendation: 'Evaluar qué elementos de esta publicación repetir en futuro contenido.', direction: 'IMPROVE' },
    negative: { pattern: 'Publicación con engagement por debajo del rango habitual', implication: 'Existe una señal de menor resonancia con la audiencia que lo habitual.', recommendation: 'Evaluar revisar el enfoque antes de repetirlo.', direction: 'INVESTIGATE' },
  },
  AMPLIFICATION_PATTERN: {
    positive: { pattern: 'Amplificación (shares/saves) por encima del rango habitual', implication: 'Existe una señal de mayor disposición a compartir/guardar este contenido.', recommendation: 'Evaluar qué elementos motivaron la amplificación para repetirlos.', direction: 'IMPROVE' },
    negative: { pattern: 'Amplificación (shares/saves) por debajo del rango habitual', implication: 'Existe una señal de menor disposición a compartir/guardar este contenido.', recommendation: 'Evaluar revisar el enfoque de amplificación de este contenido.', direction: 'INVESTIGATE' },
  },
  SCHEDULE_PATTERN: {
    positive: { pattern: 'Franja horaria con rendimiento por encima del habitual', implication: 'Existe una señal para priorizar publicar en esta franja horaria.', recommendation: 'Evaluar concentrar más publicaciones en esta franja horaria.', direction: 'IMPROVE' },
    negative: { pattern: 'Franja horaria con rendimiento por debajo del habitual', implication: 'Existe una señal para revisar publicaciones en esta franja horaria.', recommendation: 'Evaluar reducir publicaciones en esta franja horaria.', direction: 'REDUCE' },
  },
});

const FLAT_TEMPLATES = Object.freeze({
  TOP_PERFORMER: { pattern: 'Posición relativa alta dentro del grupo comparable', implication: 'Existe una señal de alto rendimiento relativo frente a publicaciones comparables.', recommendation: 'Evaluar qué elementos de esta publicación repetir en futuro contenido.', direction: 'IMPROVE' },
  UNDERPERFORMER: { pattern: 'Posición relativa baja dentro del grupo comparable', implication: 'Existe una señal de bajo rendimiento relativo frente a publicaciones comparables.', recommendation: 'Evaluar revisar el enfoque antes de repetirlo a mayor escala.', direction: 'INVESTIGATE' },
  PRODUCT_PERFORMANCE: { pattern: 'Rendimiento agregado de un producto', implication: 'Existe evidencia agregada del comportamiento de este producto en el contenido publicado.', recommendation: 'Evaluar mantener o ajustar la proporción de contenido dedicada a este producto según esta evidencia.', direction: 'MAINTAIN' },
  COMMERCIAL_CONVERSION: { pattern: 'Resultado de conversión atribuida', implication: 'Existe evidencia de valor comercial atribuible con evidencia estructural.', recommendation: 'Evaluar reforzar el mecanismo que produjo esta conversión atribuida.', direction: 'IMPROVE' },
  COMMERCIAL_REVENUE: { pattern: 'Resultado de revenue atribuido', implication: 'Existe evidencia de revenue real atribuible con evidencia estructural.', recommendation: 'Evaluar priorizar el contenido/producto asociado a este revenue atribuido.', direction: 'IMPROVE' },
  HIGH_ENGAGEMENT_LOW_CONVERSION: { pattern: 'Diferencia entre respuesta de audiencia y conversión comercial', implication: 'Existe una diferencia entre respuesta de audiencia y conversión comercial.', recommendation: 'Investigar CTA, oferta o mecanismo de conversión.', direction: 'INVESTIGATE' },
  LOW_ENGAGEMENT_HIGH_CONVERSION: { pattern: 'Conversión comercial sin alto engagement asociado', implication: 'El engagement no predice por sí solo el valor comercial de este contenido.', recommendation: 'Evaluar replicar el mecanismo comercial de esta publicación en contenido con mayor alcance.', direction: 'INVESTIGATE' },
  HIGH_PERFORMANCE_LOW_VOLUME: { pattern: 'Patrón positivo con volumen de evidencia todavía limitado', implication: 'El patrón es prometedor pero aún tiene poco volumen de evidencia.', recommendation: 'Evaluar aumentar el volumen de prueba de este patrón antes de escalarlo.', direction: 'INVESTIGATE' },
  HIGH_REVENUE_LOW_REACH: { pattern: 'Revenue atribuido con alcance limitado', implication: 'Existe una señal de valor comercial con distribución todavía limitada.', recommendation: 'Evaluar mayor distribución/promoción de este contenido.', direction: 'IMPROVE' },
  STRONG_PLATFORM_SIGNAL: { pattern: 'Señal fuerte de rendimiento superior en una plataforma', implication: 'Existe una señal sólida para priorizar inversión de producción en esta plataforma.', recommendation: 'Evaluar mayor inversión de producción en esta plataforma.', direction: 'IMPROVE' },
  WEAK_PLATFORM_SIGNAL: { pattern: 'Señal sólida de rendimiento inferior en una plataforma', implication: 'Existe una señal sólida para revisar el enfoque en esta plataforma.', recommendation: 'Evaluar ajustar o pausar el enfoque en esta plataforma antes de escalar.', direction: 'REDUCE' },
  EMERGING_PATTERN: { pattern: 'Patrón emergente con evidencia todavía limitada', implication: 'El patrón es prometedor pero aún tiene poco volumen de evidencia.', recommendation: 'Evaluar aumentar el volumen de prueba de este patrón antes de escalarlo.', direction: 'INVESTIGATE' },
});

function templateFor(mi) {
  const directional = DIRECTIONAL_TEMPLATES[mi.insightType];
  if (directional) return typeof mi.delta === 'number' && mi.delta >= 0 ? directional.positive : directional.negative;
  return FLAT_TEMPLATES[mi.insightType] ?? null;
}

function extractFormat(scope) {
  const match = /:format=([^\s(]+)/.exec(scope ?? '');
  return match ? match[1] : null;
}

/** Fases 6-12 — un MarketingInsight real -> un LearningRecord real (1:1, nunca reimplementa el patrón). */
export function buildLearningFromMarketingInsight(mi) {
  const template = templateFor(mi);
  if (!template) return null; // insightType desconocido -- defensivo, nunca fabrica un aprendizaje sin plantilla real
  const learningType = INSIGHT_TYPE_TO_LEARNING_TYPE[mi.insightType] ?? 'PERFORMANCE_LEARNING';

  return createLearningRecord({
    learningType,
    scope: mi.scope,
    observation: mi.summary, // ya validado como no-causal por MarketingInsight -- se reutiliza tal cual, nunca se reescribe
    pattern: template.pattern,
    evidence: { marketingInsightId: mi.id, delta: mi.delta, benchmark: mi.benchmark, expectedDirection: template.direction, ...mi.evidence },
    evidenceCount: mi.evidenceCount,
    confidence: mi.confidence,
    implication: template.implication,
    recommendation: template.recommendation,
    platform: mi.platform,
    format: extractFormat(mi.scope),
    product: mi.relatedProductIds[0] ?? null,
    contentType: null, // no existe en PublishedContent normalizado hasta aquí -- nunca se infiere
    relatedInsightIds: [mi.id],
    relatedContentIds: mi.relatedContentIds,
    relatedPublicationIds: mi.relatedPublicationIds,
    attributionSummary: mi.attributionSummary,
    source: 'learning_strategy_engine:pattern_to_learning',
  });
}

/** Fase 21 — Data Quality / Negative learning: documenta la AUSENCIA de evidencia, nunca la convierte en una recomendación fuerte (§21: sin StrategyFeedback). */
export function buildLearningFromDataQualitySignal(signal) {
  return createLearningRecord({
    learningType: 'DATA_QUALITY_LEARNING',
    scope: signal.scope ?? 'global',
    observation: signal.explanation,
    pattern: null,
    evidence: { reason: signal.reason, category: signal.category },
    evidenceCount: 0,
    confidence: 'UNKNOWN',
    implication: 'No hay evidencia suficiente para sostener un aprendizaje accionable en este scope todavía.',
    recommendation: null,
    platform: signal.platform ?? null,
    format: null,
    product: null,
    contentType: null,
    relatedInsightIds: [],
    relatedContentIds: [],
    attributionSummary: null,
    source: 'learning_strategy_engine:pattern_to_learning',
  });
}

/** Fase 13/14 — StrategyFeedback a partir de un LearningRecord YA generado. Nunca para DATA_QUALITY_LEARNING (§21). */
export function buildStrategyFeedback(learningRecord) {
  if (learningRecord.learningType === 'DATA_QUALITY_LEARNING' || !learningRecord.recommendation) return null;
  const expectedDirection = learningRecord.evidence?.expectedDirection ?? 'INVESTIGATE';
  return createStrategyFeedback({
    learningId: learningRecord.id,
    recommendation: learningRecord.recommendation,
    rationale: learningRecord.implication,
    evidence: { scope: learningRecord.scope, evidenceCount: learningRecord.evidenceCount, learningType: learningRecord.learningType, relatedContentIds: learningRecord.relatedContentIds },
    confidence: learningRecord.confidence,
    affectedPlatform: learningRecord.platform,
    affectedFormat: learningRecord.format,
    affectedProduct: learningRecord.product,
    expectedDirection,
    source: 'learning_strategy_engine:pattern_to_learning',
  });
}

const CONFIDENCE_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 });
function weakestConfidence(records) {
  return records.reduce((worst, r) => (CONFIDENCE_RANK[r.confidence] < CONFIDENCE_RANK[worst] ? r.confidence : worst), 'HIGH');
}

/**
 * Fase 3/13 — STRATEGY_LEARNING: aprendizaje transversal cuando el MISMO
 * patrón de formato (misma dirección) se repite en >= 2 plataformas
 * distintas -- señal más robusta que un FORMAT_LEARNING aislado por
 * plataforma (ejemplo de trabajo del encargo, Fase 7: "video presenta mayor
 * engagement... evaluar mayor proporción de video en futuras estrategias").
 * Deliberadamente acotado a FORMAT_LEARNING (el ejemplo más directamente
 * "de estrategia" transversal a plataformas) -- no agrega ningún dato
 * nuevo, solo agrupa LearningRecord YA generados.
 */
export function buildStrategyLearning(learningRecords) {
  const candidates = learningRecords.filter((lr) => lr.learningType === 'FORMAT_LEARNING' && lr.format);
  const byFormatDirection = new Map();
  for (const lr of candidates) {
    const direction = lr.evidence.delta >= 0 ? 'positive' : 'negative';
    const key = `${lr.format}::${direction}`;
    if (!byFormatDirection.has(key)) byFormatDirection.set(key, []);
    byFormatDirection.get(key).push(lr);
  }

  const strategyLearnings = [];
  for (const [key, group] of byFormatDirection) {
    const platforms = new Set(group.map((lr) => lr.platform));
    if (platforms.size < 2) continue;
    const [format, direction] = key.split('::');
    const template = direction === 'positive'
      ? { pattern: 'Patrón de formato consistente entre plataformas', implication: 'Existe una señal transversal para priorizar este formato más allá de una sola plataforma.', recommendation: 'Evaluar priorizar este formato como parte de la estrategia general de contenido, no solo por plataforma.' }
      : { pattern: 'Patrón de formato consistente entre plataformas', implication: 'Existe una señal transversal para revisar este formato más allá de una sola plataforma.', recommendation: 'Evaluar reducir o rediseñar este formato como parte de la estrategia general de contenido.' };

    strategyLearnings.push(createLearningRecord({
      learningType: 'STRATEGY_LEARNING',
      scope: `format=${format} · plataformas=${[...platforms].sort().join('/')} (grupos=${group.length})`,
      observation: `El patrón "${format}" (${direction === 'positive' ? 'por encima' : 'por debajo'} del benchmark) se observa de forma consistente en ${platforms.size} plataformas distintas (${[...platforms].sort().join(', ')}).`,
      pattern: template.pattern,
      evidence: { format, direction, sourceLearningIds: group.map((lr) => lr.id), platforms: [...platforms], expectedDirection: direction === 'positive' ? 'IMPROVE' : 'REDUCE' },
      evidenceCount: group.reduce((sum, lr) => sum + lr.evidenceCount, 0),
      confidence: weakestConfidence(group),
      implication: template.implication,
      recommendation: template.recommendation,
      platform: null, // transversal -- no es de una sola plataforma
      format,
      product: null,
      relatedInsightIds: group.flatMap((lr) => lr.relatedInsightIds),
      relatedContentIds: group.flatMap((lr) => lr.relatedContentIds),
      source: 'learning_strategy_engine:pattern_to_learning',
    }));
  }
  return strategyLearnings;
}
