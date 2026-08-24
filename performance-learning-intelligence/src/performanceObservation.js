// performanceObservation.js — Contrato PerformanceObservation (Fase 12, §2)
// + normalización de métricas entre plataformas (§3).
//
// Regla central: una métrica AUSENTE nunca se convierte en 0. Se representa
// con el sentinel NOT_AVAILABLE, explícito y distinguible de un
// OBSERVADO=0 real (ej. un post con 0 comentarios verificados es un dato
// real; un post donde la plataforma no expone "comments" en absoluto es una
// AUSENCIA, no un cero).

import { randomUUID } from 'node:crypto';

export const NOT_AVAILABLE = 'NOT_AVAILABLE';

export const ALLOWED_METRICS = Object.freeze([
  'views', 'likes', 'comments', 'shares', 'saves', 'clicks',
  'watch_time_seconds', 'completion_rate', 'retention_rate',
  // reach/impressions — añadidas en Performance Analysis Engine (Fase 2) como
  // denominadores potenciales de métricas derivadas (engagement_rate, etc.).
  // Ambas auditadas como NOT_AVAILABLE en Instagram (deprecadas desde v22.0)
  // y Facebook (post_impressions deprecado, sin reemplazo directo) — nunca
  // se han observado con datos reales en este proyecto.
  'reach', 'impressions',
]);

const SOURCES = Object.freeze(['platform_observed', 'synthetic_fixture']);

export function createPerformanceObservation(fields) {
  const {
    content_id,
    platform,
    metric,
    value,
    observed_at,
    measurement_window = null,
    confidence,
    confidence_basis,
    source,
  } = fields;

  if (!content_id) throw new Error('PerformanceObservation: "content_id" es obligatorio — nunca una observación sin contenido al que pertenezca.');
  if (!platform) throw new Error('PerformanceObservation: "platform" es obligatorio.');
  if (!ALLOWED_METRICS.includes(metric)) throw new Error(`PerformanceObservation: métrica no soportada "${metric}" (válidas: ${ALLOWED_METRICS.join(', ')})`);
  if (value !== NOT_AVAILABLE && typeof value !== 'number') {
    throw new Error('PerformanceObservation: "value" debe ser un número real observado, o exactamente el sentinel NOT_AVAILABLE — nunca se infiere ni se asume 0.');
  }
  if (!observed_at) throw new Error('PerformanceObservation: "observed_at" es obligatorio.');
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw new Error('PerformanceObservation: "confidence" debe estar en [0,1].');
  if (!confidence_basis) throw new Error('PerformanceObservation: "confidence_basis" es obligatorio.');
  if (!SOURCES.includes(source)) throw new Error(`PerformanceObservation: "source" inválido "${source}" (válidos: ${SOURCES.join(', ')}) — todo dato debe declararse explícitamente real u sintético.`);

  return Object.freeze({
    performance_observation_id: randomUUID(),
    content_id,
    platform,
    metric,
    value,
    observed_at,
    measurement_window,
    basis: 'OBSERVADO',
    confidence,
    confidence_basis,
    requires_human_review: true,
    source,
  });
}

// --- Normalización (§3): conserva raw_metric + normalized_metric +
// normalization_method. NUNCA inventa una equivalencia donde no hay una
// correspondencia razonablemente confiable — en ese caso normalized_metric
// queda null y el método lo documenta explícitamente.
const NORMALIZATION_TABLE = {
  // platform::raw_metric -> { normalized_metric, method }
  'instagram::plays': { normalized_metric: 'views', method: 'platform_plays_as_views' },
  'instagram::views': { normalized_metric: 'views', method: 'identity' },
  'tiktok::views': { normalized_metric: 'views', method: 'identity' },
  'youtube_shorts::views': { normalized_metric: 'views', method: 'identity' },
  'youtube::views': { normalized_metric: 'views', method: 'identity' },
};

export function normalizeMetric({ platform, metric, value }) {
  const key = `${platform}::${metric}`;
  const mapping = NORMALIZATION_TABLE[key];
  return {
    raw_metric: metric,
    platform,
    normalized_metric: mapping ? mapping.normalized_metric : null,
    normalization_method: mapping ? mapping.method : 'no_confident_mapping',
    value,
  };
}
