// intelligenceCategories.js — Marketing Intelligence Engine, Fase 3 + Fase
// 10 + Fase 11. Vocabulario cerrado, determinístico -- ninguna categoría se
// genera si no hay datos reales suficientes para poblarla (§3 del encargo).

// Fase 3 — categorías mínimas pedidas + OPPORTUNITY, necesaria para
// clasificar la salida de Opportunity Detection (Fase 10) sin forzarla
// dentro de una de las diez categorías de negocio.
export const INTELLIGENCE_CATEGORIES = Object.freeze([
  'CONTENT_PERFORMANCE',
  'PLATFORM_PERFORMANCE',
  'FORMAT_PERFORMANCE',
  'PRODUCT_PERFORMANCE',
  'CAMPAIGN_PERFORMANCE',
  'ENGAGEMENT',
  'CONVERSION',
  'REVENUE',
  'AUDIENCE_SIGNAL',
  'SCHEDULE',
  'OPPORTUNITY',
]);

// Fase 10 — tipos de oportunidad, todos basados en evidencia real cruzada
// (engagement de Performance Analysis + conversión de Attribution). Nunca
// se presenta una oportunidad sin evidencia (ver opportunityDetection.js).
export const OPPORTUNITY_TYPES = Object.freeze([
  'HIGH_ENGAGEMENT_LOW_CONVERSION',
  'LOW_ENGAGEMENT_HIGH_CONVERSION',
  'HIGH_PERFORMANCE_LOW_VOLUME',
  'HIGH_REVENUE_LOW_REACH',
  'STRONG_PLATFORM_SIGNAL',
  'WEAK_PLATFORM_SIGNAL',
  'EMERGING_PATTERN',
]);

// Fase 9 — tipos de insight comercial (Commercial Intelligence). Distintos
// de los INSIGHT_TYPES de PerformanceInsight (que describen engagement, no
// conversión/revenue).
export const COMMERCIAL_INSIGHT_TYPES = Object.freeze(['COMMERCIAL_CONVERSION', 'COMMERCIAL_REVENUE']);

// Fase 7 — tipo de insight de producto.
export const PRODUCT_INSIGHT_TYPE = 'PRODUCT_PERFORMANCE';

// Fase 11 — Risk / Data Quality signals. Un DataQualitySignal nunca dice
// "el contenido funciona mal" -- dice "no hay evidencia suficiente para
// saberlo", exactamente la distinción que pide el encargo.
export const DATA_QUALITY_REASONS = Object.freeze([
  'INSUFFICIENT_DATA',
  'MISSING_METRICS',
  'MISSING_ATTRIBUTION',
  'LOW_SAMPLE_SIZE',
  'UNSUPPORTED_METRIC',
  'INCONSISTENT_DATA',
]);
