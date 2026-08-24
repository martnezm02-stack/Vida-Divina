// facebookAdapter.js — Bloque 3, adapter real de Meta (Facebook Page Graph
// API). Distinto de metaAdapter.js (Instagram): una Página de Facebook se
// publica con un Page Access Token propio (POST /{page-id}/photos ó
// /{page-id}/videos), no con el mismo token/cuenta de Instagram -- por eso
// es un adapter separado, no una reutilización directa de MetaAdapter,
// aunque comparte el mismo patrón de credenciales-solo-por-entorno y el
// mismo `fetch` nativo sin dependencias nuevas.
//
// Ninguna de las variables de entorno reconocidas aquí (FACEBOOK_PAGE_ID,
// FACEBOOK_PAGE_ACCESS_TOKEN) está configurada en este repositorio -- por
// lo tanto este adapter, ejecutado en este entorno, SIEMPRE devuelve
// CONFIGURATION_REQUIRED antes de tocar la red, igual que MetaAdapter.

import { PublishingAdapter, createPublishResult } from './publishingContract.js';

const DEFAULT_API_VERSION = 'v21.0';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

function extractExt(path) {
  const m = /\.[a-z0-9]+$/i.exec(path ?? '');
  return m ? m[0].toLowerCase() : '';
}

function redact(text, token) {
  if (typeof text !== 'string' || !token) return text;
  return text.split(token).join('[REDACTED]');
}

export function resolveFacebookConfig(overrides = {}) {
  return {
    pageId: overrides.pageId ?? process.env.FACEBOOK_PAGE_ID ?? null,
    pageAccessToken: overrides.pageAccessToken ?? process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? null,
    apiVersion: overrides.apiVersion ?? process.env.FACEBOOK_GRAPH_API_VERSION ?? DEFAULT_API_VERSION,
  };
}

export class FacebookAdapter extends PublishingAdapter {
  constructor(overrides = {}) {
    super();
    const config = resolveFacebookConfig(overrides);
    this._pageId = config.pageId;
    this._pageAccessToken = config.pageAccessToken;
    this._apiVersion = config.apiVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
  }

  get platform() {
    return 'FACEBOOK';
  }

  isConfigured() {
    return Boolean(this._pageId && this._pageAccessToken);
  }

  /** CAROUSEL no tiene equivalente nativo de "un solo post" en la API estándar de fotos/videos de Página -- se publican como álbum (varias fotos referenciando el mismo `attached_media`, Graph API real) cuando esté configurado; DEFERRED explícito si no hay caso de uso confirmado. Aquí, sin credenciales configuradas, siempre CONFIGURATION_REQUIRED. */
  async publish(assetPackage, destination, metadata = {}) {
    if (!this.isConfigured()) {
      return createPublishResult({
        platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: [],
        detail: 'Falta FACEBOOK_PAGE_ID y/o FACEBOOK_PAGE_ACCESS_TOKEN (variables de entorno) — ninguna llamada de red fue intentada.',
      });
    }
    if (assetPackage.assetPackageType === 'CAROUSEL') {
      return createPublishResult({
        platform: this.platform, status: 'FAILED', assetIds: (assetPackage.assetPackage?.assets ?? []).map((a) => a.assetId),
        error: 'facebookAdapter: publicación de carrusel como álbum de Página no está implementada en esta fase (DEFERRED) — publicar cada slide individualmente, o usar Instagram (metaAdapter.js) que sí soporta CAROUSEL real.',
      });
    }

    const outputAsset = assetPackage.outputAssets?.[0];
    if (!outputAsset) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [], error: 'facebookAdapter: el Final Asset Package no tiene ningún outputAsset real que publicar.' });
    }
    const mediaUrl = metadata.mediaUrl;
    if (!mediaUrl?.startsWith('https://')) {
      return createPublishResult({
        platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: [outputAsset.assetId],
        detail: 'metadata.mediaUrl ausente o no es una URL https pública — la API de Página exige el medio ya alojado públicamente.',
      });
    }

    const esVideo = VIDEO_EXTENSIONS.has(extractExt(outputAsset.path));
    const base = `https://graph.facebook.com/${this._apiVersion}/${this._pageId}`;
    const endpoint = esVideo ? `${base}/videos` : `${base}/photos`;
    const body = esVideo
      ? { file_url: mediaUrl, description: metadata.caption ?? '', access_token: this._pageAccessToken }
      : { url: mediaUrl, caption: metadata.caption ?? '', access_token: this._pageAccessToken };

    let resp;
    try {
      resp = await this._fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (networkError) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: `fallo de red: ${redact(networkError.message, this._pageAccessToken)}` });
    }
    const cuerpo = await resp.json().catch(() => null);
    if (!resp.ok) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [outputAsset.assetId], error: redact(cuerpo?.error?.message ?? `HTTP ${resp.status}`, this._pageAccessToken) });
    }
    return createPublishResult({ platform: this.platform, status: 'PUBLISHED', assetIds: [outputAsset.assetId], externalId: cuerpo.id ?? cuerpo.post_id ?? null });
  }
}
