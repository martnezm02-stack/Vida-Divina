// autoPublish.js — Real Asset Generation + Controlled Auto-Publish, Fase
// 13 Partes 6/7/8/9/10/13/14. Única fuente de verdad: content-planning/src/
// autoPublishConfig.js (append-only, sobre performanceLearningStore ya
// existente). Activar/desactivar SOLO agrega un registro de configuración
// -- nunca crea ContentPlan, nunca genera, nunca publica, nunca llama a
// Meta (Parte 10, verificado: setAutoPublishEnabled() no importa ningún
// módulo de generación/publicación).

import { sendJson, badRequest, readJsonBody } from '../lib/http.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { getCurrentAutoPublishConfig, setAutoPublishEnabled, listAutoPublishConfigHistory, isRealActorId } from '../../../content-planning/src/autoPublishConfig.js';
import { computeAutoPublishReadiness } from '../../../content-planning/src/autoPublishReadiness.js';

/** GET /api/auto-publish -- estado actual + readiness real (Parte 13). */
export async function handleGetAutoPublish(req, res) {
  const config = getCurrentAutoPublishConfig({ store: performanceLearningStore });
  const readiness = computeAutoPublishReadiness({ store: performanceLearningStore });
  sendJson(res, 200, { config, readiness });
}

/** GET /api/auto-publish/history -- audit trail completo (Parte 22), nunca perdido. */
export async function handleGetAutoPublishHistory(req, res) {
  sendJson(res, 200, listAutoPublishConfigHistory({ store: performanceLearningStore }));
}

/**
 * POST /api/auto-publish/enable { actorId, reason? } -- Parte 14: si
 * readiness=NOT_READY, NO activa (mantiene enabled=false) y devuelve el
 * motivo real explícito -- nunca activa en silencio.
 */
export async function handleEnableAutoPublish(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { actorId, reason = null } = body;
  if (!isRealActorId(actorId)) { badRequest(res, `auto-publish/enable: "actorId" inválido ("${actorId}") -- debe identificar a una persona real, nunca "system"/"auto"/"bot"/vacío.`); return; }

  // Parte 14 -- NOT_READY nunca activa, sin excepción vía esta API: se
  // devuelve el motivo real explícito y autoPublish.enabled permanece
  // false. Ninguna bandera de "forzar" existe aquí -- si el proyecto
  // decide permitir una activación consciente pese a NOT_READY, es una
  // decisión de una fase futura, no de esta.
  const readiness = computeAutoPublishReadiness({ store: performanceLearningStore });
  if (readiness.readiness !== 'READY') {
    sendJson(res, 200, { activated: false, readiness, config: getCurrentAutoPublishConfig({ store: performanceLearningStore }) });
    return;
  }

  try {
    const config = setAutoPublishEnabled({ enabled: true, actorId, reason, store: performanceLearningStore });
    sendJson(res, 200, { activated: true, readiness, config });
  } catch (err) {
    badRequest(res, err.message);
  }
}

/** POST /api/auto-publish/disable { actorId, reason? } -- Parte 9/24: nunca revierte publicaciones/históricos existentes. */
export async function handleDisableAutoPublish(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { actorId, reason = null } = body;
  if (!isRealActorId(actorId)) { badRequest(res, `auto-publish/disable: "actorId" inválido ("${actorId}") -- debe identificar a una persona real, nunca "system"/"auto"/"bot"/vacío.`); return; }

  try {
    const config = setAutoPublishEnabled({ enabled: false, actorId, reason, store: performanceLearningStore });
    sendJson(res, 200, { config });
  } catch (err) {
    badRequest(res, err.message);
  }
}
