// performanceSignal.js — Baseline (§5) + Contrato PerformanceSignal (§4).
//
// "Viral" NUNCA es una propiedad observada aquí — signal_type es
// deliberadamente neutro (ABOVE_BASELINE/BELOW_BASELINE/NORMAL/
// INSUFFICIENT_DATA). Cualquier lectura de "viralidad" es una inferencia
// posterior (LearningInsight/LearningHypothesis), nunca este contrato.

import { randomUUID } from 'node:crypto';
import { NOT_AVAILABLE } from './performanceObservation.js';

export const MIN_BASELINE_SAMPLE_SIZE = 5;
export const RELATIVE_CHANGE_THRESHOLD = 0.10; // ±10% — umbral simple y documentado, no un modelo estadístico. Exportado (Performance Analysis Engine, Fase 6) para que patternDetection.js compare grupos (formato/plataforma) con el MISMO umbral, sin reinventarlo.

export const SIGNAL_TYPES = Object.freeze(['ABOVE_BASELINE', 'BELOW_BASELINE', 'NORMAL', 'INSUFFICIENT_DATA']);

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Calcula un baseline simple (mediana, preferida sobre media por §5) para
 * platform + content_type + metric, a partir de observaciones YA
 * existentes. Nunca genera un baseline si sample_size < minSampleSize —
 * las observaciones NOT_AVAILABLE nunca cuentan como 0, simplemente se
 * excluyen de la muestra.
 */
export function computeBaseline({ observations, platform, contentTypeOf, metric, minSampleSize = MIN_BASELINE_SAMPLE_SIZE }) {
  const values = observations
    .filter((o) => o.platform === platform && o.metric === metric && contentTypeOf(o.content_id) !== null)
    .map((o) => o.value)
    .filter((v) => v !== NOT_AVAILABLE && typeof v === 'number');

  const sample_size = values.length;
  if (sample_size < minSampleSize) {
    return { baseline_value: null, baseline_method: 'median', sample_size, insufficient: true };
  }
  return { baseline_value: median(values), baseline_method: 'median', sample_size, insufficient: false };
}

export function createPerformanceSignal({ content_id, metric, observed_value, baseline, confidence_basis }) {
  if (!content_id) throw new Error('PerformanceSignal: "content_id" es obligatorio.');
  if (!metric) throw new Error('PerformanceSignal: "metric" es obligatorio.');

  let signal_type;
  let relative_change = null;
  let baseline_value = null;

  if (observed_value === NOT_AVAILABLE) {
    signal_type = 'INSUFFICIENT_DATA';
  } else if (!baseline || baseline.insufficient || baseline.baseline_value === null) {
    signal_type = 'INSUFFICIENT_DATA';
  } else {
    baseline_value = baseline.baseline_value;
    relative_change = baseline_value === 0 ? null : Number(((observed_value - baseline_value) / baseline_value).toFixed(4));
    if (relative_change === null) {
      signal_type = 'INSUFFICIENT_DATA'; // baseline=0 no permite una comparación relativa confiable
    } else if (relative_change >= RELATIVE_CHANGE_THRESHOLD) {
      signal_type = 'ABOVE_BASELINE';
    } else if (relative_change <= -RELATIVE_CHANGE_THRESHOLD) {
      signal_type = 'BELOW_BASELINE';
    } else {
      signal_type = 'NORMAL';
    }
  }

  return Object.freeze({
    signal_id: randomUUID(),
    content_id,
    metric,
    observed_value,
    baseline_value,
    relative_change,
    percentile: null, // no implementado en este MVP — documentado como limitación, no fabricado
    signal_type,
    basis: 'OBSERVADO',
    confidence: signal_type === 'INSUFFICIENT_DATA' ? 0.3 : 0.7,
    confidence_basis: confidence_basis ?? `Comparación simple contra baseline de mediana (${baseline?.sample_size ?? 0} muestras), umbral ±${RELATIVE_CHANGE_THRESHOLD * 100}%.`,
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}
