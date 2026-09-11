// metaAdapter.js — Bloque 3, adapter real de Meta (Instagram Graph API).
// Reutiliza SIN reimplementar: resolveInstagramConfig() de
// content-strategy/src/instagramConfig.js (misma fuente de credenciales,
// mismo patrón "solo variable de entorno, nunca inventada aquí") -- no se
// duplica un segundo instagramConfig.js. La mecánica de Graph API
// (crear contenedor -> publicar contenedor) sigue el mismo patrón real ya
// validado en content-strategy/src/instagramPublicationAdapter.js, adaptada
// al Final Asset Package de content-orchestrator (que no pasa por el
// ContentItem/HumanReviewRecord de content-strategy -- ver
// publishingContract.js).
//
// MEDIA HOSTING: Meta exige que el medio esté en una URL pública (https) en
// el momento de publicar. Este adapter NO aloja archivos -- exige
// `metadata.mediaUrl` (single) o `metadata.mediaUrls` (carousel, un array
// alineado 1:1 con assetPackage.assetPackage.assets) ya públicas. Sin ellas,
// CONFIGURATION_REQUIRED explícito, sin tocar la red -- alojar el archivo
// real es responsabilidad de un módulo futuro (fuera de alcance, mismo
// límite ya documentado en instagramPublicationAdapter.js).
//
// NUNCA se intenta una llamada real sin INSTAGRAM_ACCESS_TOKEN e
// INSTAGRAM_IG_USER_ID configurados -- en este repositorio, hoy, no lo
// están, por lo tanto este adapter SIEMPRE devuelve CONFIGURATION_REQUIRED
// en este entorno, exactamente igual que instagramPublicationAdapter.js.
//
// PROCESAMIENTO ASÍNCRONO DE VIDEO/REELS (bug real diagnosticado
// 2026-09-11, "Media ID is not available"): a diferencia de una imagen
// (contenedor listo de inmediato), Meta procesa un video_url de forma
// asíncrona -- confirmado con una llamada real: un contenedor REELS recién
// creado reporta status_code "IN_PROGRESS" durante 25s+ ("Media is still
// being processed"). Publicar (media_publish) contra un creation_id que
// todavía está IN_PROGRESS es exactamente lo que produce el error real de
// Meta "Media ID is not available". Por eso, solo para video, se espera
// status_code "FINISHED" (polling real a GET /{container-id}?fields=
// status_code) antes de publicar -- una imagen no lo necesita y sigue
// publicando de inmediato, igual que antes.

import { resolveInstagramConfig } from '../../../content-strategy/src/instagramConfig.js';
import { PublishingAdapter, createPublishResult } from './publishingContract.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLL_ATTEMPTS = 40; // 40 * 5s = 200s, techo real recomendado por Meta para Reels.

function redact(text, token) {
  if (typeof text !== 'string' || !token) return text;
  return text.split(token).join('[REDACTED]');
}

function extractExt(path) {
  const m = /\.[a-z0-9]+$/i.exec(path ?? '');
  return m ? m[0].toLowerCase() : '';
}

