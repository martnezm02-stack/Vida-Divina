// contentPlans.js — Content Planning & Execution, Fase 22/23. API de SOLO
// LECTURA: lee content_plan ya persistidos en performanceLearningStore.
// NO existe ningún endpoint que ejecute/publique un ContentPlan (§23 del
// encargo: "NO crear una API pública que permita publicar sin respetar
// executionMode") -- la ejecución real (planContent()) se invoca desde
// script/servicio, nunca desde un GET.

import { sendJson, badRequest, notFound } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { listContentPlans, getContentPlan } from '../../../content-planning/src/contentPlanningService.js';
import { CONTENT_PLAN_STATUSES, EXECUTION_MODES } from '../../../content-planning/src/contentPlan.js';

const VALID_PLATFORMS = Object.freeze(['INSTAGRAM_REEL', 'FACEBOOK_REEL', 'WHATSAPP_VIDEO', 'WHATSAPP']);

export async function handleContentPlansList(req, res, url) {
  const status = url.searchParams.get('status');
  const platform = url.searchParams.get('platform');
  const executionMode = url.searchParams.get('executionMode');
  if (status && !CONTENT_PLAN_STATUSES.includes(status)) { badRequest(res, `"status" inválido "${status}" (válidos: ${CONTENT_PLAN_STATUSES.join(', ')}).`); return; }
  if (platform && !VALID_PLATFORMS.includes(platform)) { badRequest(res, `"platform" inválido "${platform}" (válidos: ${VALID_PLATFORMS.join(', ')}).`); return; }
  if (executionMode && !EXECUTION_MODES.includes(executionMode)) { badRequest(res, `"executionMode" inválido "${executionMode}" (válidos: ${EXECUTION_MODES.join(', ')}).`); return; }
  sendJson(res, 200, listContentPlans({ store: performanceLearningStore, status, platform, executionMode }));
}

export async function handleContentPlanGet(req, res, id) {
  const plan = getContentPlan({ store: performanceLearningStore, id });
  if (!plan) { notFound(res, `ContentPlan "${id}" no existe.`); return; }
  sendJson(res, 200, plan);
}
