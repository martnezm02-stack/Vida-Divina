// tiktokAdapter.ts — Adapter/fixture funcional para TikTok (MI-2).
//
// Forma realista de un anuncio de TikTok tal como la usó el fixture de
// MI-1 (test/intelligence/realisticAdFixture.test.ts): anunciante, video +
// thumbnail, hook, métricas de engagement. El shape es representativo, no
// el contrato real de ninguna API concreta -- cuando se conecte una fuente
// real (TikTok Creative Center, Meta Ad Library, etc.) solo cambia este
// adapter, nunca el core de normalización/persistencia.
import type { AdapterContext, CanonicalIntelligenceItem } from "../canonical";
import type { SourceAdapter } from "../sourceAdapter";
import { normalizeTimestamp } from "../normalize";

export interface TikTokRawAdvertiser {
  id: string;
  name: string;
  handle?: string;
  profile_url?: string;
}

export interface TikTokRawVideo {
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
}

export interface TikTokRawStats {
  play_count?: number;
  digg_count?: number; // likes
  comment_count?: number;
  share_count?: number;
}

export interface TikTokRawAd {
  id: string;
  url: string;
  advertiser: TikTokRawAdvertiser;
  caption?: string;
  publish_time?: string | number;
  first_seen?: string | number;
  last_seen?: string | number;
  video: TikTokRawVideo;
  stats?: TikTokRawStats;
  hook_text?: string;
  cta_text?: string;
  market?: string;
  language?: string;
  metrics_captured_at?: string | number;
}

export const tiktokAdapter: SourceAdapter<TikTokRawAd> = {
  source: "tiktok",

  normalize(raw: TikTokRawAd, context: AdapterContext): CanonicalIntelligenceItem {
    return {
      project: context.project,
      source: "tiktok",
      external_id: raw.id,
      canonical_url: raw.url,

      actor: {
        external_id: raw.advertiser.id,
        handle: raw.advertiser.handle ?? null,
        display_name: raw.advertiser.name,
        type: "advertiser",
        url: raw.advertiser.profile_url ?? null,
      },

      description: raw.caption ?? null,
      published_at: normalizeTimestamp(raw.publish_time ?? null),
      first_seen_at: normalizeTimestamp(raw.first_seen ?? null),
      last_seen_at: normalizeTimestamp(raw.last_seen ?? null),

      content_type: "ad",
      media_type: "video",
      format: "video_vertical",
      language: raw.language ?? null,
      market: raw.market ?? null,

      hook: raw.hook_text ?? null,
      cta: raw.cta_text ?? null,

      assets: [
        {
          kind: "video",
          url: raw.video.url,
          width: raw.video.width ?? null,
          height: raw.video.height ?? null,
          duration_seconds: raw.video.duration_seconds ?? null,
        },
        ...(raw.video.thumbnail_url
          ? [{ kind: "thumbnail", url: raw.video.thumbnail_url }]
          : []),
      ],

      metrics: raw.stats
        ? {
            views: raw.stats.play_count ?? null,
            likes: raw.stats.digg_count ?? null,
            comments: raw.stats.comment_count ?? null,
            shares: raw.stats.share_count ?? null,
            captured_at: normalizeTimestamp(
              raw.metrics_captured_at ?? raw.last_seen ?? null
            ),
          }
        : null,

      evidence: [{ kind: "source_url", url: raw.url }],

      source_metadata: { platform: "tiktok", raw_id: raw.id },
    };
  },
};
