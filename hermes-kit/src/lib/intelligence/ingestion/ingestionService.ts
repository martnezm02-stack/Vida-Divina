// ingestionService.ts — Normalizador + persistencia: recibe un
// CanonicalIntelligenceItem ya producido por un adapter y lo escribe en el
// Intelligence Store de MI-1 usando exclusivamente sus APIs (getOrCreate*,
// upsert*, record/attach/add*) -- nunca SQL directo.
//
// FACT/OBSERVED DATA (esto) ≠ AI INFERENCE ≠ PATTERN ≠ INSIGHT: MI-2 solo
// persiste lo que la fuente entregó, normalizado -- no clasifica, no
// infiere, no genera hipótesis.
import { getOrCreateProject } from "../projects";
import { getOrCreateSource } from "../sources";
import { upsertActor } from "../actors";
import { upsertIntelligenceItem } from "../items";
import { recordMetrics } from "../metrics";
import { attachAsset, listAssetsForItem } from "../assets";
import { addEvidence, listEvidenceForItem } from "../evidence";
import type { Actor, Asset, Evidence, IntelligenceItemWithDerived, ItemMetricsSnapshot } from "../types";
import type { CanonicalIntelligenceItem } from "./canonical";
import {
  normalizeActorHandle,
  normalizeAssetKind,
  normalizeContentType,
  normalizeMetricValue,
  normalizeSourceSlug,
  normalizeTimestamp,
  normalizeUrl,
} from "./normalize";

export interface IngestResult {
  item: IntelligenceItemWithDerived;
  created: boolean;
  actor: Actor | null;
  assets: Asset[];
  evidence: Evidence[];
  metrics: ItemMetricsSnapshot | null;
}

export function ingestCanonicalItem(canonical: CanonicalIntelligenceItem): IngestResult {
  const project = getOrCreateProject(canonical.project);
  const source = getOrCreateSource(normalizeSourceSlug(canonical.source));

  const actor = canonical.actor
    ? upsertActor({
        project_id: project.id,
        source_id: source.id,
        external_id: canonical.actor.external_id ?? null,
        handle: normalizeActorHandle(canonical.actor.handle),
        display_name: canonical.actor.display_name ?? null,
        type: canonical.actor.type ?? null,
        url: normalizeUrl(canonical.actor.url ?? null),
        metadata: canonical.actor.metadata,
      })
    : null;

  const { item, created } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    actor_id: actor?.id ?? null,
    external_id: canonical.external_id ?? null,
    canonical_url: normalizeUrl(canonical.canonical_url ?? null),
    content_type: normalizeContentType(canonical.content_type),
    title: canonical.title ?? null,
    description: canonical.description ?? null,
    published_at: normalizeTimestamp(canonical.published_at ?? null),
    first_seen_at: normalizeTimestamp(canonical.first_seen_at ?? null) ?? undefined,
    last_seen_at: normalizeTimestamp(canonical.last_seen_at ?? null) ?? undefined,
    format: canonical.format ?? null,
    market: canonical.market ?? null,
    language: canonical.language ?? null,
    media_type: canonical.media_type ?? null,
    hook: canonical.hook ?? null,
    angle: canonical.angle ?? null,
    cta: canonical.cta ?? null,
    offer: canonical.offer ?? null,
    tags: canonical.tags,
    metadata: mergeSourceMetadata(canonical),
  });

  const assets = ingestAssets(item.id, canonical.assets ?? []);
  const evidence = ingestEvidence(item.id, canonical.evidence ?? []);
  const metrics = ingestMetrics(item.id, canonical);

  return { item, created, actor, assets, evidence, metrics };
}

function mergeSourceMetadata(canonical: CanonicalIntelligenceItem): unknown {
  if (canonical.landing_url === undefined && canonical.source_metadata === undefined) {
    return undefined;
  }
  const merged: Record<string, unknown> = {};
  if (canonical.landing_url !== undefined) {
    merged.landing_url = normalizeUrl(canonical.landing_url);
  }
  if (canonical.source_metadata !== undefined) {
    merged.source_metadata = canonical.source_metadata;
  }
  return merged;
}

