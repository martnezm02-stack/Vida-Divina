// index.ts — Punto de entrada de la capa de ingesta/normalización (MI-2).
export * from "./canonical";
export type { SourceAdapter } from "./sourceAdapter";
export {
  normalizeUrl,
  normalizeTimestamp,
  normalizeSourceSlug,
  normalizeContentType,
  normalizeAssetKind,
  normalizeActorHandle,
  normalizeMetricValue,
} from "./normalize";
export { ingestCanonicalItem } from "./ingestionService";
export type { IngestResult } from "./ingestionService";
export { tiktokAdapter } from "./adapters/tiktokAdapter";
export type { TikTokRawAd, TikTokRawAdvertiser, TikTokRawVideo, TikTokRawStats } from "./adapters/tiktokAdapter";
export { instagramAdapter } from "./adapters/instagramAdapter";
export type { InstagramRawItem, InstagramRawOwner, InstagramRawCaption } from "./adapters/instagramAdapter";
export { metaAdsAdapter } from "./adapters/metaAdsAdapter";
export type { MetaAdsRawItem } from "./adapters/metaAdsAdapter";
export { publishedContentAdapter } from "./adapters/publishedContentAdapter";
export type {
  PublishedContentRaw,
  PerformanceObservationRaw,
  PublishedContentWithObservations,
} from "./adapters/publishedContentAdapter";
