// commercialMediaStore.js — Commercial Media Registry: persistencia
// (encargo §12, §15, §16, §17, §18). Mismo patrón real ya usado en
// content-orchestrator/src/marketingIntelligence/signalStore.js y
// assetLineage.js: DATA_ROOT overrideable para tests aislados, un archivo
// JSON por registro. DELIBERADAMENTE un store nuevo y separado del
// Production Asset Registry (video-production/src/assetRegistry.js, §15) --
// responsabilidades distintas, nunca se fusionan.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommercialMediaRecord } from './commercialMediaRecord.js';

export const DATA_ROOT = process.env.COMMERCIAL_MEDIA_DATA_ROOT
  ? join(process.env.COMMERCIAL_MEDIA_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
export const REGISTRY_DIR = join(DATA_ROOT, 'registry');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function recordPath(mediaId) {
  return join(REGISTRY_DIR, `${mediaId}.json`);
}

export function listCommercialMedia(filters = {}) {
  if (!existsSync(REGISTRY_DIR)) return Object.freeze([]);
  const { productId, businessIntent, mediaType, audience, active, needTag } = filters;
  const all = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(REGISTRY_DIR, f), 'utf8')));
  return Object.freeze(all.filter((r) => (
    (productId === undefined || r.productId === productId)
    && (businessIntent === undefined || r.businessIntent === businessIntent)
    && (mediaType === undefined || r.mediaType === mediaType)
    && (audience === undefined || r.audience === audience)
    && (active === undefined || r.active === active)
    && (needTag === undefined || r.needTags.includes(needTag))
  )));
}

export function getCommercialMedia(mediaId) {
  const filePath = recordPath(mediaId);
  if (!existsSync(filePath)) throw new Error(`getCommercialMedia: no existe el registro "${mediaId}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** Registro existente con el mismo contentHash real, o null (§16: dedupe por contenido, no por nombre). */
export function findByContentHash(contentHash) {
  return listCommercialMedia().find((r) => r.contentHash === contentHash) ?? null;
}

/**
 * Inserta o actualiza por contentHash (§16, §17): el MISMO archivo real
 * (mismo hash) nunca se registra dos veces -- una segunda corrida de
 * scan-commercial-media() sobre el mismo archivo actualiza el registro
 * existente (mismo mediaId, updatedAt real), nunca crea uno nuevo.
 */
export function upsertCommercialMedia(fields) {
  const existing = findByContentHash(fields.contentHash);
  const record = createCommercialMediaRecord({
    ...fields,
    mediaId: existing?.mediaId,
    createdAt: existing?.createdAt,
  });
  ensureDir(REGISTRY_DIR);
  writeFileSync(recordPath(record.mediaId), JSON.stringify(record, null, 2), 'utf8');
  return { record, wasNew: !existing };
}

/** §17/§18: desactiva SIN borrar el registro ni el archivo físico -- "active" es lo único que cambia. */
export function setCommercialMediaActive(mediaId, active) {
  const existing = getCommercialMedia(mediaId);
  const updated = { ...existing, active: Boolean(active), updatedAt: new Date().toISOString() };
  writeFileSync(recordPath(mediaId), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/** §38: cola de revisión -- archivos ya registrados que necesitan metadata humana antes de poder enviarse. */
export function getCommercialMediaNeedingMetadata() {
  return listCommercialMedia({ businessIntent: 'NEEDS_METADATA' });
}
