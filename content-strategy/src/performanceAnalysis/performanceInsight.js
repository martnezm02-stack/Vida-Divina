// performanceInsight.js — Performance Analysis Engine, Fase 8.
// PerformanceInsight: salida MECÁNICA y automática del Analysis Engine
// (benchmarks.js + patternDetection.js) — distinta de LearningInsight
// (performance-learning-intelligence/src/learningInsight.js, Fase 12), que
// es una entidad CURADA manualmente (evidence/pattern los redacta un
// humano/proceso externo) y no tiene los campos que pide esta fase
// (insightType/metric/value/benchmark/delta/evidenceCount). No hay
// equivalente real que extender — por eso es una entidad nueva, no una
// duplicada. Ambas pueden coexistir: un PerformanceInsight con evidencia
// suficiente podría, en una fase FUTURA de Learning, alimentar un
// LearningInsight curado — esta fase no hace ese salto (§ principio
// arquitectónico: no saltar directo a Learning).
//
// Mismo criterio anti-causalidad que LearningInsight: explanation nunca usa
// "causa"/"garantiza"/"hace que" — solo lenguaje de asociación.

import { randomUUID } from 'node:crypto';
import { CONFIDENCE_LEVELS } from './confidence.js';

export const INSIGHT_TYPES = Object.freeze([
  'TOP_PERFORMER', 'UNDERPERFORMER', 'FORMAT_PATTERN', 'PLATFORM_COMPARISON',
  'ENGAGEMENT_PATTERN', 'AMPLIFICATION_PATTERN', 'SCHEDULE_PATTERN',
]);

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bhace que\b/i, /\bpor eso funciona\b/i];

function assertNoCausalLanguage(text) {
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) throw new Error(`PerformanceInsight: "explanation" contiene lenguaje causal prohibido (coincide con ${pattern}) — solo se describe asociación observada, nunca causalidad.`);
  }
}

/**
 * @param {{platform:string, scope:string, insightType:string, metric:string,
 *   value:number, benchmark:number|null, delta:number|null, confidence:string,
 *   evidenceCount:number, explanation:string, source?:string,
 *   basedOnContentIds:string[]}} fields
 */
export function createPerformanceInsight(fields) {
  const {
    platform, scope, insightType, metric, value, benchmark = null, delta = null,
    confidence, evidenceCount, explanation, source = 'performance_analysis_engine',
    basedOnContentIds,
  } = fields;

  if (!platform) throw new Error('PerformanceInsight: "platform" es obligatorio.');
  if (!scope) throw new Error('PerformanceInsight: "scope" es obligatorio (ej. "instagram:format=image (N=8)").');
  if (!INSIGHT_TYPES.includes(insightType)) throw new Error(`PerformanceInsight: "insightType" inválido "${insightType}" (válidos: ${INSIGHT_TYPES.join(', ')}).`);
  if (!metric) throw new Error('PerformanceInsight: "metric" es obligatorio.');
  if (typeof value !== 'number') throw new Error('PerformanceInsight: "value" debe ser un número real observado.');
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`PerformanceInsight: "confidence" inválida "${confidence}" (válidas: ${CONFIDENCE_LEVELS.join(', ')}).`);
  if (typeof evidenceCount !== 'number' || evidenceCount < 1) throw new Error('PerformanceInsight: "evidenceCount" debe ser >= 1 — ningún insight sin evidencia real.');
  if (!explanation) throw new Error('PerformanceInsight: "explanation" es obligatorio.');
  assertNoCausalLanguage(explanation);
  if (!Array.isArray(basedOnContentIds) || basedOnContentIds.length === 0) {
    throw new Error('PerformanceInsight: "basedOnContentIds" debe ser un arreglo no vacío — trazabilidad hacia PublishedContent real.');
  }

  return Object.freeze({
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    platform,
    scope,
    insightType,
    metric,
    value,
    benchmark,
    delta,
    confidence,
    evidenceCount,
    explanation,
    source,
    basedOnContentIds: Object.freeze([...basedOnContentIds]),
  });
}
