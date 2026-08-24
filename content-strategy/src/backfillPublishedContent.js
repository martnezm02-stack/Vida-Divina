// backfillPublishedContent.js — Performance Intelligence, Fase 7 (backfill
// controlado). Cierra el hueco real detectado en este repositorio: el flujo
// "PUBLICAR AHORA" del dashboard (dashboard/server/routes/generation.js#
// handlePublish) publica de verdad vía publishingService.js pero NUNCA
// persiste un PublishedContent — a diferencia del flujo de
// publicationService.js (content-strategy, Fase 17) o del
// PublishingScheduler (publishing-scheduler/), que sí dejan rastro. Sin un
// PublishedContent real no hay content_id al que atar un
// PerformanceObservation (contrato Fase 12: "nunca una observación sin
// contenido al que pertenezca").
//
// Este módulo NUNCA inventa contenido creativo (caption/topic real): arma
// un PublishedContent honesto a partir SOLO de datos reales recuperables
// por Graph API (created_time/timestamp, media_type) + el external_post_id
// ya conocido — exactamente el mismo criterio "no fabricar" del resto del
// proyecto. Es deliberadamente MANUAL/dirigido (recibe una lista explícita
// de {platform, externalPostId}) — no escanea ni descubre publicaciones por
// su cuenta, para no generar una recolección masiva no autorizada contra
// Meta (§ Fase 7 del encargo).

import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { obtenerMedia } from './instagramMediaReader.js';
import { obtenerPost } from './facebookPostReader.js';

const MEDIA_TYPE_TO_FORMAT = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  CAROUSEL_ALBUM: 'carousel',
  REELS: 'reel',
});

/** §6 idempotencia — nunca crea un segundo PublishedContent para el mismo external_post_id+platform ya backfilleado. */
export function findExistingByExternalPostId(store, { platform, externalPostId }) {
  return store.loadAll('published_content').find(
    (r) => r.platform === platform && r.external_post_id === externalPostId
  ) ?? null;
}

/**
 * Backfillea UN PublishedContent real a partir de un externalPostId ya
 * conocido y publicado (nunca republica, nunca modifica el post real —
 * solo GET). Idempotente: si ya existe, lo devuelve tal cual.
 *
 * @param {{platform:'instagram'|'facebook', externalPostId:string, store:object, overrides?:object}} params
 */
export async function backfillPublishedContentFromExternalId({ platform, externalPostId, store, overrides = {} }) {
  if (!['instagram', 'facebook'].includes(platform)) {
    throw new Error(`backfillPublishedContentFromExternalId: platform "${platform}" no soportado (válidos: instagram, facebook).`);
  }
  if (!externalPostId) throw new Error('backfillPublishedContentFromExternalId: "externalPostId" es obligatorio — nunca se inventa uno.');
  if (!store) throw new Error('backfillPublishedContentFromExternalId: "store" (PerformanceLearningStore) es obligatorio.');

  const existing = findExistingByExternalPostId(store, { platform, externalPostId });
  if (existing) {
    return { status: 'ALREADY_BACKFILLED', publishedContent: existing };
  }

  let publishedAt;
  let format;
  let permalink = null;

  if (platform === 'instagram') {
    const media = await obtenerMedia(externalPostId, overrides);
    publishedAt = media.timestamp;
    format = MEDIA_TYPE_TO_FORMAT[media.mediaType] ?? 'unknown';
    permalink = media.permalink;
  } else {
    const post = await obtenerPost(externalPostId, overrides);
    publishedAt = post.createdTime;
    format = 'unknown'; // facebookPostReader.js no expone attachments/media_type con este token (ver nota de cabecera) — nunca se infiere el formato real.
  }

  if (!publishedAt) {
    return { status: 'ERROR', error: `backfillPublishedContentFromExternalId: Graph API no devolvió una fecha real de publicación para "${externalPostId}" — no se puede backfillear sin ella.` };
  }

  const publishedContent = createPublishedContent({
    platform,
    published_at: publishedAt,
    content_type: 'social_post',
    format,
    topic: `Backfill: publicación real ya existente (${platform}, external_post_id=${externalPostId})`,
    url: permalink,
    external_post_id: externalPostId,
    metadata: { backfill: true, backfilled_at: new Date().toISOString() },
  });
  store.save('published_content', publishedContent);

  return { status: 'BACKFILLED', publishedContent };
}
