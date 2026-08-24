// facebookPerformanceSource.js — Performance Intelligence, Fase 1. Segundo
// PerformanceSource REAL (detrás de PerformanceSource,
// performance-learning-intelligence, Fase 12, sin modificarlo) — mismo
// criterio que InstagramPerformanceSource (content-strategy, Fase 19).
//
// Reutiliza resolveFacebookConfig() de
// content-orchestrator/src/publishing/facebookAdapter.js TAL CUAL — no se
// duplica lógica de autenticación (mismo Page Access Token que ya publica
// contenido real en esa Página).
//
// Mapeo de disponibilidad verificado EN VIVO contra un post real de Página
// (122109854133422530, Graph API v21.0 servido como v26.0 el
// 2026-08-20) — no se asume nada de la documentación sin confirmarlo:
//   - likes    → AVAILABLE, edge GET /{post-id}/likes?summary=total_count
//                (edge "reactions" devuelve "Tried accessing nonexisting
//                field (reactions)" con este token/versión — no usar).
//   - comments → AVAILABLE, field GET /{post-id}?fields=comments.summary(true)
//   - clicks   → AVAILABLE, insights metric "post_clicks" (nombre válido,
//                confirmado por respuesta 200 con data:[] en vez de error).
//   - views    → AVAILABLE (solo video), insights metric "post_video_views"
//                (nombre válido; en fotos no aplica — Meta no devuelve el
//                campo, se normaliza igual a NOT_AVAILABLE, nunca 0).
//   - watch_time_seconds → AVAILABLE (solo video), insights metric
//                "post_video_avg_time_watched" (nombre válido confirmado).
//   - shares   → NOT_AVAILABLE. Graph OMITE el campo "shares" por completo
//                cuando el conteo es 0 ("Tried accessing nonexisting field
//                (shares)") — un comportamiento no documentado oficialmente
//                y distinto de un share=0 confirmado. Interpretar esa
//                ausencia como 0 sería inventar un valor, así que se
//                mantiene NOT_AVAILABLE siempre, incluso cuando la causa
//                real probablemente sea "cero shares".
//   - saves / completion_rate / retention_rate → NOT_AVAILABLE. Ninguna
//                de las tres tiene un metric/field equivalente confirmado
//                para publicaciones de Página en esta auditoría — Facebook
//                no expone un concepto de "guardado" a nivel de Page post
//                Insights (a diferencia de Instagram).
//
// Dos mecanismos de Graph distintos por metrica: "object fields" (likes,
// comments) vs. "insights edge" (clicks, views, watch_time_seconds) — se
// resuelven con dos llamadas de red separadas, nunca mezcladas en una.

import { PerformanceSource } from '../../performance-learning-intelligence/src/performanceSource.js';
import { createPerformanceObservation, ALLOWED_METRICS, NOT_AVAILABLE } from '../../performance-learning-intelligence/src/performanceObservation.js';
import { resolveFacebookConfig } from '../../content-orchestrator/src/publishing/facebookAdapter.js';

export const METRIC_AVAILABILITY = Object.freeze({
  likes: 'AVAILABLE',
  comments: 'AVAILABLE',
  clicks: 'AVAILABLE',
  views: 'AVAILABLE',
  watch_time_seconds: 'AVAILABLE',
  shares: 'NOT_AVAILABLE',
  saves: 'NOT_AVAILABLE',
  completion_rate: 'NOT_AVAILABLE',
  retention_rate: 'NOT_AVAILABLE',
  reach: 'NOT_AVAILABLE', // sin metric/field equivalente confirmado para Page posts en esta auditoría
  impressions: 'NOT_AVAILABLE', // post_impressions confirmada deprecada (ver auditoría en vivo, cabecera de este archivo)
});

const INSIGHTS_METRIC_FIELD = Object.freeze({
  clicks: 'post_clicks',
  views: 'post_video_views',
  watch_time_seconds: 'post_video_avg_time_watched',
});

function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

export class FacebookPerformanceSource extends PerformanceSource {
  constructor(overrides = {}) {
    super();
    const config = resolveFacebookConfig(overrides);
    this._pageAccessToken = config.pageAccessToken;
    this._apiVersion = config.apiVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
  }

