// contextProjection.js
// CRM Context Projection — Fase C.1. API pública pequeña y explícita,
// diseñada para que Fase C.2 (reemplazar la implementación interna de
// simulator/src/contextoStorage.js) sea un ejercicio de delegación
// trivial, no una reescritura. NO reemplaza contextoStorage.js todavía —
// ese archivo sigue sin modificarse, y ningún módulo de negocio importa
// esto todavía.
//
// Contrato deliberadamente paralelo al de contextoStorage.js:
//   existeContexto      -> contextExists
//   recuperarContexto    -> projectContext
//   guardarContexto       -> persistContext
//   actualizarContexto     -> updateContext
// Misma forma de argumentos y de valor de retorno en cada caso — ver
// docs/CRM_FASE_C1_CONTEXT_PROJECTION.md para la tabla de equivalencia
// completa.
//
// No expone repositories individuales: quien use este módulo nunca ve
// customerRepository/conversationRepository/etc. directamente, solo estas
// 4 funciones — igual que crm/index.js no expone el pool crudo.

import { getPool } from '../db/pool.js';
import { runInTransaction } from '../db/transaction.js';
import { assembleContext } from './assemble.js';
import { disassembleContext, lockConversationIfExists } from './disassemble.js';

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function contextExists(id) {
  const pool = getPool();
  const contexto = await assembleContext(pool, id);
  return contexto !== null;
}

/**
 * Lectura pura — nunca escribe nada. Devuelve null si no existe (nunca un
 * objeto inventado), igual que contextoStorage.js#recuperarContexto.
 *
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function projectContext(id) {
  const pool = getPool();
  return assembleContext(pool, id);
}

/**
 * Persiste `contexto` completo dentro de una única transacción — si
 * cualquier paso falla, se revierte TODO (ninguna entidad queda a medio
 * escribir). Devuelve el mismo `contexto` recibido, igual que
 * contextoStorage.js#guardarContexto.
 *
 * @param {string} id
 * @param {Object} contexto
 * @param {string} [source] - Fase 16 Parte 4: REAL/SIMULATED/TEST/FIXTURE/
 *   UNKNOWN (ver conversationRepository.CONVERSATION_SOURCES). Solo tiene
 *   efecto si esta llamada CREA la conversación -- una ya existente
 *   conserva el source con el que se creó (no se reescribe origen
 *   histórico). Por defecto 'UNKNOWN': quien llama debe declarar
 *   explícitamente que el origen es real, nunca se asume.
 * @returns {Promise<Object>}
 */
export async function persistContext(id, contexto, source = 'UNKNOWN') {
  if (contexto === null || typeof contexto !== 'object') {
    throw new Error(`crm/context: el contexto de "${id}" debe ser un objeto, no ${typeof contexto}.`);
  }
  const pool = getPool();
  await runInTransaction(pool, (client) => disassembleContext(client, id, contexto, source));
  return contexto;
}

/**
 * Actualización parcial: recupera el contexto existente (o crea uno vacío
 * con la forma que indique `crearVacio` si no existe todavía), aplica un
 * merge superficial de `cambios` sin descartar los campos no mencionados,
 * y persiste — mismo contrato exacto que
 * contextoStorage.js#actualizarContexto, incluida la razón de por qué
 * `crearVacio` se recibe inyectado en vez de importarse aquí: evita una
 * dependencia de crm/ hacia simulator/ (crm/ no debe conocer la forma del
 * contexto de negocio, solo saber proyectarla).
 *
 * Todo el ciclo lectura+merge+escritura ocurre dentro de una sola
 * transacción, bloqueando la conversación (si ya existe) ANTES de leer el
 * valor base — así el merge siempre parte del dato más reciente, nunca de
 * uno leído antes de obtener el lock (evita lost update bajo escrituras
 * concurrentes al mismo id).
 *
 * @param {string} id
 * @param {Object} cambios
 * @param {() => Object} [crearVacio]
 * @param {string} [source] - Fase 16 Parte 4, mismo criterio que persistContext.
 * @returns {Promise<Object>}
 */
export async function updateContext(id, cambios, crearVacio, source = 'UNKNOWN') {
  const pool = getPool();
  return runInTransaction(pool, async (client) => {
    await lockConversationIfExists(client, id); // bloquea antes de leer, ver docstring
    const actual = await assembleContext(client, id);
    const base = actual ?? (typeof crearVacio === 'function' ? crearVacio() : {});
    const fusionado = { ...base, ...cambios, id };
    await disassembleContext(client, id, fusionado, source);
    return fusionado;
  });
}
