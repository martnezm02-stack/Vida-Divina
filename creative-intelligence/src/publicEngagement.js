// publicEngagement.js — engagement público observado (likes, comments,
// saves, shares...) de piezas de competidores. Fase: Incorporar y
// Normalizar Competitive Evidence — Preliminary.
//
// REGLA NO NEGOCIABLE, dada explícitamente: PUBLIC_OBSERVED_ENGAGEMENT es
// evidencia de interacción pública — NUNCA de ventas, conversión, revenue,
// ROAS, CPA, eficacia comercial o intención de compra. Cumplimiento
// ESTRUCTURAL: la forma de los objetos de este archivo no tiene, ni podrá
// tener, ningún campo "salesScore"/"winnerScore"/"performanceScore"/
// "conversionScore" — la ausencia es del diseño, no de la disciplina.

import { CONFIDENCE_LEVELS } from './evidenceProvenance.js';

export const ENGAGEMENT_METRIC_NAMES = Object.freeze(['likes', 'comments', 'saves', 'shares', 'views', 'plays']);
export const PUBLIC_OBSERVED_ENGAGEMENT = 'PUBLIC_OBSERVED_ENGAGEMENT';
export const PUBLIC_OBSERVED_ENGAGEMENT_TOTAL = 'PUBLIC_OBSERVED_ENGAGEMENT_TOTAL';

/**
 * Una sola métrica pública observada (ej. "23 likes en el video X, visto el
 * 2026-08-15"). `value` debe ser un número ≥ 0 o el sentinel UNKNOWN — nunca
 * se infiere un valor que la fuente no mostró.
 */
export function createPublicEngagementMetric({ value, metricName, platform, sourceUrl, observedAt, confidence = 'UNKNOWN' }) {
  if (!ENGAGEMENT_METRIC_NAMES.includes(metricName)) {
    throw new Error(`PublicEngagementMetric: "metricName" inválido "${metricName}" (válidos: ${ENGAGEMENT_METRIC_NAMES.join(', ')}).`);
  }
  if (value !== 'UNKNOWN' && (typeof value !== 'number' || value < 0)) {
    throw new Error('PublicEngagementMetric: "value" debe ser un número ≥ 0 real observado, o el sentinel "UNKNOWN" — nunca inventado.');
  }
  if (!platform?.trim()) throw new Error('PublicEngagementMetric: "platform" es obligatorio.');
  if (!sourceUrl?.trim()) throw new Error('PublicEngagementMetric: "sourceUrl" es obligatorio — sin URL no hay forma de auditar la métrica.');
  if (!observedAt?.trim()) throw new Error('PublicEngagementMetric: "observedAt" es obligatorio.');
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`PublicEngagementMetric: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  return Object.freeze({
    type: PUBLIC_OBSERVED_ENGAGEMENT,
    metricName,
    value,
    platform,
    sourceUrl,
    observedAt,
    confidence,
  });
}

/**
 * Suma componentes de engagement SOLO cuando son valores numéricos reales
 * (nunca infiere un componente ausente/UNKNOWN como 0). Devuelve, junto al
 * total, exactamente qué componentes se incluyeron/excluyeron — para que
 * cualquier comparación posterior declare tamaño de muestra y
 * disponibilidad de datos (regla de "Engagement Analysis"). El resultado
 * SIEMPRE se etiqueta PUBLIC_OBSERVED_ENGAGEMENT_TOTAL — nunca "score" de
 * ningún tipo.
 */
export function computePublicObservedEngagementTotal(metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('computePublicObservedEngagementTotal: se requiere al menos 1 PublicEngagementMetric real.');
  }
  const included = [];
  const excluded = [];
  let total = 0;
  for (const metric of metrics) {
    if (metric?.type !== PUBLIC_OBSERVED_ENGAGEMENT) {
      throw new Error('computePublicObservedEngagementTotal: todos los elementos deben ser PublicEngagementMetric reales.');
    }
    if (typeof metric.value === 'number') {
      total += metric.value;
      included.push(metric.metricName);
    } else {
      excluded.push(metric.metricName);
    }
  }
  return Object.freeze({
    label: PUBLIC_OBSERVED_ENGAGEMENT_TOTAL,
    total,
    componentsIncluded: Object.freeze(included),
    componentsExcluded: Object.freeze(excluded),
    // Documentación explícita del alcance — nunca un "score" de negocio.
    meaning: 'Suma de interacciones públicas observadas (solo componentes con valor numérico real). No mide ventas, conversión, ROAS, CPA ni eficacia comercial.',
  });
}
