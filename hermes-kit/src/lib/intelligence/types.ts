// types.ts — Tipos del modelo canónico del Intelligence Store (MI-1).

export interface Project {
  id: number;
  slug: string;
  name: string;
  created_at: number;
}

export interface Source {
  id: number;
  slug: string;
  name: string;
  created_at: number;
}

export interface Actor {
  id: number;
  project_id: number;
  source_id: number | null;
  external_id: string | null;
  handle: string | null;
  display_name: string | null;
  type: string | null;
  url: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface ActorInput {
  project_id: number;
  source_id?: number | null;
  external_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  type?: string | null;
  url?: string | null;
  metadata?: unknown;
}

export interface IntelligenceItem {
  id: number;
  project_id: number;
  source_id: number;
  actor_id: number | null;
  external_id: string | null;
  canonical_url: string | null;
  content_type: string;
  title: string | null;
  description: string | null;

  published_at: number | null;
  first_seen_at: number;
  last_seen_at: number;

  format: string | null;
  style: string | null;
  theme: string | null;
  market: string | null;
  audience: string | null;
  objective: string | null;
  product: string | null;
  funnel_stage: string | null;

  hook: string | null;
  angle: string | null;
  problem: string | null;
  mechanism: string | null;
  cta: string | null;
  offer: string | null;
  social_proof: string | null;

  tags_json: string | null;
  metadata_json: string | null;

  created_at: number;
  updated_at: number;
}

/** Item con `active_days` derivado (nunca almacenado). */
export interface IntelligenceItemWithDerived extends IntelligenceItem {
  active_days: number;
}

export interface IntelligenceItemInput {
  project_id: number;
  source_id: number;
  actor_id?: number | null;
  external_id?: string | null;
  canonical_url?: string | null;
  content_type: string;
  title?: string | null;
  description?: string | null;

  published_at?: number | null;
  first_seen_at?: number;
  last_seen_at?: number;

  format?: string | null;
  style?: string | null;
  theme?: string | null;
  market?: string | null;
  audience?: string | null;
  objective?: string | null;
  product?: string | null;
  funnel_stage?: string | null;

  hook?: string | null;
  angle?: string | null;
  problem?: string | null;
  mechanism?: string | null;
  cta?: string | null;
  offer?: string | null;
  social_proof?: string | null;

  tags?: string[];
  metadata?: unknown;
}

export type IntelligenceItemUpdate = Partial<
  Omit<IntelligenceItemInput, "project_id" | "source_id">
>;

export interface IntelligenceItemSearchFilter {
  project_id: number;
  source_id?: number;
  actor_id?: number;
  content_type?: string;
  market?: string;
  audience?: string;
  format?: string;
  style?: string;
  funnel_stage?: string;
  hook?: string;
  angle?: string;
  tag?: string;
  published_after?: number;
  published_before?: number;
  first_seen_after?: number;
  last_seen_after?: number;
  min_active_days?: number;
  limit?: number;
  offset?: number;
}

export interface ItemMetricsSnapshot {
  id: number;
  item_id: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  reach: number | null;
  extra_json: string | null;
  captured_at: number;
}

export interface ItemMetricsInput {
  item_id: number;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  engagement?: number | null;
  reach?: number | null;
  extra?: unknown;
  captured_at?: number;
}

export interface Asset {
  id: number;
  item_id: number;
  kind: string;
  url: string | null;
  local_path: string | null;
  metadata_json: string | null;
  created_at: number;
}

export interface AssetInput {
  item_id: number;
  kind: string;
  url?: string | null;
  local_path?: string | null;
  metadata?: unknown;
}

export interface Evidence {
  id: number;
  item_id: number;
  kind: string;
  content: string | null;
  url: string | null;
  metadata_json: string | null;
  created_at: number;
}

export interface EvidenceInput {
  item_id: number;
  kind: string;
  content?: string | null;
  url?: string | null;
  metadata?: unknown;
}

export interface AiAnalysis {
  id: number;
  item_id: number;
  analysis_type: string;
  model: string | null;
  result_json: string;
  created_at: number;
}

export interface AiAnalysisInput {
  item_id: number;
  analysis_type: string;
  model?: string | null;
  result: unknown;
}

export interface Signal {
  id: number;
  project_id: number;
  item_id: number | null;
  actor_id: number | null;
  signal_type: string;
  title: string;
  description: string | null;
  strength: number | null;
  detected_at: number;
  metadata_json: string | null;
  created_at: number;
}

export interface SignalInput {
  project_id: number;
  item_id?: number | null;
  actor_id?: number | null;
  signal_type: string;
  title: string;
  description?: string | null;
  strength?: number | null;
  detected_at?: number;
  metadata?: unknown;
}

export interface ItemRelationship {
  id: number;
  item_id: number;
  related_item_id: number;
  relation_type: string;
  metadata_json: string | null;
  created_at: number;
}

export interface Pattern {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  pattern_type: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface PatternInput {
  project_id: number;
  name: string;
  description?: string | null;
  pattern_type?: string | null;
  metadata?: unknown;
}

export interface Insight {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  insight_type: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface InsightInput {
  project_id: number;
  name: string;
  description?: string | null;
  insight_type?: string | null;
  metadata?: unknown;
}

export interface Watchlist {
  id: number;
  project_id: number;
  name: string;
  watchlist_type: string;
  created_at: number;
}

export interface WatchlistEntry {
  id: number;
  watchlist_id: number;
  value: string;
  kind: string | null;
  created_at: number;
}
