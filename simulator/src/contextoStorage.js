// contextoStorage.js
// Persistencia del contexto conversacional — Fase C.2B: delega
// exclusivamente en crm/index.js (CRM Context Projection sobre
// PostgreSQL), en vez de leer/escribir archivos JSON directamente.
// PostgreSQL es ahora la fuente de verdad activa.
//
// Historia de esta decisión (se conserva para quien retome el archivo):
// Fase 3.1 eligió JSON local sin dependencias nuevas, coherente con la
// regla entonces vigente de "Node.js sin dependencias externas"
// (docs/ARCHITECTURE_v1.md §11.6). Esa regla fue modificada explícitamente
// en la Fase B del CRM (excepción para el driver `pg`, exclusivo de
// `crm/`) — ver docs/ARCHITECTURE_v1.md §11 y docs/PROJECT_STATE.md §6.
// La Fase C.0/C.1 diseñaron un proyector (crm/context/) que ensambla y
// desensambla exactamente esta misma forma de objeto contra PostgreSQL; la
// Fase C.2A auditó que ningún consumidor real de este archivo dependía de
// nada del filesystem salvo la sincronía en sí, y la Fase C.2B (este
// cambio) resolvió esa sincronía propagando async/await por la cadena real
// de llamadas — ver docs/CRM_FASE_C2_ASYNC_MIGRATION.md para el detalle
// completo (auditoría, decisiones aprobadas, y verificación).
//
// Contrato público preservado exactamente (mismos nombres, mismos
// parámetros, misma forma del objeto contexto) — el único cambio
// observable es que las 4 funciones ahora devuelven Promise, en vez de un
// valor directo. Quien llama debe usar await (o .then), igual que ya hace
// el resto de la cadena real (simulator/src/flujoVentaReal.js,
// whatsapp-adapter/src/conversationRouter.js).
//
// Regla arquitectónica (Decisión #6, ver docs/ARCHITECTURE_v1.md §11): la
// única dependencia de este archivo hacia la capa de persistencia es
// crm/index.js. Nunca `pg`, nunca un repository individual, nunca
// crm/db/pool.js — esas son responsabilidad exclusiva de crm/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextExists, projectContext, persistContext, updateContext } from '../../crm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Fuera de docs/ y knowledge/ a propósito — ver cabecera de este archivo.
// Se conserva como export público: varios tests (simulator/test/,
// whatsapp-adapter/test/) todavía lo usan para localizar/limpiar archivos
// legacy de corridas anteriores a esta migración. El directorio en sí no
// se elimina (data/conversaciones/ — infraestructura JSON legacy retenida
// temporalmente, ver docs/CRM_FASE_C2_ASYNC_MIGRATION.md "Estado del JSON
// legacy") y ya no recibe escrituras nuevas desde este archivo.
export const CONTEXTOS_ROOT = path.join(REPO_ROOT, 'data', 'conversaciones');

// ---------------------------------------------------------------------
// Infraestructura JSON legacy — RETENIDA, NO ELIMINADA.
// Ninguna de estas tres funciones se usa ya desde la API pública de abajo
// (que delega en crm/index.js). Se documentan aquí como código muerto a
// propósito, en vez de borrarlas: Fase C.2B no elimina la infraestructura
// del mecanismo anterior (regla explícita — la eliminación es una fase
// posterior, tras validar estabilidad de PostgreSQL en producción).
// ---------------------------------------------------------------------

/**
 * Convierte un identificador arbitrario (número de WhatsApp, id interno
 * del simulador, nombre de caso de prueba) en un nombre de archivo seguro.
 * No inventa ni reinterpreta el identificador — solo lo hace válido como
 * nombre de archivo en cualquier sistema operativo.
 */
function nombreDeArchivo(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('contextoStorage: se requiere un identificador de conversación (string no vacío).');
  }
  const seguro = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!seguro) {
    throw new Error(`contextoStorage: el identificador "${id}" no produce un nombre de archivo válido.`);
  }
  return `${seguro}.json`;
}

function rutaContexto(id) {
  return path.join(CONTEXTOS_ROOT, nombreDeArchivo(id));
}

function asegurarDirectorio() {
  fs.mkdirSync(CONTEXTOS_ROOT, { recursive: true });
}

// ---------------------------------------------------------------------
// API pública — delega exclusivamente en crm/index.js. Ninguna función de
// aquí abajo toca `fs` ni las funciones legacy de arriba.
// ---------------------------------------------------------------------

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function existeContexto(id) {
  return contextExists(id);
}

/**
 * @param {string} id
 * @returns {Promise<Object|null>} el contexto guardado, o null si no existe
 *   todavía (nunca un objeto inventado — mismo principio que antes).
 */
export async function recuperarContexto(id) {
  return projectContext(id);
}

/**
 * @param {string} id
 * @param {Object} contexto - debe ser serializable a JSON; no se valida
 *   contra un esquema fijo aquí (esa responsabilidad es de
 *   crearContextoConversacion() en flujoVentaReal.js, para no duplicar
 *   la definición del contrato de datos en dos archivos).
 * @returns {Promise<Object>}
 */
export async function guardarContexto(id, contexto) {
  return persistContext(id, contexto);
}

/**
 * Actualización parcial: recupera el contexto existente (o crea uno vacío
 * con la forma que indique `crearVacio` si no existe todavía), aplica un
 * merge superficial de `cambios` sin descartar los campos no mencionados,
 * y guarda. Nunca sustituye el contexto completo por `cambios`.
 *
 * @param {string} id
 * @param {Object} cambios - campos a fusionar sobre el contexto existente
 * @param {() => Object} [crearVacio] - fábrica del contexto inicial si no
 *   existe todavía (normalmente crearContextoConversacion());
 *   inyectada por quien llama para no crear una dependencia circular
 *   entre este archivo y flujoVentaReal.js — mismo motivo, ahora también
 *   entre simulator/ y crm/ (crm/ no debe conocer la forma del contexto
 *   de negocio, ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md).
 * @returns {Promise<Object>} el contexto ya actualizado y guardado
 */
export async function actualizarContexto(id, cambios, crearVacio) {
  return updateContext(id, cambios, crearVacio);
}
