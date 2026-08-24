// instagramMediaReader.js — lectura de solo lectura de los campos básicos
// de un media específico de Instagram (GET /{media-id}). Reutiliza
// resolveInstagramConfig() sin modificarlo. Mismo principio que el resto
// del proyecto: si Meta no devuelve un campo para ese tipo de media (ej.
// thumbnail_url en una imagen simple), se representa como `null`, nunca se
// omite en silencio ni se rellena con un valor inventado.

import { resolveInstagramConfig } from './instagramConfig.js';

/** Nunca deja escapar el access token real hacia un mensaje de error. */
function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

/**
 * GET /{media-id} — campos básicos de una publicación.
 * @param {string} mediaId - id real de un media de Instagram, nunca inventado.
 * @param {{fetchImpl?: typeof fetch} & Partial<ReturnType<typeof resolveInstagramConfig>>} [overrides]
 */
export async function obtenerMedia(mediaId, overrides = {}) {
  if (!mediaId) throw new Error('obtenerMedia: se requiere un mediaId real — nunca se asume ni se inventa uno.');

  const config = resolveInstagramConfig(overrides);
  if (!config.accessToken) {
    throw new Error(
      'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta INSTAGRAM_ACCESS_TOKEN (variable de entorno). ' +
        'No se intentó ninguna llamada de red.'
    );
  }
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const campos = 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url';
  const url = `https://graph.facebook.com/${config.apiVersion}/${mediaId}?fields=${campos}&access_token=${config.accessToken}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (networkError) {
    throw new Error(`obtenerMedia: fallo de red — ${redactToken(networkError.message, config.accessToken)}`);
  }
  const body = await response.json();
  if (!response.ok) {
    const message = redactToken(body?.error?.message ?? `HTTP ${response.status}`, config.accessToken);
    throw new Error(`obtenerMedia: la API respondió ${response.status}: ${message}`);
  }

  return {
    id: body.id ?? null,
    caption: body.caption ?? null,
    mediaType: body.media_type ?? null,
    mediaUrl: body.media_url ?? null,
    permalink: body.permalink ?? null,
    timestamp: body.timestamp ?? null,
    thumbnailUrl: body.thumbnail_url ?? null,
  };
}
