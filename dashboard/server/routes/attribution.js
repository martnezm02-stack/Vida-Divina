// attribution.js — Attribution Engine, Fase 14. API de SOLO LECTURA: lee
// attribution_record ya generados en performanceLearningStore (mismo store
// de Performance Intelligence, kind extendido -- ver
// performance-learning-intelligence/src/store.js). Nunca genera
// AttributionRecord como efecto secundario de un GET -- la generación
// corre aparte (attribution-engine/validateAttributionPhase7.mjs hoy;
// scheduler real en una fase futura), igual que performanceCollectionService
// no se dispara desde GET /api/performance.

import { sendJson, badRequest } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { computeCommercialMetrics } from '../../../attribution-engine/src/attributionService.js';
import { ATTRIBUTION_TYPES } from '../../../attribution-engine/src/evidenceModel.js';

const VALID_PLATFORMS = Object.freeze(['instagram', 'facebook']);

export async function handleAttributionList(req, res, url) {
  const platform = url.searchParams.get('platform');
  const attributionType = url.searchParams.get('attributionType');
  if (platform && !VALID_PLATFORMS.includes(platform)) { badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`); return; }
  if (attributionType && !ATTRIBUTION_TYPES.includes(attributionType)) { badRequest(res, `"attributionType" inválido "${attributionType}" (válidos: ${ATTRIBUTION_TYPES.join(', ')}).`); return; }

  let records = performanceLearningStore.loadAll('attribution_record');
  if (platform) records = records.filter((r) => r.platform === platform);
  if (attributionType) records = records.filter((r) => r.attributionType === attributionType);

  sendJson(res, 200, records);
}

export async function handleAttributionSummary(req, res, url) {
  const platform = url.searchParams.get('platform');
  if (platform && !VALID_PLATFORMS.includes(platform)) { badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`); return; }

  let records = performanceLearningStore.loadAll('attribution_record');
  if (platform) records = records.filter((r) => r.platform === platform);

  if (records.length === 0) {
    sendJson(res, 200, { status: 'INSUFFICIENT_ATTRIBUTION_DATA', reason: 'No hay AttributionRecord generados todavía (con o sin el filtro de plataforma aplicado).', byType: {}, metrics: null });
    return;
  }

  const byType = {};
  for (const type of ATTRIBUTION_TYPES) byType[type] = records.filter((r) => r.attributionType === type).length;

  sendJson(res, 200, { status: 'OK', totalRecords: records.length, byType, metrics: computeCommercialMetrics(records) });
}
