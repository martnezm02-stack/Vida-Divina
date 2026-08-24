// autoPublishConfig.js — AutoPublishConfig (Fase 13, Parte 6). Única
// fuente de verdad de la política global de AUTO_PUBLISH. Append-only
// (mismo store, mismo criterio que strategy_decision/content_plan): cada
// cambio agrega un registro, "actual" es el más reciente por createdAt --
// nunca se muta el histórico (Parte 24: "desactivar la política no debe
// borrar datos").
//
// Mismo principio anti-bypass ya establecido en
// content-strategy/src/humanReviewRecord.js: activar la política exige un
// humano real identificable (enabledBy) -- "system"/"auto"/"bot" nunca son
// válidos, ni siquiera aquí. No es una aprobación por publicación: es la
// autorización explícita y global de la que hablan las Partes 8/15 (una
// sola decisión humana, no una por publicación).

import { randomUUID } from 'node:crypto';
import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';

const FORBIDDEN_ACTOR_IDS = Object.freeze(['system', 'auto', 'bot', 'automated', 'automatic', '']);

/** Exportado para que la capa de API (dashboard) pueda validar el actor ANTES de cualquier otra regla de negocio (ej. readiness) -- nunca se valida "después". */
export function isRealActorId(actorId) {
  return typeof actorId === 'string' && !FORBIDDEN_ACTOR_IDS.includes(actorId.trim().toLowerCase());
}

function assertRealActor(actorId, field) {
  if (!isRealActorId(actorId)) {
    throw new Error(`AutoPublishConfig: "${field}" inválido ("${actorId}") -- debe identificar a una persona real, nunca "system"/"auto"/"bot"/vacío.`);
  }
}

export function createAutoPublishConfig({ enabled, actorId, reason = null }) {
  if (typeof enabled !== 'boolean') throw new Error('AutoPublishConfig: "enabled" debe ser boolean.');
  assertRealActor(actorId, 'actorId');
  return Object.freeze({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    enabled,
    actorId: actorId.trim(),
    reason,
    source: 'content_planning:auto_publish_config',
  });
}

/** Parte 6/9 -- valor por defecto obligatorio: enabled=false, sin necesidad de ningún registro persistido todavía. */
export const DEFAULT_AUTO_PUBLISH_CONFIG = Object.freeze({ id: null, createdAt: null, enabled: false, actorId: null, reason: 'valor por defecto -- ninguna activación registrada todavía', source: 'default' });

/** Fase 13 -- lee la configuración vigente (la más reciente). Nunca genera un registro nuevo (solo lectura). */
export function getCurrentAutoPublishConfig({ store = defaultStore } = {}) {
  const all = store.loadAll('auto_publish_config');
  if (all.length === 0) return DEFAULT_AUTO_PUBLISH_CONFIG;
  return all.reduce((latest, r) => (new Date(r.createdAt) >= new Date(latest.createdAt) ? r : latest));
}

/** Parte 7/8/9/10 -- único punto de escritura. Nunca publica ni genera nada -- solo agrega el registro de política. */
export function setAutoPublishEnabled({ enabled, actorId, reason = null, store = defaultStore }) {
  const config = createAutoPublishConfig({ enabled, actorId, reason });
  store.save('auto_publish_config', config);
  return config;
}

/**
 * Historial completo -- Parte 22 (audit trail): quién activó/desactivó y
 * cuándo, nunca perdido. Empate exacto de createdAt (misma corrida,
 * resolución de milisegundo) se rompe por orden real de inserción en el
 * store (mismo criterio ya aplicado en learning-strategy-engine/src/
 * learningService.js#annotateSupersession) -- nunca un resultado indefinido.
 */
export function listAutoPublishConfigHistory({ store = defaultStore } = {}) {
  return store.loadAll('auto_publish_config')
    .map((record, index) => ({ record, index }))
    .sort((a, b) => (new Date(b.record.createdAt) - new Date(a.record.createdAt)) || (b.index - a.index))
    .map(({ record }) => record);
}
