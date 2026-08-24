// instagramAccountReader.js — lectura de solo lectura de la cuenta de
// Instagram y su lista de publicaciones. Reutiliza resolveInstagramConfig()
// de instagramConfig.js (sin modificarlo) — mismo patrón de credenciales
// que instagramPublicationAdapter.js/instagramPerformanceSource.js: si
// falta INSTAGRAM_ACCESS_TOKEN o INSTAGRAM_IG_USER_ID, se lanza un error
// explícito ANTES de intentar cualquier llamada de red, nunca se continúa
// con un valor vacío ni se inventa una respuesta.
//
// Solo lectura: ninguna función de este archivo escribe, publica ni
// modifica nada en Meta — únicamente GET.

import { resolveInstagramConfig } from './instagramConfig.js';

/** Nunca deja escapar el access token real hacia un mensaje de error, incluso si Meta lo hiciera eco. */
function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

function requireCredenciales(config) {
  if (!config.accessToken || !config.igUserId) {
    throw new Error(
      'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta INSTAGRAM_ACCESS_TOKEN y/o INSTAGRAM_IG_USER_ID ' +
        '(variables de entorno, ver content-strategy/.env.example). No se intentó ninguna llamada de red.'
    );
  }
}

/**
 * GET /{ig-user-id} — perfil básico de la cuenta profesional de Instagram.
 * @param {{fetchImpl?: typeof fetch} & Partial<ReturnType<typeof resolveInstagramConfig>>} [overrides]
 */
export async function obtenerCuentaInstagram(overrides = {}) {
  const config = resolveInstagramConfig(overrides);
  requireCredenciales(config);
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const campos = 'id,username,name,biography,followers_count,media_count';
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.igUserId}?fields=${campos}&access_token=${config.accessToken}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (networkError) {
    throw new Error(`obtenerCuentaInstagram: fallo de red — ${redactToken(networkError.message, config.accessToken)}`);
  }
  const body = await response.json();
  if (!response.ok) {
    const message = redactToken(body?.error?.message ?? `HTTP ${response.status}`, config.accessToken);
    throw new Error(`obtenerCuentaInstagram: la API respondió ${response.status}: ${message}`);
  }

  return {
    id: body.id ?? null,
    username: body.username ?? null,
    name: body.name ?? null,
    biography: body.biography ?? null,
    followersCount: typeof body.followers_count === 'number' ? body.followers_count : null,
    mediaCount: typeof body.media_count === 'number' ? body.media_count : null,
  };
}

/**
 * GET /{ig-user-id}/media — lista de publicaciones, con paginación real de
 * Graph API (sigue `paging.next` hasta agotar `limit` o las páginas
 * disponibles). Devuelve solo ids — el detalle de cada media se obtiene con
 * instagramMediaReader.js (responsabilidad separada, mismo criterio que el
 * resto del proyecto: un archivo, una responsabilidad).
 * @param {{limit?: number, fetchImpl?: typeof fetch} & Partial<ReturnType<typeof resolveInstagramConfig>>} [overrides]
 */
export async function listarPublicaciones(overrides = {}) {
  const { limit = 25, ...configOverrides } = overrides;
  const config = resolveInstagramConfig(configOverrides);
  requireCredenciales(config);
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const ids = [];
  let url = `https://graph.facebook.com/${config.apiVersion}/${config.igUserId}/media?fields=id&limit=${Math.min(limit, 100)}&access_token=${config.accessToken}`;

  while (url && ids.length < limit) {
    let response;
    try {
      response = await fetchImpl(url);
    } catch (networkError) {
      throw new Error(`listarPublicaciones: fallo de red — ${redactToken(networkError.message, config.accessToken)}`);
    }
    const body = await response.json();
    if (!response.ok) {
      const message = redactToken(body?.error?.message ?? `HTTP ${response.status}`, config.accessToken);
      throw new Error(`listarPublicaciones: la API respondió ${response.status}: ${message}`);
    }
    for (const item of body.data ?? []) {
      if (item?.id) ids.push(item.id);
      if (ids.length >= limit) break;
    }
    url = ids.length < limit ? (body.paging?.next ?? null) : null;
  }

  return ids.slice(0, limit).map((id) => ({ id }));
}
