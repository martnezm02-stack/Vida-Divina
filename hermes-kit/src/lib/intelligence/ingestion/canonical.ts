// canonical.ts — Contrato canónico de entrada del Intelligence Store (MI-2).
//
// Es el punto de paso obligatorio entre una fuente externa (TikTok, Meta
// Ads, Instagram, YouTube, Reddit, X, Google Ads...) y el Intelligence
// Store de MI-1: ningún adapter escribe SQL directamente, todos producen
// este tipo y lo entregan a ingestionService.ts.
//
// Todo campo que la fuente no entregue debe quedar `undefined`/ausente --
// nunca se inventa un valor por conveniencia (ver normalize.ts).

export interface CanonicalActor {
  external_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  type?: string | null; // advertiser | brand | creator | account | publisher
  url?: string | null;
  metadata?: unknown;
}

export interface CanonicalAsset {
  kind: string; // image | video | thumbnail | audio | document | other
  url?: string | null;
  local_path?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  fingerprint?: string | null;
  metadata?: unknown;
}

/** Snapshot de métricas -- solo se persisten las que la fuente entregó de verdad. */
export interface CanonicalMetrics {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reactions?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  spend?: number | null;
  reach?: number | null;
  captured_at?: number | null;
}

export interface CanonicalEvidence {
  kind: string; // frame | thumbnail | transcript_fragment | source_url | other
  content?: string | null;
  url?: string | null;
  metadata?: unknown;
}

export interface CanonicalIntelligenceItem {
  /** Slug del proyecto/workspace de Hermes (lo decide quien ingiere, no la fuente). */
  project: string;
  /** Slug de la fuente (tiktok, meta_ads, instagram, youtube, reddit, x, google_ads...). */
  source: string;

  external_id?: string | null;
  canonical_url?: string | null;
  landing_url?: string | null;

  actor?: CanonicalActor | null;

  title?: string | null;
  description?: string | null;

  published_at?: number | string | Date | null;
  first_seen_at?: number | string | Date | null;
  last_seen_at?: number | string | Date | null;

  content_type: string; // ad | post | video | creator_content | other
  media_type?: string | null; // image | video | carousel | text | audio...

  format?: string | null;
  language?: string | null;
  market?: string | null; // país/mercado

  hook?: string | null;
  angle?: string | null;
  cta?: string | null;
  offer?: string | null;

  tags?: string[];

  assets?: CanonicalAsset[];
  metrics?: CanonicalMetrics | null;
  evidence?: CanonicalEvidence[];

  /** Metadata específica de la fuente, preservada tal cual (nunca interpretada aquí). */
  source_metadata?: unknown;
}

/** Contexto que decide quién ingiere -- nunca lo infiere la fuente. */
export interface AdapterContext {
  project: string;
}
