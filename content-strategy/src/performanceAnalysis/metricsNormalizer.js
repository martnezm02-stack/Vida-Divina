// metricsNormalizer.js — Performance Analysis Engine, Fase 2. Última
// observación real por métrica para un content_id — misma lógica que ya
// vivía duplicada en dashboard/server/routes/performance.js (Fase 1, §6);
// ahora vive UNA vez aquí y el dashboard la reutiliza. Nunca convierte
// NOT_AVAILABLE en 0 ni en ausencia silenciosa.

import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';

/** @returns {{metrics: Record<string,{value:number|'NOT_AVAILABLE', observed_at:string, source:string, confidence:number}>, lastUpdated:string|null}} */
export function normalizeLatestMetrics(contentId, observations) {
  const latestByMetric = new Map();
  for (const obs of observations) {
    if (obs.content_id !== contentId) continue;
    const current = latestByMetric.get(obs.metric);
    if (!current || new Date(obs.observed_at) > new Date(current.observed_at)) latestByMetric.set(obs.metric, obs);
  }
  const metrics = {};
  let lastUpdated = null;
  for (const [metric, obs] of latestByMetric) {
    metrics[metric] = { value: obs.value, observed_at: obs.observed_at, source: obs.source, confidence: obs.confidence };
    if (!lastUpdated || new Date(obs.observed_at) > new Date(lastUpdated)) lastUpdated = obs.observed_at;
  }
  return { metrics, lastUpdated };
}

/** Extrae el valor numérico de un metric normalizado, o NOT_AVAILABLE — nunca 0 por ausencia. */
export function metricValue(metrics, name) {
  const entry = metrics[name];
  return entry && typeof entry.value === 'number' ? entry.value : NOT_AVAILABLE;
}
