// learning.js — Learning & Strategy Feedback Engine, Fase 18. API de SOLO
// LECTURA: lee learning_record/strategy_feedback ya persistidos en
// performanceLearningStore. Nunca genera como efecto secundario de un GET
// -- la generación corre aparte
// (learning-strategy-engine/validateLearningPhase22.mjs hoy), mismo
// criterio que routes/attribution.js y routes/intelligence.js.

import { sendJson, badRequest } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { listLearningRecords, summarizeLearning, listStrategyFeedback } from '../../../learning-strategy-engine/src/learningService.js';
import { LEARNING_TYPES, STRATEGY_FEEDBACK_STATUSES } from '../../../learning-strategy-engine/src/learningTypes.js';
import { MARKETING_CONFIDENCE_LEVELS } from '../../../marketing-intelligence-engine/src/marketingInsight.js';

const VALID_PLATFORMS = Object.freeze(['instagram', 'facebook', 'all']);

function validateCommonFilters(url) {
  const platform = url.searchParams.get('platform');
  const confidence = url.searchParams.get('confidence');
  if (platform && !VALID_PLATFORMS.includes(platform)) return { error: `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).` };
  if (confidence && !MARKETING_CONFIDENCE_LEVELS.includes(confidence)) return { error: `"confidence" inválida "${confidence}" (válidas: ${MARKETING_CONFIDENCE_LEVELS.join(', ')}).` };
  return { platform, confidence };
}

export async function handleLearningList(req, res, url) {
  const common = validateCommonFilters(url);
  if (common.error) { badRequest(res, common.error); return; }
  const learningType = url.searchParams.get('learningType');
  if (learningType && !LEARNING_TYPES.includes(learningType)) { badRequest(res, `"learningType" inválido "${learningType}" (válidos: ${LEARNING_TYPES.join(', ')}).`); return; }
  const product = url.searchParams.get('product');
  const format = url.searchParams.get('format');
  sendJson(res, 200, listLearningRecords({ store: performanceLearningStore, ...common, learningType, product, format }));
}

export async function handleLearningSummary(req, res, url) {
  const common = validateCommonFilters(url);
  if (common.error) { badRequest(res, common.error); return; }
  sendJson(res, 200, summarizeLearning({ store: performanceLearningStore, platform: common.platform }));
}

export async function handleStrategyFeedbackList(req, res, url) {
  const common = validateCommonFilters(url);
  if (common.error) { badRequest(res, common.error); return; }
  const status = url.searchParams.get('status');
  if (status && !STRATEGY_FEEDBACK_STATUSES.includes(status)) { badRequest(res, `"status" inválido "${status}" (válidos: ${STRATEGY_FEEDBACK_STATUSES.join(', ')}).`); return; }
  const product = url.searchParams.get('product');
  const format = url.searchParams.get('format');
  sendJson(res, 200, listStrategyFeedback({ store: performanceLearningStore, ...common, product, format, status }));
}
