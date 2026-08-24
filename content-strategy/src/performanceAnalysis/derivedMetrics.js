// derivedMetrics.js — Performance Analysis Engine, Fase 3. Solo calcula una
// tasa cuando el/los numerador(es) Y el denominador están realmente
// disponibles (nunca 0 por ausencia, nunca un denominador inventado).
//
// "reach" es el denominador documentado por el encargo, pero ambas fuentes
// reales (instagramPerformanceSource.js, facebookPerformanceSource.js) lo
// auditaron como NOT_AVAILABLE — Meta no lo expone hoy para este tipo de
// contenido/token. "views" es el reemplazo oficial que Meta documenta desde
// la migración de v22.0 (ver instagramConfig.js) — se usa como fallback
// EXPLÍCITO y trazable (denominator_metric queda registrado en el
// resultado), nunca mezclado en silencio con "reach" real. view_rate NUNCA
// usa este fallback (views ya es su propio numerador -- sería circular).

import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { metricValue } from './metricsNormalizer.js';

const RATE_DEFINITIONS = Object.freeze([
  { name: 'engagement_rate', numerator: ['likes', 'comments', 'shares', 'saves'], denominatorCandidates: ['reach', 'views'] },
  { name: 'share_rate', numerator: ['shares'], denominatorCandidates: ['reach', 'views'] },
  { name: 'comment_rate', numerator: ['comments'], denominatorCandidates: ['reach', 'views'] },
  { name: 'save_rate', numerator: ['saves'], denominatorCandidates: ['reach', 'views'] },
  { name: 'like_rate', numerator: ['likes'], denominatorCandidates: ['reach', 'views'] },
  { name: 'click_rate', numerator: ['clicks'], denominatorCandidates: ['impressions'] },
  { name: 'view_rate', numerator: ['views'], denominatorCandidates: ['reach'] },
]);

export const DERIVED_METRIC_NAMES = Object.freeze(RATE_DEFINITIONS.map((d) => d.name));

/**
 * @param {Record<string,{value:number|'NOT_AVAILABLE'}>} metrics - salida de normalizeLatestMetrics().metrics
 * @returns {Record<string,{value:number|'NOT_AVAILABLE', denominator_metric:string|null}>}
 */
export function computeDerivedMetrics(metrics) {
  const result = {};
  for (const def of RATE_DEFINITIONS) {
    let denominatorMetric = null;
    let denominatorValue = NOT_AVAILABLE;
    for (const candidate of def.denominatorCandidates) {
      const v = metricValue(metrics, candidate);
      if (v !== NOT_AVAILABLE && v > 0) { denominatorMetric = candidate; denominatorValue = v; break; }
    }
    if (denominatorValue === NOT_AVAILABLE) {
      result[def.name] = { value: NOT_AVAILABLE, denominator_metric: null };
      continue;
    }
    let numeratorSum = 0;
    let missing = false;
    for (const m of def.numerator) {
      const v = metricValue(metrics, m);
      if (v === NOT_AVAILABLE) { missing = true; break; }
      numeratorSum += v;
    }
    result[def.name] = missing
      ? { value: NOT_AVAILABLE, denominator_metric: null }
      : { value: Number((numeratorSum / denominatorValue).toFixed(6)), denominator_metric: denominatorMetric };
  }
  return result;
}

export function derivedValue(derived, name) {
  const entry = derived[name];
  return entry && typeof entry.value === 'number' ? entry.value : NOT_AVAILABLE;
}
