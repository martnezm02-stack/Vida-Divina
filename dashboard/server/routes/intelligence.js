// intelligence.js — Marketing Intelligence Engine, Fase 16. API de SOLO
// LECTURA: lee marketing_insight ya persistidos en performanceLearningStore
// (mismo store de Performance/Attribution Intelligence). Nunca genera
// MarketingInsight como efecto secundario de un GET -- la generación corre
// aparte (marketing-intelligence-engine/validateMarketingIntelligencePhase19.mjs
// hoy), mismo criterio que routes/attribution.js.

import { sendJson, badRequest } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { listMarketingInsights, summarizeMarketingIntelligence } from '../../../marketing-intelligence-engine/src/marketingIntelligenceService.js';
import { INTELLIGENCE_CATEGORIES } from '../../../marketing-intelligence-engine/src/intelligenceCategories.js';
import { MARKETING_CONFIDENCE_LEVELS } from '../../../marketing-intelligence-engine/src/marketingInsight.js';

const VALID_PLATFORMS = Object.freeze(['instagram', 'facebook', 'all']);

function parseFilters(url) {
  const platform = url.searchParams.get('platform');
  const category = url.searchParams.get('category');
  const confidence = url.searchParams.get('confidence');
  const product = url.searchParams.get('product');
  const campaign = url.searchParams.get('campaign');
  if (platform && !VALID_PLATFORMS.includes(platform)) return { error: `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).` };
  if (category && !INTELLIGENCE_CATEGORIES.includes(category)) return { error: `"category" inválida "${category}" (válidas: ${INTELLIGENCE_CATEGORIES.join(', ')}).` };
  if (confidence && !MARKETING_CONFIDENCE_LEVELS.includes(confidence)) return { error: `"confidence" inválida "${confidence}" (válidas: ${MARKETING_CONFIDENCE_LEVELS.join(', ')}).` };
  return { platform, category, confidence, product, campaign };
}

export async function handleIntelligenceList(req, res, url) {
  const filters = parseFilters(url);
  if (filters.error) { badRequest(res, filters.error); return; }
  sendJson(res, 200, listMarketingInsights({ store: performanceLearningStore, ...filters }));
}

export async function handleIntelligenceSummary(req, res, url) {
  const platform = url.searchParams.get('platform');
  if (platform && !VALID_PLATFORMS.includes(platform)) { badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`); return; }
  sendJson(res, 200, summarizeMarketingIntelligence({ store: performanceLearningStore, platform: platform ?? null }));
}
