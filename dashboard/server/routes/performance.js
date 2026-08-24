// performance.js — Performance Intelligence, Fase 6 (lectura mínima en el
// dashboard). Solo lee PerformanceLearningStore (performance-learning-
// intelligence, vía content-strategy/src/performanceLearningStoreInstance.js)
// y arma una vista de solo lectura por publicación -- no dashboards
// visuales complejos todavía, primero datos correctos.

import { sendJson, badRequest } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { normalizeLatestMetrics } from '../../../content-strategy/src/performanceAnalysis/metricsNormalizer.js';
import { analyzePerformance } from '../../../content-strategy/src/performanceAnalysis/performanceAnalysisService.js';

export async function handlePerformanceList(req, res) {
  const publications = performanceLearningStore.loadAll('published_content');
  const observations = performanceLearningStore.loadAll('performance_observation');

  const result = publications.map((p) => {
    const { metrics, lastUpdated } = normalizeLatestMetrics(p.content_id, observations);
    return {
      content_id: p.content_id,
      platform: p.platform,
      published_at: p.published_at,
      external_post_id: p.external_post_id,
      topic: p.topic,
      url: p.url,
      metrics,
      lastUpdated,
    };
  });

  sendJson(res, 200, result);
}

const VALID_PLATFORMS = Object.freeze(['instagram', 'facebook']);

/** GET /api/performance/analysis?platform=instagram — Performance Analysis Engine, Fase 10. Solo lectura. */
export async function handlePerformanceAnalysis(req, res, url) {
  const platform = url.searchParams.get('platform');
  if (platform && !VALID_PLATFORMS.includes(platform)) {
    badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`);
    return;
  }
  const result = analyzePerformance({ platform: platform ?? null });
  sendJson(res, 200, result);
}
