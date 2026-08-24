// instagramInsightsReader.js — lectura de solo lectura de Instagram
// Insights para un media específico (GET /{media-id}/insights).
// Deliberadamente independiente de instagramPerformanceSource.js (no lo
// modifica, no comparte su vocabulario de métricas) — ese archivo sirve al
// contrato de performance-learning-intelligence (Fase 12), que no incluye
// `reach` ni `total_interactions`. Este archivo expone exactamente las 7
// métricas confirmadas por el propietario en Graph API Explorer.
//
// `impressions` NUNCA se solicita — el propietario confirmó (OAuthException
// 100, Graph API Explorer) que ya no está soportada desde v22.0 en
// adelante. No es una suposición de este código.

import { resolveInstagramConfig } from './instagramConfig.js';

/** Nunca deja escapar el access token real hacia un mensaje de error. */
function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

const METRICAS = Object.freeze(['reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'views']);

/**
 * GET /{media-id}/insights — reach, likes, comments, saved, shares,
 * total_interactions, views. Nunca solicita `impressions`.
 * @param {string} mediaId - id real de un media de Instagram, nunca inventado.
 * @param {{fetchImpl?: typeof fetch} & Partial<ReturnType<typeof resolveInstagramConfig>>} [overrides]
 */
export async function obtenerInsightsDePublicacion(mediaId, overrides = {}) {
  if (!mediaId) throw new Error('obtenerInsightsDePublicacion: se requiere un mediaId real — nunca se asume ni se inventa uno.');

  const config = resolveInstagramConfig(overrides);
  if (!config.accessToken) {
    throw new Error(
      'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta INSTAGRAM_ACCESS_TOKEN (variable de entorno). ' +
        'No se intentó ninguna llamada de red.'
    );
  }
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const url = `https://graph.facebook.com/${config.apiVersion}/${mediaId}/insights?metric=${METRICAS.join(',')}&access_token=${config.accessToken}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (networkError) {
    throw new Error(`obtenerInsightsDePublicacion: fallo de red — ${redactToken(networkError.message, config.accessToken)}`);
  }
  const body = await response.json();
  if (!response.ok) {
    const message = redactToken(body?.error?.message ?? `HTTP ${response.status}`, config.accessToken);
    throw new Error(`obtenerInsightsDePublicacion: la API respondió ${response.status}: ${message}`);
  }

  const porNombre = new Map((body.data ?? []).map((entrada) => [entrada.name, entrada.values?.[0]?.value ?? null]));

  const resultado = { mediaId };
  for (const metrica of METRICAS) {
    const valor = porNombre.get(metrica);
    resultado[metrica] = typeof valor === 'number' ? valor : null;
  }
  return resultado;
}
