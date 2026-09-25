// publishedContentAdapter.ts — Adapter/fixture funcional para
// PublishedContent + PerformanceObservation (MI-2), el puente mínimo entre
// la ejecución/publicación REAL ya existente en performance-learning-
// intelligence/ (PublishedContent, performanceObservation.js,
// performance-learning-intelligence/data/intelligence/*.jsonl -- "Creative
// Studio" real de este repo) y el Intelligence Store de hermes-kit
// (MI-1..MI-5, Performance Predictor).
//
// Shape fiel al contrato real ya en producción (confirmado contra
// performance-learning-intelligence/data/intelligence/published_content.jsonl
// y performance_observations.jsonl -- registros reales con
// source:"platform_observed", p.ej. el backfill real de Instagram Graph API
// Insights para external_post_id=18376003507235391). No se importa ni se
// duplica esa arquitectura -- solo se referencia como fuente de verdad del
// shape, igual que metaAdsAdapter.ts referencia competitiveResearchSource.js.
//
// source: "published_content" (distinto de "instagram"/"meta_ads"/"tiktok"):
// esto es evidencia de PRIMERA PARTE (contenido propio ya ejecutado), no
// investigación de mercado de terceros -- separarlo evita que MI-4 mezcle
// "nuestro post" con "un competidor" bajo el mismo bucket de fuente.
//
// UNKNOWN = NULL/ausente siempre. Una PerformanceObservation con
// value:"NOT_AVAILABLE" (contrato real ya establecido en
// performance-learning-intelligence, ver performanceObservation.js) se
// descarta -- nunca se convierte en 0 ni se inventa.
import type { AdapterContext, CanonicalIntelligenceItem, CanonicalMetrics } from "../canonical";
import type { SourceAdapter } from "../sourceAdapter";
import { normalizeTimestamp } from "../normalize";

/** Shape real de PublishedContent (performance-learning-intelligence/src/publishedContent.js). */
export interface PublishedContentRaw {
  content_id: string;
  platform: string;
  published_at: string | number;
  content_type: string;
  format?: string | null;
  topic?: string | null;
  product_ref?: string | null;
  /** Elemento semántico ya conocido al publicar, si existe -- p.ej. desde content-strategy/ContentItem.hook. Ausente en backfills reales (nunca se inventa). */
  hook_pattern_ref?: string | null;
  url?: string | null;
  external_post_id?: string | null;
  metadata?: unknown;
}

/** Shape real de PerformanceObservation (performance-learning-intelligence/src/performanceObservation.js). Una métrica por observación. */
export interface PerformanceObservationRaw {
  content_id: string;
  metric: string;
  /** "NOT_AVAILABLE" (contrato real ya establecido) o un número real observado -- nunca se sustituye. */
  value: number | "NOT_AVAILABLE";
  observed_at?: string | number;
  source?: string; // "platform_observed" | "synthetic_fixture" -- decide el llamador cuáles pasar, este adapter no filtra
}

export interface PublishedContentWithObservations {
  publishedContent: PublishedContentRaw;
  /** Observaciones YA filtradas por el llamador (p.ej. solo source:"platform_observed") -- este adapter no decide qué es "real", solo normaliza lo que recibe. */
  observations: PerformanceObservationRaw[];
}

const CANONICAL_METRIC_FIELDS = ["views", "likes", "comments", "shares", "saves", "reach", "impressions", "clicks", "spend"] as const;

function buildMetrics(observations: PerformanceObservationRaw[]): CanonicalMetrics | null {
  const values: Partial<Record<(typeof CANONICAL_METRIC_FIELDS)[number], number>> = {};
  let capturedAt: number | null = null;
  for (const obs of observations) {
    if (obs.value === "NOT_AVAILABLE") continue; // UNKNOWN real -- nunca 0
    if (!(CANONICAL_METRIC_FIELDS as readonly string[]).includes(obs.metric)) continue; // métrica fuera del contrato canónico (p.ej. watch_time_seconds) -- se preserva tal cual en source_metadata, no aquí
    values[obs.metric as (typeof CANONICAL_METRIC_FIELDS)[number]] = obs.value;
    const t = normalizeTimestamp(obs.observed_at ?? null);
    if (t !== null) capturedAt = capturedAt === null ? t : Math.max(capturedAt, t);
  }
  if (Object.keys(values).length === 0) return null;
  return { ...values, captured_at: capturedAt };
}

export const publishedContentAdapter: SourceAdapter<PublishedContentWithObservations> = {
  source: "published_content",

  normalize(raw: PublishedContentWithObservations, context: AdapterContext): CanonicalIntelligenceItem {
    const pc = raw.publishedContent;
    const publishedAt = normalizeTimestamp(pc.published_at ?? null);

    return {
      project: context.project,
      source: "published_content",
      external_id: pc.external_post_id ?? pc.content_id,
      canonical_url: pc.url ?? null,

      actor: null, // identidad del actor: fuera del contrato PublishedContent real -- nunca se inventa

      description: pc.topic ?? null,
      published_at: publishedAt,
      first_seen_at: publishedAt,
      last_seen_at: publishedAt,

      content_type: pc.content_type,
      media_type: null, // PublishedContent real no distingue media_type de format -- nunca se adivina
      format: pc.format ?? null,
      market: null,

      hook: pc.hook_pattern_ref ?? null,

      assets: [],
      metrics: buildMetrics(raw.observations),
      evidence: pc.url ? [{ kind: "source_url", url: pc.url }] : [],

      source_metadata: {
        platform: "published_content",
        published_content_id: pc.content_id,
        creative_studio_platform: pc.platform, // el canal real (instagram/facebook/...) -- distinto del `source` de MI-2
        product_ref: pc.product_ref ?? null,
        metadata: pc.metadata ?? null,
      },
    };
  },
};