function ingestAssets(
  itemId: number,
  assets: NonNullable<CanonicalIntelligenceItem["assets"]>
): Asset[] {
  if (assets.length === 0) return [];

  const existing = listAssetsForItem(itemId);
  const existingKeys = new Set(existing.map((a) => `${a.kind}|${a.url ?? ""}|${a.local_path ?? ""}`));

  const result: Asset[] = [];
  for (const raw of assets) {
    const kind = normalizeAssetKind(raw.kind);
    const url = normalizeUrl(raw.url ?? null);
    const localPath = raw.local_path ?? null;
    const key = `${kind}|${url ?? ""}|${localPath ?? ""}`;
    if (existingKeys.has(key)) continue; // re-ingesta idempotente: no duplica el mismo asset
    existingKeys.add(key);

    result.push(
      attachAsset({
        item_id: itemId,
        kind,
        url,
        local_path: localPath,
        metadata: {
          width: raw.width ?? null,
          height: raw.height ?? null,
          duration_seconds: raw.duration_seconds ?? null,
          fingerprint: raw.fingerprint ?? null,
          ...(raw.metadata !== undefined ? { source: raw.metadata } : {}),
        },
      })
    );
  }
  return result;
}

function ingestEvidence(
  itemId: number,
  evidence: NonNullable<CanonicalIntelligenceItem["evidence"]>
): Evidence[] {
  if (evidence.length === 0) return [];

  const existing = listEvidenceForItem(itemId);
  const existingKeys = new Set(
    existing.map((e) => `${e.kind}|${e.url ?? ""}|${e.content ?? ""}`)
  );

  const result: Evidence[] = [];
  for (const raw of evidence) {
    const url = normalizeUrl(raw.url ?? null);
    const content = raw.content ?? null;
    const key = `${raw.kind}|${url ?? ""}|${content ?? ""}`;
    if (existingKeys.has(key)) continue; // no duplica la misma evidencia en re-ingesta
    existingKeys.add(key);

    result.push(
      addEvidence({
        item_id: itemId,
        kind: raw.kind,
        content,
        url,
        metadata: raw.metadata,
      })
    );
  }
  return result;
}

const METRIC_FIELDS = [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "reactions",
  "clicks",
  "impressions",
  "spend",
  "reach",
] as const;

function ingestMetrics(
  itemId: number,
  canonical: CanonicalIntelligenceItem
): ItemMetricsSnapshot | null {
  const raw = canonical.metrics;
  if (!raw) return null;

  const values: Record<(typeof METRIC_FIELDS)[number], number | null> = {
    views: normalizeMetricValue(raw.views),
    likes: normalizeMetricValue(raw.likes),
    comments: normalizeMetricValue(raw.comments),
    shares: normalizeMetricValue(raw.shares),
    saves: normalizeMetricValue(raw.saves),
    reactions: normalizeMetricValue(raw.reactions),
    clicks: normalizeMetricValue(raw.clicks),
    impressions: normalizeMetricValue(raw.impressions),
    spend: normalizeMetricValue(raw.spend),
    reach: normalizeMetricValue(raw.reach),
  };

  const hasAnyValue = METRIC_FIELDS.some((f) => values[f] !== null);
  if (!hasAnyValue) return null; // nada real que reportar -- no se crea un snapshot vacío

  const extra: Record<string, number> = {};
  for (const f of ["saves", "reactions", "clicks", "impressions", "spend"] as const) {
    if (values[f] !== null) extra[f] = values[f]!;
  }

  return recordMetrics({
    item_id: itemId,
    views: values.views,
    likes: values.likes,
    comments: values.comments,
    shares: values.shares,
    reach: values.reach,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
    captured_at: normalizeTimestamp(raw.captured_at ?? null) ?? undefined,
  });
}
