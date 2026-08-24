// benchmarks.js — Performance Analysis Engine, Fase 5. Reutiliza el
// criterio de tamaño mínimo de muestra YA documentado en
// performance-learning-intelligence/src/performanceSignal.js
// (MIN_BASELINE_SAMPLE_SIZE=5, Fase 12 §5) — no se inventa un segundo
// umbral paralelo. Con menos observaciones que el mínimo, el benchmark se
// reporta explícitamente insuficiente, nunca se calcula sobre una muestra
// débil.

import { MIN_BASELINE_SAMPLE_SIZE } from '../../../performance-learning-intelligence/src/performanceSignal.js';

export { MIN_BASELINE_SAMPLE_SIZE };

function percentile(sorted, p) {
  // Nearest-rank simple y documentado — no interpolación, para mantener el
  // método reproducible a mano con cualquier muestra pequeña real.
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** @param {number[]} values - ya filtrados (sin NOT_AVAILABLE) */
export function computeBenchmarkStats(values, minSampleSize = MIN_BASELINE_SAMPLE_SIZE) {
  const sample_size = values.length;
  if (sample_size < minSampleSize) {
    return { status: 'INSUFFICIENT_DATA', reason: `Se requieren al menos ${minSampleSize} observaciones reales (hay ${sample_size}).`, sample_size };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = Number((sorted.reduce((a, b) => a + b, 0) / sample_size).toFixed(6));
  const mid = Math.floor(sample_size / 2);
  const median = Number((sample_size % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]).toFixed(6));
  return {
    status: 'OK',
    sample_size,
    mean,
    median,
    p25: Number(percentile(sorted, 25).toFixed(6)),
    p75: Number(percentile(sorted, 75).toFixed(6)),
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
}

/**
 * Agrupa `entries` (cada una con .platform, .groupKey opcional y .value ya
 * numérico) por plataforma y, cuando alcanza el mínimo, también por
 * groupKey (ej. format) dentro de esa plataforma.
 * @param {{platform:string, groupKey?:string, value:number}[]} entries
 */
export function buildBenchmarks(entries, { minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const byPlatform = new Map();
  for (const e of entries) {
    if (!byPlatform.has(e.platform)) byPlatform.set(e.platform, []);
    byPlatform.get(e.platform).push(e);
  }

  const result = {};
  for (const [platform, list] of byPlatform) {
    const platformStats = computeBenchmarkStats(list.map((e) => e.value), minSampleSize);
    const byGroup = {};
    const groups = new Map();
    for (const e of list) {
      if (!e.groupKey) continue;
      if (!groups.has(e.groupKey)) groups.set(e.groupKey, []);
      groups.get(e.groupKey).push(e.value);
    }
    for (const [groupKey, groupValues] of groups) {
      byGroup[groupKey] = computeBenchmarkStats(groupValues, minSampleSize);
    }
    result[platform] = { overall: platformStats, byGroup };
  }
  return result;
}
