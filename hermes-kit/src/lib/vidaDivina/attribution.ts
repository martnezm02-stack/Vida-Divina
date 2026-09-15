// attribution.ts — Vocabulario y utilidades de atribución real (FASE
// "Attribution + Reporting + Email MCP + Alerta WhatsApp", 2026-09-04).
//
// RELACIÓN CON attribution-engine/ (ya existente, auditado antes de escribir
// esto): ese motor responde "¿esta publicación/Reel probablemente generó
// esta venta?" por PROXIMIDAD TEMPORAL + evidencia estructural, con niveles
// de confianza (HIGH/MEDIUM/LOW/UNKNOWN) -- es intencionalmente
// probabilístico, y persiste en performance-learning-intelligence (JSON),
// no en el CRM. Esta capa (customers.first_touch/last_touch, PostgreSQL)
// responde una pregunta DISTINTA y estrictamente no-inferida: "¿qué
// metadata REAL de origen (referral de Meta) trae este cliente concreto?".
// No son el mismo motor ni se fusionan -- attribution-engine/ sigue siendo
// la única fuente de verdad de "rendimiento de contenido/campaña"; esta
// capa es la única fuente de verdad de "origen real conocido de un
// cliente". Cruzarlas (contenido -> conversación -> lead -> venta) queda
// como integración futura, no se fuerza aquí.
//
// REGLA NO NEGOCIABLE: una Attribution solo se construye a partir de
// metadata REAL (el objeto `referral` real de Meta Cloud API en un mensaje
// de click-to-WhatsApp, o una referencia explícita ya conocida) -- NUNCA a
// partir del texto del cliente, su nombre, o una inferencia del LLM ("vi tu
// publicación" no es evidencia real). Si no hay metadata real, se omite
// (undefined) -- crmClient.ts ya trata "sin firstTouch" como "no inventar
// first_touch_at", ver customerRepository.createCustomer.

export interface Attribution {
  platform?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  content?: string | null;
  contentId?: string | null;
  adId?: string | null;
  creativeId?: string | null;
}

/**
 * Construye una Attribution real a partir del objeto `referral` REAL que
 * Meta Cloud API adjunta a un mensaje entrante que llegó vía "click to
 * WhatsApp" (anuncio o publicación) -- forma documentada real:
 * { source_url, source_type: 'ad'|'post', source_id, headline, body,
 *   media_type, image_url|video_url, thumbnail_url, ctwa_clid }.
 *
 * Mapeo real (nunca inventado): source_type='ad' -> source='paid', platform
 * derivado de source_url (instagram.com/facebook.com/wa.me...) si se puede
 * determinar con certeza, si no 'meta' (no se adivina cuál de las dos
 * apps). source_id -> content_id (identifica el post/anuncio real de
 * origen); ctwa_clid -> ad_id SOLO si source_type='ad' (es el click id real
 * del anuncio, documentado por Meta). campaign/campaignId/creativeId NO
 * vienen en este objeto real -- se dejan null, nunca se inventan.
 */
export function attributionFromMetaReferral(referral: {
  source_url?: string;
  source_type?: string;
  source_id?: string;
  ctwa_clid?: string;
} | null | undefined): Attribution | undefined {
  if (!referral) return undefined;

  const platform = platformFromSourceUrl(referral.source_url);
  const isAd = referral.source_type === "ad";

  return {
    platform: platform ?? "meta",
    source: isAd ? "paid" : referral.source_type === "post" ? "organic" : null,
    medium: isAd ? "ad" : referral.source_type === "post" ? "social_post" : null,
    contentId: referral.source_id ?? null,
    adId: isAd ? (referral.ctwa_clid ?? referral.source_id ?? null) : null,
    // campaign/campaignId/creativeId: Meta no los incluye en este objeto
    // real -- nunca se inventan aquí.
    campaign: null,
    campaignId: null,
    creativeId: null,
    content: null,
  };
}

function platformFromSourceUrl(sourceUrl?: string): string | null {
  if (!sourceUrl) return null;
  if (/instagram\.com/i.test(sourceUrl)) return "instagram";
  if (/facebook\.com|fb\.com/i.test(sourceUrl)) return "facebook";
  return null; // dominio real desconocido -- nunca se adivina.
}

/** true si al menos un campo real de atribución está presente (no todo-null). */
export function hasRealAttribution(attribution: Attribution | null | undefined): boolean {
  if (!attribution) return false;
  return Object.values(attribution).some((v) => v !== null && v !== undefined);
}
