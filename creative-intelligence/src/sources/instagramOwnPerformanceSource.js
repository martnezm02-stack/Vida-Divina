// instagramOwnPerformanceSource.js — motor REAL de OwnPerformanceSource
// para Instagram, detrás de la interfaz de ownPerformanceSource.js.
//
// NO reconstruye ni modifica los lectores existentes de
// content-strategy/src/ (instagramAccountReader.js, instagramMediaReader.js,
// instagramInsightsReader.js) — los importa tal cual y solo MAPEA su salida
// a la forma que esta capa ya define (OwnPerformanceSnapshotShape,
// PublishedContentRef). Ninguna llamada de escritura: los tres lectores
// importados son GET únicamente (confirmado en su propio código, Fase de
// integración de Instagram — nunca se llamó ni se llama aquí a
// instagramPublicationAdapter.js).
//
// Credenciales: viven exclusivamente en content-strategy/.env, cargadas
// por quien invoque el proceso (--env-file) — este archivo nunca lee ni
// imprime WHATSAPP_*/INSTAGRAM_ACCESS_TOKEN, solo pasa `overrides`
// (incluido fetchImpl para tests) a los lectores existentes, que ya
// implementan el patrón "sin credencial → error explícito, nunca toca
// la red" (ver Fase de integración de Instagram).

import { obtenerCuentaInstagram, listarPublicaciones } from '../../../content-strategy/src/instagramAccountReader.js';
import { obtenerMedia } from '../../../content-strategy/src/instagramMediaReader.js';
import { obtenerInsightsDePublicacion } from '../../../content-strategy/src/instagramInsightsReader.js';
import { OwnPerformanceSource } from './ownPerformanceSource.js';

/**
 * GET /{media-id} (ya mapeado por instagramMediaReader.js) → PublishedContentRef
 * mínimo pedido en esta fase: platform, platformMediaId, mediaType, timestamp,
 * permalink, caption. Nunca inventa un campo — lo que el lector real no
 * trae, llega null (ver instagramMediaReader.js, mismo principio).
 */
export function mapInstagramMediaToPublishedContentRef(media) {
  if (!media?.id) throw new Error('mapInstagramMediaToPublishedContentRef: se requiere un media real con "id" — nunca se construye una referencia sin id real de Instagram.');
  return Object.freeze({
    platform: 'instagram',
    platformMediaId: media.id,
    mediaType: media.mediaType ?? null,
    timestamp: media.timestamp ?? null,
    permalink: media.permalink ?? null,
    caption: media.caption ?? null,
  });
}

/**
 * GET /{media-id}/insights (ya mapeado por instagramInsightsReader.js) →
 * OwnPerformanceSnapshotShape. `total_interactions` (snake_case, tal como
 * lo devuelve el lector real) se traduce a `totalInteractions` — es el
 * único cambio de nombre; el valor nunca se transforma. `impressions`
 * nunca se solicita ni se mapea (confirmado no soportado por Meta desde
 * v22.0+, ver Fase de integración de Instagram).
 */
export function mapInstagramInsightsToSnapshot(insights, platformMediaId) {
  if (!platformMediaId) throw new Error('mapInstagramInsightsToSnapshot: se requiere "platformMediaId" real.');
  return Object.freeze({
    platform: 'instagram',
    platformMediaId,
    reach: insights?.reach ?? null,
    views: insights?.views ?? null,
    likes: insights?.likes ?? null,
    comments: insights?.comments ?? null,
    saved: insights?.saved ?? null,
    shares: insights?.shares ?? null,
    totalInteractions: insights?.total_interactions ?? null,
    capturedAt: new Date().toISOString(),
  });
}

export class InstagramOwnPerformanceSource extends OwnPerformanceSource {
  constructor(overrides = {}) {
    super();
    this._overrides = overrides; // fetchImpl / accessToken / igUserId / apiVersion — pasados tal cual a los lectores reales, nunca leídos ni impresos aquí.
  }

  get name() {
    return 'instagram_own_performance_source';
  }

  /** Identidad de la cuenta — contexto, no una entidad de traceability por sí sola (mismo criterio ya documentado en Fase de integración de Instagram). */
  async fetchAccount() {
    return obtenerCuentaInstagram(this._overrides);
  }

  /** Lista PublishedContentRef reales — nunca inventa un media id. */
  async fetchPublishedContent({ limit = 25 } = {}) {
    const posts = await listarPublicaciones({ limit, ...this._overrides });
    const refs = [];
    for (const post of posts) {
      const media = await obtenerMedia(post.id, this._overrides);
      refs.push(mapInstagramMediaToPublishedContentRef(media));
    }
    return refs;
  }

  /**
   * @param {{ platformMediaId: string }} query
   * @returns {Promise<object[]>} siempre un arreglo de 1 PerformanceSnapshot — forma exigida por OwnPerformanceSource.
   */
  async fetchPerformance({ platformMediaId } = {}) {
    if (!platformMediaId?.trim()) {
      throw new Error('InstagramOwnPerformanceSource.fetchPerformance: se requiere "platformMediaId" real — nunca se consulta sin un id de Instagram real.');
    }
    const insights = await obtenerInsightsDePublicacion(platformMediaId, this._overrides);
    return [mapInstagramInsightsToSnapshot(insights, platformMediaId)];
  }
}
