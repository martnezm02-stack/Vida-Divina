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

export const SCHEDULED_PUBLICATION_STATUSES = Object.freeze([
  'DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'CONFIGURATION_REQUIRED',
]);

// WhatsApp ya se publica de forma inmediata vía whatsapp-adapter/ -- el
// scheduler de esta fase solo cubre Instagram/Facebook (§10-11 del encargo).
export const SCHEDULABLE_PLATFORMS = Object.freeze(['INSTAGRAM', 'FACEBOOK']);

export const MAX_RETRY_COUNT = 3;

/**
 * @param {{assetPackage:object, platform:string, destination?:string|null, caption:string}} params
 */
export function createScheduledPublication({ assetPackage, platform, destination = null, caption }) {
  if (!assetPackage) throw new Error('createScheduledPublication: "assetPackage" es obligatorio -- el Final Asset Package real ya producido.');
  if (assetPackage.status !== 'COMPLETED') {
    throw new Error(`createScheduledPublication: el Final Asset Package debe estar "COMPLETED" (recibido "${assetPackage.status}") -- solo contenido FINAL puede programarse.`);
  }
  if (!SCHEDULABLE_PLATFORMS.includes(platform)) {
    throw new Error(`createScheduledPublication: "platform" inválido "${platform}" (válidos: ${SCHEDULABLE_PLATFORMS.join(', ')}).`);
  }
  if (!caption?.trim()) throw new Error('createScheduledPublication: "caption" es obligatorio -- nunca se publica sin un mensaje real escrito por un humano.');

  const now = new Date().toISOString();
  return Object.freeze({
    id: randomUUID(),
    assetPackageId: assetPackage.requestId ?? assetPackage.outputAssets?.[0]?.assetId ?? randomUUID(),
    assetPackageSnapshot: assetPackage,
    platform,
    destination,
    caption: caption.trim(),
    scheduledAt: null,
    timezone: null,
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
