// performanceScore.js — Performance Analysis Engine, Fase 4. Score 0-100
// por publicación, SIEMPRE relativo a sus pares de la MISMA plataforma
// (percentil dentro del grupo) — nunca un número absoluto que premie
// volumen bruto por sí solo.
//
// Método preferido: percentil de engagement_rate (ya normalizado por
// alcance/views — ver derivedMetrics.js) entre las publicaciones de la
// misma plataforma con esa tasa disponible.
//
// Fallback documentado (cuando engagement_rate no está disponible en
// ninguna/pocas publicaciones del grupo, situación real actual — reach no
// expuesto por Meta): percentil de un "engagement bruto ponderado" =
// likes*1 + comments*2 + shares*3 + saves*2. Pesos arbitrarios pero
// documentados aquí (mayor peso a acciones más costosas/intencionales que
// un like) — el resultado declara explícitamente method:"weighted_raw"
// para que nunca se confunda con una tasa real ajustada por alcance.
//
// No usa ML. No compara entre plataformas (percentil siempre dentro del
// mismo grupo `platform`).

import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { metricValue } from './metricsNormalizer.js';
import { derivedValue } from './derivedMetrics.js';

const RAW_ENGAGEMENT_WEIGHTS = Object.freeze({ likes: 1, comments: 2, shares: 3, saves: 2 });

function weightedRawEngagement(metrics) {
  let sum = 0;
  let anyAvailable = false;
  for (const [metric, weight] of Object.entries(RAW_ENGAGEMENT_WEIGHTS)) {
    const v = metricValue(metrics, metric);
    if (v !== NOT_AVAILABLE) { sum += v * weight; anyAvailable = true; }
  }
  return anyAvailable ? sum : NOT_AVAILABLE;
}

function percentileRank(value, allValues) {
  if (allValues.length === 0) return null;
  const countBelowOrEqual = allValues.filter((v) => v <= value).length;
  return Number(((countBelowOrEqual / allValues.length) * 100).toFixed(2));
}

/**
 * @param {{contentId:string, metrics:object, derived:object}[]} platformGroup - TODAS las publicaciones de una misma plataforma, ya normalizadas
 * @returns {Map<string, {score:number|null, method:string, explanation:string}>}
 */
export function computePerformanceScoresForPlatform(platformGroup) {
  const results = new Map();

  const engagementRates = platformGroup
    .map((p) => derivedValue(p.derived, 'engagement_rate'))
    .filter((v) => v !== NOT_AVAILABLE);
  const useRate = engagementRates.length >= 2; // percentil necesita al menos 2 puntos para ser comparativo

  const rawEngagements = platformGroup.map((p) => weightedRawEngagement(p.metrics)).filter((v) => v !== NOT_AVAILABLE);

  for (const p of platformGroup) {
    const rate = derivedValue(p.derived, 'engagement_rate');
    if (useRate && rate !== NOT_AVAILABLE) {
      results.set(p.contentId, {
        score: percentileRank(rate, engagementRates),
        method: 'engagement_rate_percentile',
        explanation: `Percentil del engagement_rate (${rate}) entre ${engagementRates.length} publicaciones comparables de la misma plataforma.`,
      });
      continue;
    }
    const raw = weightedRawEngagement(p.metrics);
    if (rawEngagements.length >= 2 && raw !== NOT_AVAILABLE) {
      results.set(p.contentId, {
        score: percentileRank(raw, rawEngagements),
        method: 'weighted_raw_percentile',
        explanation: `engagement_rate no disponible (reach/views insuficientes) — score calculado sobre engagement bruto ponderado (likes×1+comments×2+shares×3+saves×2) entre ${rawEngagements.length} publicaciones. Puede favorecer publicaciones con mayor audiencia; usar con precaución.`,
      });
      continue;
    }
    results.set(p.contentId, { score: null, method: 'INSUFFICIENT_DATA', explanation: 'Ni engagement_rate ni métricas brutas de engagement están disponibles, o no hay suficientes pares comparables (mínimo 2) en esta plataforma.' });
  }
  return results;
}
