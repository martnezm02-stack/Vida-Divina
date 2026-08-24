// performanceSignal.js — PERFORMANCE_SIGNAL (Fase 11).
//
// Deliberadamente NO es una dimensión de marketing-intelligence/src/taxonomy.js
// — nunca se agrega a ese arreglo ni se mezcla con HOOK/PROBLEM/DESIRE/etc.
// (§7 del encargo: "No mezcles PERFORMANCE_SIGNAL con las dimensiones de
// marketing"). Representa una métrica de plataforma OBSERVADA (views), nunca
// una interpretación de por qué un video tiene esas views — esa
// interpretación, si existe, vive en una Hipótesis separada (ver
// pipeline/hypothesis.js de marketing-intelligence, reutilizado sin cambios).
//
// Se le da la misma forma de objeto que una Observation de
// marketing-intelligence (observation_id, raw_id, dimension, value, basis,
// evidence_quote/evidence, confidence, confidence_basis, requires_human_review,
// retrieved_at) para que la trazabilidad y los exportadores existentes puedan
// tratarla de forma consistente — pero dimension SIEMPRE es literalmente el
// string "PERFORMANCE_SIGNAL", nunca un valor de DIMENSIONS.

import { randomUUID } from 'node:crypto';

const SUPPORTED_METRICS = Object.freeze(['views']);

/**
 * Construye una observación de PERFORMANCE_SIGNAL a partir de metadata YA
 * adquirida (nunca inventa un número). Lanza si la métrica no fue
 * verificablemente observada (views_available !== true).
 */
export function createPerformanceSignalObservation({ raw_id, url, metricName, metrics }) {
  if (!raw_id) throw new Error('PerformanceSignal: "raw_id" es obligatorio — toda señal debe apuntar a un RAW real.');
  if (!url) throw new Error('PerformanceSignal: "url" es obligatorio.');
  if (!SUPPORTED_METRICS.includes(metricName)) {
    throw new Error(`PerformanceSignal: métrica no soportada en este piloto: "${metricName}" (soportadas: ${SUPPORTED_METRICS.join(', ')})`);
  }
  if (!metrics || metrics[`${metricName}_available`] !== true || typeof metrics[metricName] !== 'number') {
    throw new Error(`PerformanceSignal: la métrica "${metricName}" no fue observada de forma verificable para ${url} — nunca se inventa un valor.`);
  }

  return Object.freeze({
    observation_id: randomUUID(),
    raw_id,
    url,
    dimension: 'PERFORMANCE_SIGNAL', // NUNCA una entrada de marketing-intelligence/src/taxonomy.js
    value: metricName, // "views" — el TIPO de señal, no el número (el número vive en metric_value)
    metric_value: metrics[metricName],
    basis: 'OBSERVADO',
    evidence: { method: 'metadata', detail: `${metricName} reportado por la página pública de YouTube (videoDetails.${metricName === 'views' ? 'viewCount' : metricName})` },
    confidence: 1.0, // es un dato de plataforma, no una inferencia de texto — pero igual requiere revisión humana antes de cualquier uso (ver abajo)
    confidence_basis: 'Dato numérico reportado directamente por la metadata pública de la página, no derivado de una heurística de texto.',
    // Igual que TODA observación de fuente externa en este proyecto: nunca se
    // promueve automáticamente a una conclusión de negocio. Nunca implica
    // causalidad ("este video es viral porque...") — solo registra el número.
    requires_human_review: true,
    retrieved_at: new Date().toISOString(),
  });
}
