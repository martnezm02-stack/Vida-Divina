// scheduling.js — endpoints reales del CALENDARIO (Media Hosting +
// Publishing Scheduler). Cada handler solo arma argumentos y llama al
// PublishingScheduler real (publishing-scheduler/) -- nunca reimplementa
// la máquina de estados, el media hosting ni la publicación real.

import { sendJson, badRequest, notFound, serverError, readJsonBody } from '../lib/http.js';
import { publishingScheduler, mediaHostingService } from '../lib/schedulerInstance.js';
import { createScheduledPublication, SCHEDULABLE_PLATFORMS } from '../../../publishing-scheduler/src/scheduledPublication.js';
import * as scheduledPublicationStore from '../../../publishing-scheduler/src/scheduledPublicationStore.js';

/** Resumen liviano para listas -- nunca reenvía assetPackageSnapshot completo (puede ser pesado: probes, lineage, etc.) al listar. */
function toSummary(record) {
  return {
    id: record.id, assetPackageId: record.assetPackageId, platform: record.platform, destination: record.destination,
    caption: record.caption, scheduledAt: record.scheduledAt, timezone: record.timezone, status: record.status,
    createdAt: record.createdAt, updatedAt: record.updatedAt, approvedAt: record.approvedAt, approvedBy: record.approvedBy,
    publishedAt: record.publishedAt, externalPublicationId: record.externalPublicationId, error: record.error, retryCount: record.retryCount,
  };
}

export async function handleListSchedules(req, res) {
  const list = scheduledPublicationStore.list().map(toSummary).reverse();
  sendJson(res, 200, list);
}

export async function handleGetSchedule(req, res, id) {
  const record = scheduledPublicationStore.get(id);
  if (!record) { notFound(res, `No existe ninguna publicación programada con id "${id}".`); return; }
  sendJson(res, 200, record);
}

export async function handleCreateSchedule(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { assetPackage, platform, destination = null, caption } = body;
  if (!assetPackage) { badRequest(res, 'CALENDARIO: "assetPackage" es obligatorio (el Final Asset Package real ya producido).'); return; }
  if (!SCHEDULABLE_PLATFORMS.includes(platform)) { badRequest(res, `CALENDARIO: "platform" debe ser una de ${SCHEDULABLE_PLATFORMS.join(', ')}.`); return; }
  if (!caption?.trim()) { badRequest(res, 'CALENDARIO: "caption" es obligatorio -- nunca se programa sin un mensaje real escrito por un humano.'); return; }
  try {
    const record = createScheduledPublication({ assetPackage, platform, destination, caption });
    scheduledPublicationStore.save(record);
    sendJson(res, 200, toSummary(record));
  } catch (err) {
    badRequest(res, err.message);
  }
}

export async function handleApproveSchedule(req, res, id) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  try {
    const record = publishingScheduler.approve(id, { approvedBy: body.approvedBy });
    sendJson(res, 200, toSummary(record));
  } catch (err) {
    badRequest(res, err.message);
  }
}

export async function handleProgramSchedule(req, res, id) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { date, time, timezone } = body;
  try {
    const record = publishingScheduler.schedule(id, { date, time, timezone });
    sendJson(res, 200, toSummary(record));
  } catch (err) {
    badRequest(res, err.message);
  }
}

export async function handleCancelSchedule(req, res, id) {
  try {
    const record = publishingScheduler.cancel(id);
    sendJson(res, 200, toSummary(record));
  } catch (err) {
    badRequest(res, err.message);
  }
}

/** Corre el scheduler real ahora mismo (mismo tick que el intervalo automático de server/index.js) -- útil para el botón "Verificar ahora" del dashboard y para pruebas manuales sin esperar el intervalo. */
export async function handleRunSchedulerNow(req, res) {
  try {
    const results = await publishingScheduler.runDuePublications();
    sendJson(res, 200, { processed: results.length, results: results.map(toSummary) });
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleMediaHostingStatus(req, res) {
  sendJson(res, 200, { configured: mediaHostingService.isConfigured() });
}
