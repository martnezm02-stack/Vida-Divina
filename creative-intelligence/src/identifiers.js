// identifiers.js — formas de identificador para la trazabilidad completa
// (CreativeCell → ProductionBrief → PublishedContent → PerformanceSnapshot
// → Learning), compatibles con Instagram media ID (ya real, existente en
// content-strategy/src/instagram*.js, sin modificar) y con Facebook/Meta
// Ads IDs futuros (todos nullable hasta que existan).

export const PLATFORMS = Object.freeze(['instagram', 'facebook', 'meta_ads']);

/**
 * Referencia a una pieza publicada en una plataforma real. `mediaId` es el
 * mismo tipo de valor que ya devuelve instagramMediaReader.js
 * (obtenerMedia().id) — este archivo no lo genera ni lo modifica, solo
 * define la forma que debe tener cuando se incorpore.
 */
export function createPlatformMediaRef({ platform, mediaId, campaignId = null, adsetId = null, adId = null, publicationDate = null }) {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`createPlatformMediaRef: plataforma inválida "${platform}" (válidas: ${PLATFORMS.join(', ')}).`);
  }
  if (!mediaId?.trim()) throw new Error('createPlatformMediaRef: "mediaId" es obligatorio.');
  return Object.freeze({ platform, mediaId, campaignId, adsetId, adId, publicationDate });
}
