// strategyDecisions.js — Strategy Decision Engine, Fase 22. API de SOLO
// LECTURA: lee strategy_decision ya persistidas en performanceLearningStore.
// Nunca genera como efecto secundario de un GET, y NO existe ningún
// endpoint para ejecutar una decisión (§22/§25: ACCEPT solo significa
// READY_FOR_STRATEGY_UPDATE, nunca EXECUTE).

import { sendJson, badRequest } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { listStrategyDecisions, summarizeStrategyDecisions } from '../../../strategy-decision-engine/src/strategyDecisionService.js';
import { DECISIONS, RISKS, SCOPE_TYPES, DECISION_STATUSES } from '../../../strategy-decision-engine/src/strategyDecision.js';
import { MARKETING_CONFIDENCE_LEVELS } from '../../../marketing-intelligence-engine/src/marketingInsight.js';

const VALID_PLATFORMS = Object.freeze(['instagram', 'facebook', 'all']);

function validateFilters(url) {
  const decision = url.searchParams.get('decision');
  const platform = url.searchParams.get('platform');
  const scope = url.searchParams.get('scope');
  const confidence = url.searchParams.get('confidence');
  const risk = url.searchParams.get('risk');
  const status = url.searchParams.get('status');
  if (decision && !DECISIONS.includes(decision)) return { error: `"decision" inválida "${decision}" (válidas: ${DECISIONS.join(', ')}).` };
  if (platform && !VALID_PLATFORMS.includes(platform)) return { error: `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).` };
  if (scope && !SCOPE_TYPES.includes(scope)) return { error: `"scope" inválido "${scope}" (válidos: ${SCOPE_TYPES.join(', ')}).` };
  if (confidence && !MARKETING_CONFIDENCE_LEVELS.includes(confidence)) return { error: `"confidence" inválida "${confidence}" (válidas: ${MARKETING_CONFIDENCE_LEVELS.join(', ')}).` };
  if (risk && !RISKS.includes(risk)) return { error: `"risk" inválido "${risk}" (válidos: ${RISKS.join(', ')}).` };
  if (status && !DECISION_STATUSES.includes(status)) return { error: `"status" inválido "${status}" (válidos: ${DECISION_STATUSES.join(', ')}).` };
  return { decision, platform, scope, confidence, risk, status };
}

export async function handleStrategyDecisionsList(req, res, url) {
  const filters = validateFilters(url);
  if (filters.error) { badRequest(res, filters.error); return; }
  sendJson(res, 200, listStrategyDecisions({ store: performanceLearningStore, ...filters }));
}

export async function handleStrategyDecisionsSummary(req, res, url) {
  const platform = url.searchParams.get('platform');
  if (platform && !VALID_PLATFORMS.includes(platform)) { badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`); return; }
  sendJson(res, 200, summarizeStrategyDecisions({ store: performanceLearningStore, platform }));
}
