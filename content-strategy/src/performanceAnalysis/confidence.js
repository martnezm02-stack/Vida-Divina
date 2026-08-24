// confidence.js — Performance Analysis Engine, Fase 9. Reglas simples y
// documentadas, sin modelos probabilísticos. Umbrales anclados al mismo
// MIN_BASELINE_SAMPLE_SIZE=5 ya usado en benchmarks.js/performanceSignal.js
// — HIGH exige el doble de esa muestra mínima, nunca un número arbitrario
// nuevo.

import { MIN_BASELINE_SAMPLE_SIZE } from '../../../performance-learning-intelligence/src/performanceSignal.js';

export const CONFIDENCE_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

const HIGH_DELTA_THRESHOLD = 0.25; // ±25% respecto al benchmark — documentado, mismo espíritu que el ±10% de PerformanceSignal pero más exigente por tratarse de un insight agregado, no de un solo dato

/**
 * @param {{evidenceCount:number, deltaAbs:number|null, allMetricsAvailable:boolean}} params
 * deltaAbs = |relative_change| respecto al benchmark, o null si no aplica.
 */
export function classifyConfidence({ evidenceCount, deltaAbs = null, allMetricsAvailable = true }) {
  if (evidenceCount < MIN_BASELINE_SAMPLE_SIZE) return 'LOW';
  if (
    evidenceCount >= MIN_BASELINE_SAMPLE_SIZE * 2 &&
    allMetricsAvailable &&
    typeof deltaAbs === 'number' && deltaAbs >= HIGH_DELTA_THRESHOLD
  ) {
    return 'HIGH';
  }
  return 'MEDIUM';
}