  get name() {
    return 'facebook_graph_api_page_post';
  }

  /**
   * query = { externalPostId } — el external_post_id/external_content_id
   * REAL de un PublishedContent ya existente, nunca un id inventado.
   */
  async fetch(query = {}) {
    const { externalPostId } = query;
    if (!externalPostId) {
      throw new Error('FacebookPerformanceSource: se requiere "externalPostId" real de un PublishedContent ya publicado — nunca se inventa un id.');
    }
    if (!this._pageAccessToken) {
      throw new Error(
        'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta FACEBOOK_PAGE_ACCESS_TOKEN (variable de entorno). ' +
        'No se ha intentado ninguna llamada de red desde este archivo.'
      );
    }

    const result = {};
    for (const metric of ALLOWED_METRICS) result[metric] = NOT_AVAILABLE;

    const [fieldsData, insightsData] = await Promise.all([
      this._fetchFields(externalPostId),
      this._fetchInsights(externalPostId),
    ]);

    if (typeof fieldsData.likes === 'number') result.likes = fieldsData.likes;
    if (typeof fieldsData.comments === 'number') result.comments = fieldsData.comments;
    for (const [metric, value] of Object.entries(insightsData)) {
      if (typeof value === 'number') result[metric] = value;
    }
    return result;
  }

  async _fetchFields(externalPostId) {
    const url = `https://graph.facebook.com/${this._apiVersion}/${externalPostId}?fields=likes.summary(true),comments.summary(true)&access_token=${this._pageAccessToken}`;
    let response;
    try {
      response = await this._fetch(url);
    } catch (networkError) {
      throw new Error(`FacebookPerformanceSource: fallo de red al leer likes/comments — ${redactToken(networkError.message, this._pageAccessToken)}`);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // "Tried accessing nonexisting field (likes)"/"(comments)" es un caso
      // real observado en cuentas sin esos edges habilitados — se trata
      // como ausencia (NOT_AVAILABLE aguas arriba), nunca como fallo fatal
      // de toda la recolección (§ manejo de errores, Fase 5).
      return {};
    }
    return {
      likes: body?.likes?.summary?.total_count ?? null,
      comments: body?.comments?.summary?.total_count ?? null,
    };
  }

  async _fetchInsights(externalPostId) {
    const metricNames = Object.values(INSIGHTS_METRIC_FIELD).join(',');
    const url = `https://graph.facebook.com/${this._apiVersion}/${externalPostId}/insights?metric=${metricNames}&access_token=${this._pageAccessToken}`;
    let response;
    try {
      response = await this._fetch(url);
    } catch (networkError) {
      throw new Error(`FacebookPerformanceSource: fallo de red al leer insights — ${redactToken(networkError.message, this._pageAccessToken)}`);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) return {};

    const byField = new Map((body?.data ?? []).map((entry) => [entry.name, entry.values?.[0]?.value]));
    const out = {};
    for (const [metric, graphField] of Object.entries(INSIGHTS_METRIC_FIELD)) {
      const value = byField.get(graphField);
      if (typeof value === 'number') out[metric] = value;
    }
    return out;
  }
}

/** Misma forma que collectPlatformPerformanceObservations() de instagramPerformanceSource.js — deliberadamente independiente (ver nota de cabecera de ese archivo: source distinto nunca comparte implementación). */
export async function collectFacebookPerformanceObservations({ publishedContent, source, observedAt = new Date().toISOString() }) {
  const metrics = await source.fetch({ externalPostId: publishedContent.external_post_id });
  const observations = [];
  for (const [metric, value] of Object.entries(metrics)) {
    observations.push(createPerformanceObservation({
      content_id: publishedContent.content_id,
      platform: publishedContent.platform,
      metric,
      value,
      observed_at: observedAt,
      confidence: value === NOT_AVAILABLE ? 0 : 0.9,
      confidence_basis: value === NOT_AVAILABLE
        ? `Métrica "${metric}" clasificada ${METRIC_AVAILABILITY[metric]} en la auditoría en vivo de Performance Intelligence Fase 1 — nunca se infiere un valor.`
        : `Dato real de ${source.name} (Facebook Page Post Insights/Fields).`,
      source: 'platform_observed',
    }));
  }
  return observations;
}
