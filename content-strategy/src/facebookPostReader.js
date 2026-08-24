// facebookPostReader.js — lectura de solo lectura de los campos básicos de
// un post real de la Página (GET /{post-id}). Mismo patrón que
// instagramMediaReader.js (Fase 19): reutiliza resolveFacebookConfig() sin
// modificarlo, nunca rellena un campo ausente con un valor inventado.
//
// Auditado en vivo (2026-08-20) contra un post real de la Página: "message"
// no está disponible con este token/versión ("Tried accessing nonexisting
// field (message)") — no se pide aquí, para no convertir un error de campo
// individual en un fallo de toda la lectura. Solo se piden campos
// confirmados: id, created_time.

import { resolveFacebookConfig } from './../../content-orchestrator/src/publishing/facebookAdapter.js';

function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

/**
 * GET /{post-id} — campos básicos de un post real de Página.
 * @param {string} postId - id real de un post de Facebook, nunca inventado.
 */
export async function obtenerPost(postId, overrides = {}) {
  if (!postId) throw new Error('obtenerPost: se requiere un postId real — nunca se asume ni se inventa uno.');

  const config = resolveFacebookConfig(overrides);
  if (!config.pageAccessToken) {
    throw new Error(
      'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta FACEBOOK_PAGE_ACCESS_TOKEN (variable de entorno). ' +
        'No se intentó ninguna llamada de red.'
    );
  }
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const url = `https://graph.facebook.com/${config.apiVersion}/${postId}?fields=id,created_time&access_token=${config.pageAccessToken}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (networkError) {
    throw new Error(`obtenerPost: fallo de red — ${redactToken(networkError.message, config.pageAccessToken)}`);
  }
  const body = await response.json();
  if (!response.ok) {
    const message = redactToken(body?.error?.message ?? `HTTP ${response.status}`, config.pageAccessToken);
    throw new Error(`obtenerPost: la API respondió ${response.status}: ${message}`);
  }

  return {
    id: body.id ?? null,
    createdTime: body.created_time ?? null,
  };
}