export class MetaAdapter extends PublishingAdapter {
  constructor(overrides = {}) {
    super();
    const config = resolveInstagramConfig(overrides);
    this._accessToken = config.accessToken;
    this._igUserId = config.igUserId;
    this._apiVersion = config.apiVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
    this._pollIntervalMs = overrides.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this._maxPollAttempts = overrides.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    this._sleep = overrides.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get platform() {
    return 'INSTAGRAM';
  }

  isConfigured() {
    return Boolean(this._accessToken && this._igUserId);
  }

  async _crearContenedor(body) {
    const base = `https://graph.facebook.com/${this._apiVersion}/${this._igUserId}`;
    const resp = await this._fetch(`${base}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: this._accessToken }),
    });
    const cuerpo = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, cuerpo };
  }

  /**
   * Solo para video/REELS: Meta procesa el video_url de forma asíncrona --
   * espera status_code "FINISHED" antes de intentar media_publish (ver nota
   * de cabecera). "ERROR" real de Meta corta de inmediato, nunca reintenta
   * contra un contenedor que Meta ya marcó como fallido. Si se agota
   * maxPollAttempts sin FINISHED/ERROR, se trata como fallo explícito --
   * nunca se llama media_publish "a ciegas" sobre un contenedor que nunca
   * confirmó estar listo.
   */
  async _esperarContenedorListo(containerId) {
    const base = `https://graph.facebook.com/${this._apiVersion}/${containerId}`;
    for (let intento = 0; intento < this._maxPollAttempts; intento++) {
      if (intento > 0) await this._sleep(this._pollIntervalMs);
      let resp;
      try {
        resp = await this._fetch(`${base}?fields=status_code&access_token=${this._accessToken}`);
      } catch (networkError) {
        return { ok: false, error: `fallo de red consultando status_code del contenedor: ${redact(networkError.message, this._accessToken)}` };
      }
      const cuerpo = await resp.json().catch(() => null);
      if (!resp.ok) {
        return { ok: false, error: redact(cuerpo?.error?.message ?? `HTTP ${resp.status}`, this._accessToken) };
      }
      if (cuerpo?.status_code === 'FINISHED') return { ok: true };
      if (cuerpo?.status_code === 'ERROR') {
        return { ok: false, error: `Meta reportó el contenedor como ERROR durante el procesamiento (status_code=ERROR)${cuerpo?.status ? `: ${cuerpo.status}` : ''}.` };
      }
      // IN_PROGRESS (u otro estado transitorio real) -- sigue esperando.
    }
    return { ok: false, error: `el contenedor real de Meta no terminó de procesarse (status_code) tras ${this._maxPollAttempts} intentos -- nunca se llamó media_publish sobre un contenedor sin confirmar "FINISHED".` };
  }

  async _publicarContenedor(creationId) {
    const base = `https://graph.facebook.com/${this._apiVersion}/${this._igUserId}`;
    const resp = await this._fetch(`${base}/media_publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: this._accessToken }),
    });
    const cuerpo = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, cuerpo };
  }

  /**
   * @param {object} assetPackage — Final Asset Package real (content-orchestrator/src/contentGenerationEngine.js).
   * @param {?string} destination — no usado por Instagram (la cuenta ya la fija igUserId); se conserva por forma del contrato.
   * @param {{mediaUrl?:string, mediaUrls?:string[], caption?:string}} metadata
   */
  async publish(assetPackage, destination, metadata = {}) {
    if (!this.isConfigured()) {
      return createPublishResult({
        platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: [],
        detail: 'Falta INSTAGRAM_ACCESS_TOKEN y/o INSTAGRAM_IG_USER_ID (variables de entorno) — ninguna llamada de red fue intentada.',
      });
    }

    const caption = metadata.caption ?? '';
    const isCarousel = assetPackage.assetPackageType === 'CAROUSEL';

    if (isCarousel) {
      const assets = assetPackage.assetPackage?.assets ?? [];
      const mediaUrls = metadata.mediaUrls ?? [];
      if (assets.length === 0 || mediaUrls.length !== assets.length || mediaUrls.some((u) => !u?.startsWith('https://'))) {
        return createPublishResult({
          platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: assets.map((a) => a.assetId),
          detail: `metadata.mediaUrls debe tener exactamente ${assets.length} URL(s) https públicas, alineadas 1:1 con assetPackage.assetPackage.assets — Instagram exige el medio ya alojado públicamente.`,
        });
      }

      const childIds = [];
      for (const url of mediaUrls) {
        let container;
        try {
          container = await this._crearContenedor({ image_url: url, is_carousel_item: true });
        } catch (networkError) {
          return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: `fallo de red creando item de carrusel: ${redact(networkError.message, this._accessToken)}` });
        }
        if (!container.ok) {
          return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: redact(container.cuerpo?.error?.message ?? `HTTP ${container.status}`, this._accessToken) });
        }
        childIds.push(container.cuerpo.id);
      }

      let parent;
      try {
        parent = await this._crearContenedor({ media_type: 'CAROUSEL', children: childIds, caption });
      } catch (networkError) {
        return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: `fallo de red creando contenedor de carrusel: ${redact(networkError.message, this._accessToken)}` });
      }
      if (!parent.ok) {
        return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: redact(parent.cuerpo?.error?.message ?? `HTTP ${parent.status}`, this._accessToken) });
      }

      let published;
      try {
        published = await this._publicarContenedor(parent.cuerpo.id);
      } catch (networkError) {
        return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: `fallo de red publicando carrusel: ${redact(networkError.message, this._accessToken)}` });
      }
      if (!published.ok) {
        return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: assets.map((a) => a.assetId), error: redact(published.cuerpo?.error?.message ?? `HTTP ${published.status}`, this._accessToken) });
      }
      return createPublishResult({ platform: this.platform, status: 'PUBLISHED', assetIds: assets.map((a) => a.assetId), externalId: published.cuerpo.id });
    }

    // SINGLE: video (REELS) o imagen.
    const outputAsset = assetPackage.outputAssets?.[0];
    if (!outputAsset) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [], error: 'metaAdapter: el Final Asset Package no tiene ningún outputAsset real que publicar.' });
    }
    const mediaUrl = metadata.mediaUrl;
    if (!mediaUrl?.startsWith('https://')) {
      return createPublishResult({
        platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: [outputAsset.assetId],
        detail: 'metadata.mediaUrl ausente o no es una URL https pública — Instagram exige el medio ya alojado públicamente antes de publicar (este proyecto no incluye media hosting).',
      });
    }

    const esVideo = VIDEO_EXTENSIONS.has(extractExt(outputAsset.path));
    let container;
    try {
      container = await this._crearContenedor(esVideo ? { media_type: 'REELS', video_url: mediaUrl, caption } : { image_url: mediaUrl, caption });
    } catch (networkError) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: `fallo de red: ${redact(networkError.message, this._accessToken)}` });
    }
    if (!container.ok) {
      const message = redact(container.cuerpo?.error?.message ?? `HTTP ${container.status}`, this._accessToken);
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: message });
    }

    if (esVideo) {
      const listo = await this._esperarContenedorListo(container.cuerpo.id);
      if (!listo.ok) {
        return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: listo.error });
      }
    }

    let published;
    try {
      published = await this._publicarContenedor(container.cuerpo.id);
    } catch (networkError) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: `fallo de red: ${redact(networkError.message, this._accessToken)}` });
    }
    if (!published.ok) {
      const message = redact(published.cuerpo?.error?.message ?? `HTTP ${published.status}`, this._accessToken);
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: message });
    }

    return createPublishResult({ platform: this.platform, status: 'PUBLISHED', assetIds: [outputAsset.assetId], externalId: published.cuerpo.id });
  }
}
