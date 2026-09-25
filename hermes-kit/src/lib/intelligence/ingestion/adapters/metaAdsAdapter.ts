// metaAdsAdapter.ts — Adapter/fixture funcional para Meta Ads Library
// (MI-2). Shape fiel al resultado REAL confirmado del MCP
// `mcp__meta-ads__ads_library_search` (probado en vivo: search_terms
// "control de peso suplemento", countries=["MX"], ad_active_status="ALL"
// -> estimated_total_count 4433, 10 anuncios comerciales reales) y, para
// los campos más ricos (ad_creative_bodies/link_*/publisher_platforms/
// ad_delivery_stop_time), al esquema real confirmado en una fase previa de
// este repo vía Graph API v26.0 /ads_archive (ver
// creative-intelligence/src/sources/competitiveResearchSource.js -- solo
// se reutiliza como referencia de campos/contrato, no se importa ni se
// duplica su arquitectura).
//
// UNKNOWN = NULL siempre. No se fabrica media_type/format: a diferencia de
// TikTok/Instagram, Meta Ad Library no entrega ninguna señal directa de
// tipo de medio en este shape -- inventar uno violaría la regla más alta
// de esta capa. hook/angle/cta/offer tampoco se poblan (requerirían
// interpretar el copy, no normalizarlo).
import type { AdapterContext, CanonicalIntelligenceItem } from "../canonical";
import type { SourceAdapter } from "../sourceAdapter";
import { normalizeTimestamp } from "../normalize";

export interface MetaAdsRawItem {
  id?: string | number;
  page_id?: string | number;
  page_name?: string;
  ad_creative_link_title?: string;
  ad_creation_time?: string | number;
  ad_delivery_start_time?: string | number;
  /** Solo disponible vía Graph API /ads_archive directa -- el MCP ads_library_search confirmado no lo entrega. */
  ad_delivery_stop_time?: string | number | null;
  ad_snapshot_url?: string;
  currency?: string;
  /** Solo disponible vía Graph API /ads_archive directa. */
  publisher_platforms?: string[];
  /** Solo disponible vía Graph API /ads_archive directa -- copy real del anuncio. */
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  /**
   * País/mercado de la consulta que produjo este resultado. Meta no
   * devuelve "en qué país calzó" dentro de cada item -- lo asigna quien
   * arma el raw a partir de los `countries` usados en la búsqueda
   * (ads_library_search/search_page_ids), nunca se infiere aquí.
   */
  market?: string;
}

function primaryCopyText(raw: MetaAdsRawItem): string | null {
  if (Array.isArray(raw.ad_creative_bodies) && raw.ad_creative_bodies.length > 0 && raw.ad_creative_bodies[0]?.trim()) {
    return raw.ad_creative_bodies[0];
  }
  if (raw.ad_creative_link_title?.trim()) return raw.ad_creative_link_title;
  return null;
}

export const metaAdsAdapter: SourceAdapter<MetaAdsRawItem> = {
  source: "meta_ads",

  normalize(raw: MetaAdsRawItem, context: AdapterContext): CanonicalIntelligenceItem {
    const externalId = raw.id !== undefined ? String(raw.id) : null;
    const pageId = raw.page_id !== undefined ? String(raw.page_id) : null;
    const canonicalUrl = raw.ad_snapshot_url ?? null;

    return {
      project: context.project,
      source: "meta_ads",
      external_id: externalId,
      canonical_url: canonicalUrl,

      actor: pageId || raw.page_name
        ? {
            external_id: pageId,
            handle: null,
            display_name: raw.page_name ?? null,
            type: "advertiser",
            // URL mecánica y determinística desde un page_id real ya
            // verificado por la respuesta -- mismo criterio que el
            // permalink de reel construido desde shortcode en Instagram,
            // nunca un dato inventado.
            url: pageId ? `https://www.facebook.com/profile.php?id=${pageId}` : null,
          }
        : null,

      description: primaryCopyText(raw),
      published_at: normalizeTimestamp(raw.ad_delivery_start_time ?? null),

      content_type: "ad",
      media_type: null,
      language: null,
      market: raw.market ?? null,

      assets: [],

      evidence: canonicalUrl ? [{ kind: "source_url", url: canonicalUrl }] : [],

      source_metadata: {
        platform: "meta_ads",
        raw_id: externalId,
        page_id: pageId,
        page_name: raw.page_name ?? null,
        currency: raw.currency ?? null,
        ad_creation_time: raw.ad_creation_time ?? null,
        ad_delivery_stop_time: raw.ad_delivery_stop_time ?? null,
        publisher_platforms: raw.publisher_platforms ?? null,
        ad_creative_bodies: raw.ad_creative_bodies ?? null,
        ad_creative_link_titles: raw.ad_creative_link_titles ?? null,
        ad_creative_link_descriptions: raw.ad_creative_link_descriptions ?? null,
        ad_creative_link_captions: raw.ad_creative_link_captions ?? null,
      },
    };
  },
};
