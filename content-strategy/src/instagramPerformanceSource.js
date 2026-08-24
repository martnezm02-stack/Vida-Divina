// instagramPerformanceSource.js — Fase 19, §6. Primer PerformanceSource REAL
// (detrás de PerformanceSource, performance-learning-intelligence, Fase 12,
// sin modificarlo — mismo criterio que MockPerformanceSource, Fase 17).
//
// Mapeo de disponibilidad basado ESTRICTAMENTE en la auditoría oficial de
// Fase 18 (§8, developers.facebook.com/docs/instagram-platform/insights/):
//   views, likes, comments, saved, shares → AVAILABLE (Instagram Insights)
//   clicks                                 → UNKNOWN (no confirmado en la doc oficial auditada)
//   watch_time_seconds/completion_rate/retention_rate → NOT_AVAILABLE (no encontrados en Reels insights)
//
// Nota de diseño: el contrato PerformanceObservation (Fase 12) solo admite
// un número real u el sentinel NOT_AVAILABLE — no existe un tercer valor de
// cable para "UNKNOWN". Por eso, a nivel de OBSERVACIÓN, tanto NOT_AVAILABLE
// como UNKNOWN colapsan al mismo sentinel NOT_AVAILABLE (nunca se inventa un
// número); la distinción AVAILABLE/NOT_AVAILABLE/UNKNOWN de la Fase 18 vive
// únicamente en METRIC_AVAILABILITY (capa de documentación/configuración de
// este archivo), no en el dato final — esto no es una contradicción de
// contratos, son dos capas distintas.
//
// collectPlatformPerformanceObservations() es una función DELIBERADAMENTE
// independiente de collectMockPerformanceObservations() (mockPerformanceSource.js,
// Fase 17) aunque su forma sea casi idéntica — mismo criterio ya establecido
// en el proyecto (RawStore/WebsiteRawStore/etc.): la diferencia real
// (source:"platform_observed" vs "synthetic_fixture") es precisamente el
// dato que nunca debe poder mezclarse por accidente si ambas funciones
// compartieran una sola implementación parametrizada.

import { PerformanceSource } from '../../performance-learning-intelligence/src/performanceSource.js';
import { createPerformanceObservation, ALLOWED_METRICS, NOT_AVAILABLE } from '../../performance-learning-intelligence/src/performanceObservation.js';
import { resolveInstagramConfig } from './instagramConfig.js';

/** Fase 18 §8 — clasificación oficial, nunca inferida por este código. */
export const METRIC_AVAILABILITY = Object.freeze({
  views: 'AVAILABLE',
  likes: 'AVAILABLE',
  comments: 'AVAILABLE',
  saves: 'AVAILABLE',
  shares: 'AVAILABLE',
  clicks: 'UNKNOWN',
  watch_time_seconds: 'NOT_AVAILABLE',
  completion_rate: 'NOT_AVAILABLE',
  retention_rate: 'NOT_AVAILABLE',
  reach: 'NOT_AVAILABLE', // no confirmada en la auditoría de Fase 18 — nunca se asume
  impressions: 'NOT_AVAILABLE', // confirmada deprecada desde v22.0 (nota de instagramConfig.js)
});

// Nombre del campo de Instagram Graph API Insights por métrica interna (solo para las AVAILABLE).
const GRAPH_INSIGHTS_FIELD = Object.freeze({ views: 'views', likes: 'likes', comments: 'comments', saves: 'saved', shares: 'shares' });

export class InstagramPerformanceSource extends PerformanceSource {
  constructor(overrides = {}) {
    super();
    const config = resolveInstagramConfig(overrides);
    this._accessToken = config.accessToken;
    this._apiVersion = config.apiVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
  }

  get name() {
    return 'instagram_graph_api_insights';
  }

  /**
   * query = { externalPostId } — el external_post_id/external_content_id
   * REAL de un PublishedContent ya existente, nunca un id inventado.
   * Devuelve { metric: value } con la MISMA forma que
   * MockPerformanceSource.fetch(), para que ambas fuentes sean intercambiables
   * detrás de PerformanceSource — pero nunca comparten la etiqueta "source".
   */
  async fetch(query = {}) {
    const { externalPostId } = query;
    if (!externalPostId) {
      throw new Error('InstagramPerformanceSource: se requiere "externalPostId" real de un PublishedContent ya publicado — nunca se inventa un id.');
    }
    if (!this._accessToken) {
      throw new Error(
        'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta INSTAGRAM_ACCESS_TOKEN (variable de entorno). ' +
        'No se ha intentado ninguna llamada de red desde este archivo.'
      );
    }

    const availableMetrics = Object.entries(METRIC_AVAILABILITY).filter(([, availability]) => availability === 'AVAILABLE').map(([metric]) => metric);
    const graphFields = availableMetrics.map((m) => GRAPH_INSIGHTS_FIELD[m]).join(',');

    const url = `https://graph.facebook.com/${this._apiVersion}/${externalPostId}/insights?metric=${graphFields}&access_token=${this._accessToken}`;
    let response;
    try {
      response = await this._fetch(url);
    } catch (networkError) {
      throw new Error(`InstagramPerformanceSource: fallo de red al llamar a Insights — ${networkError.message}`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`InstagramPerformanceSource: la API respondió ${response.status}: ${body}`);
    }
    const body = await response.json();
    const byField = new Map((body.data ?? []).map((entry) => [entry.name, entry.values?.[0]?.value ?? NOT_AVAILABLE]));

    const result = {};
    for (const metric of ALLOWED_METRICS) {
      const availability = METRIC_AVAILABILITY[metric];
      if (availability !== 'AVAILABLE') {
        result[metric] = NOT_AVAILABLE; // NOT_AVAILABLE y UNKNOWN colapsan aquí — nunca se inventa un número (ver nota de cabecera).
        continue;
      }
      const graphField = GRAPH_INSIGHTS_FIELD[metric];
      const value = byField.get(graphField);
      result[metric] = typeof value === 'number' ? value : NOT_AVAILABLE;
    }
    return result;
  }
}

export async function collectPlatformPerformanceObservations({ publishedContent, source, observedAt = new Date().toISOString() }) {
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
        ? `Métrica "${metric}" clasificada ${METRIC_AVAILABILITY[metric]} en la auditoría oficial de Fase 18 — nunca se infiere un valor.`
        : `Dato real de ${source.name} (Instagram Graph API Insights).`,
      source: 'platform_observed',
    }));
  }
  return observations;
}
