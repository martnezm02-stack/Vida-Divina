// instagramAdapter.ts — Adapter/fixture funcional para Instagram (MI-2).
//
// Shape del raw fiel a lo que la API de ScrapeCreators devuelve para
// reels/posts de Instagram (confirmado contra last30days/skills/last30days/
// scripts/lib/instagram.py#_parse_items, el conector real que Hermes ya usa
// vía ScrapeCreators -- mismos nombres de campo: id/pk, shortcode/code,
// caption como string u objeto {text}, owner/user con username,
// video_play_count/video_view_count/play_count, like_count, comment_count,
// taken_at, video_duration). No es el contrato de ninguna API pública
// documentada de Meta -- cuando cambie el shape real, solo este adapter
// cambia, nunca el core de normalización/persistencia (MI-1/MI-2).
//
// UNKNOWN = NULL en todo momento: ninguna métrica ausente se convierte en
// 0 aquí (a diferencia del post-procesado de last30days en Python, que sí
// usa `or 0` para su propio uso interno -- ese comportamiento no cruza
// hacia el Intelligence Store).
import type { AdapterContext, CanonicalIntelligenceItem } from "../canonical";
import type { SourceAdapter } from "../sourceAdapter";
import { normalizeMetricValue, normalizeTimestamp } from "../normalize";

export interface InstagramRawOwner {
  username?: string;
}

export interface InstagramRawCaption {
  text?: string;
}

export interface InstagramRawItem {
  id?: string | number;
  pk?: string | number;
  shortcode?: string;
  code?: string;
  url?: string;
  caption?: string | InstagramRawCaption;
  desc?: string;
  text?: string;
  owner?: InstagramRawOwner | string;
  user?: InstagramRawOwner | string;
  video_play_count?: number;
  video_view_count?: number;
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  video_duration?: number;
  taken_at?: string | number;
  /** 'reel' | 'post' | otro -- cuando el caller lo conoce (p.ej. desde qué endpoint de ScrapeCreators vino); ausente = no se adivina. */
  content_type?: string;
  /** Fragmento de transcript, si ya se obtuvo por separado (SC /v2/instagram/media/transcript). Opcional -- nunca se inventa. */
  transcript?: string;
  market?: string;
  language?: string;
}

function extractCaptionText(raw: InstagramRawItem): string | null {
  if (typeof raw.caption === "string") return raw.caption;
  if (raw.caption && typeof raw.caption === "object" && typeof raw.caption.text === "string") {
    return raw.caption.text;
  }
  if (typeof raw.desc === "string") return raw.desc;
  if (typeof raw.text === "string") return raw.text;
  return null;
}

function extractUsername(raw: InstagramRawItem): string | null {
  const owner = raw.owner ?? raw.user;
  if (typeof owner === "string") return owner || null;
  if (owner && typeof owner === "object" && typeof owner.username === "string") {
    return owner.username || null;
  }
  return null;
}

function hasVideoSignal(raw: InstagramRawItem): boolean {
  return (
    raw.video_play_count !== undefined ||
    raw.video_view_count !== undefined ||
    raw.play_count !== undefined ||
    raw.video_duration !== undefined
  );
}

export const instagramAdapter: SourceAdapter<InstagramRawItem> = {
  source: "instagram",

  normalize(raw: InstagramRawItem, context: AdapterContext): CanonicalIntelligenceItem {
    const externalId =
      raw.id !== undefined ? String(raw.id) : raw.pk !== undefined ? String(raw.pk) : null;
    const shortcode = raw.shortcode || raw.code || null;
    const canonicalUrl = raw.url || (shortcode ? `https://www.instagram.com/reel/${shortcode}` : null);
    const username = extractUsername(raw);
    const isVideo = hasVideoSignal(raw);

    return {
      project: context.project,
      source: "instagram",
      external_id: externalId,
      canonical_url: canonicalUrl,

      actor: username
        ? {
            external_id: null,
            handle: username,
            display_name: null,
            type: "creator",
            url: `https://www.instagram.com/${username}/`,
          }
        : null,

      description: extractCaptionText(raw),
      published_at: normalizeTimestamp(raw.taken_at ?? null),

      content_type: raw.content_type ?? (isVideo ? "reel" : "post"),
      media_type: isVideo ? "video" : null,
      // Formato observable directamente del asset (video vs. no-video) --
      // no es una inferencia de contenido/mensaje, solo el tipo técnico
      // del medio. hook/angle/cta/offer se dejan sin poblar a propósito:
      // extraerlos del caption libre requeriría interpretación de texto,
      // fuera de lo que MI-2 normaliza de forma determinista.
      format: isVideo ? "video" : null,
      language: raw.language ?? null,
      market: raw.market ?? null,

      assets: canonicalUrl
        ? [
            {
              kind: isVideo ? "video" : "image",
              url: canonicalUrl,
              duration_seconds: normalizeMetricValue(raw.video_duration),
            },
          ]
        : [],

      metrics: {
        views: normalizeMetricValue(raw.video_play_count ?? raw.video_view_count ?? raw.play_count),
        likes: normalizeMetricValue(raw.like_count),
        comments: normalizeMetricValue(raw.comment_count),
      },

      evidence: [
        ...(canonicalUrl ? [{ kind: "source_url", url: canonicalUrl }] : []),
        ...(raw.transcript ? [{ kind: "transcript_fragment", content: raw.transcript }] : []),
      ],

      source_metadata: { platform: "instagram", raw_id: externalId, shortcode },
    };
  },
};
