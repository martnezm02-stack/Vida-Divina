// scheduledPublication.js — modelo mínimo pedido por esta fase: id,
// assetPackageId, platform, destination, caption, scheduledAt, timezone,
// status, createdAt, publishedAt, externalPublicationId, error,
// retryCount (+ approvedAt/approvedBy/updatedAt, necesarios para que la
// máquina de estados sea real y auditable, no solo nominal).
//
// DESVIACIÓN DOCUMENTADA del campo "assetPackageId" del encargo: el Final
// Asset Package real (content-orchestrator/src/contentGenerationEngine.js)
// no tiene un id propio persistente (no hay "assetPackageStore" en el
// proyecto) -- el dashboard lo entrega completo al navegador en cada
// CREATE/EDIT/ADAPT/CAROUSEL y lo vuelve a enviar tal cual al confirmar
// publicación (ver dashboard/public/app.js#openPublishModal, patrón ya
// existente). Para que el scheduler pueda operar en un tick MUCHO más
// tarde que la petición HTTP original (posiblemente tras un reinicio del
// servidor), este módulo guarda el Final Asset Package COMPLETO como
// `assetPackageSnapshot` -- `assetPackageId` es un identificador derivado
// (requestId real del Final Asset Package, o el assetId de su primer
// output) solo para trazabilidad, nunca la clave real de persistencia.

import { randomUUID } from 'node:crypto';
import { zonedTimeToUtcIso } from './timezone.js';

export const SCHEDULED_PUBLICATION_STATUSES = Object.freeze([
  'DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'CONFIGURATION_REQUIRED',
]);

// WhatsApp ya se publica de forma inmediata vía whatsapp-adapter/ -- el
// scheduler de esta fase solo cubre Instagram/Facebook (§10-11 del encargo).
export const SCHEDULABLE_PLATFORMS = Object.freeze(['INSTAGRAM', 'FACEBOOK']);

export const MAX_RETRY_COUNT = 3;

/**
 * Corrección "Persistencia de fecha/hora/timezone desde DRAFT" (2026-09-04):
 * date/time/timezone son OPCIONALES en la creación -- si no se pasan (todo
 * el uso preexistente de este constructor, incl. tests), el registro queda
 * exactamente igual que antes (scheduledAt/timezone en null, sin
 * pendingDate/pendingTime). Cuando SÍ se pasan (origen: modal "Programar
 * publicación" del dashboard, ya sea desde Crear/Carrusel/Adaptar o desde
 * el Editor), se validan con la MISMA función real que ya usa
 * PublishingScheduler.schedule() (zonedTimeToUtcIso) -- nunca una segunda
 * regla de validación -- pero el resultado de esa conversión NO se guarda
 * en `scheduledAt`: ese campo sigue significando exclusivamente "instante
 * ya confirmado en SCHEDULED" (ver publishingScheduler.js), nunca una
 * intención todavía sin aprobar. Los valores crudos se guardan en
 * `pendingDate`/`pendingTime` (+ `timezone`, campo ya existente, ahora
 * poblado desde el origen) para que Calendario los recupere directamente
 * del registro real -- nunca de memoria de un navegador concreto (Map/
 * localStorage) -- y PublishingScheduler.schedule() los reutiliza como
 * default si /program no envía valores explícitos.
 *
 * @param {{assetPackage:object, platform:string, destination?:string|null, caption:string, date?:string|null, time?:string|null, timezone?:string|null}} params
 */
export function createScheduledPublication({ assetPackage, platform, destination = null, caption, date = null, time = null, timezone = null }) {
  if (!assetPackage) throw new Error('createScheduledPublication: "assetPackage" es obligatorio -- el Final Asset Package real ya producido.');
  if (assetPackage.status !== 'COMPLETED') {
    throw new Error(`createScheduledPublication: el Final Asset Package debe estar "COMPLETED" (recibido "${assetPackage.status}") -- solo contenido FINAL puede programarse.`);
  }
  if (!SCHEDULABLE_PLATFORMS.includes(platform)) {
    throw new Error(`createScheduledPublication: "platform" inválido "${platform}" (válidos: ${SCHEDULABLE_PLATFORMS.join(', ')}).`);
  }
  if (!caption?.trim()) throw new Error('createScheduledPublication: "caption" es obligatorio -- nunca se publica sin un mensaje real escrito por un humano.');

  // "Todo o nada": si el llamador manda CUALQUIERA de los tres, deben venir
  // los tres y ser válidos juntos (una fecha sin hora, o con un timezone
  // inválido, no sirve para nada) -- mismo criterio de "obligatorios juntos"
  // que ya aplicaba el frontend antes de esta corrección.
  const pending = date != null || time != null || timezone != null;
  if (pending) zonedTimeToUtcIso(date, time, timezone); // lanza (mismo mensaje real que /program) si algo es inválido/incompleto -- nunca se persiste basura.

  const now = new Date().toISOString();
  return Object.freeze({
    id: randomUUID(),
    assetPackageId: assetPackage.requestId ?? assetPackage.outputAssets?.[0]?.assetId ?? randomUUID(),
    assetPackageSnapshot: assetPackage,
    platform,
    destination,
    caption: caption.trim(),
    scheduledAt: null,
    timezone: pending ? timezone : null,
    pendingDate: pending ? date : null,
    pendingTime: pending ? time : null,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
    publishedAt: null,
    externalPublicationId: null,
    error: null,
    retryCount: 0,
  });
}
