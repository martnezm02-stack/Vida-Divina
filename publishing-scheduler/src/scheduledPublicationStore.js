// scheduledPublicationStore.js — persistencia real de ScheduledPublication.
// Mismo patrón de archivo JSON por id que
// creative-intelligence/production/productionArtifactStore.js, pero con
// una diferencia deliberada: un ScheduledPublication SÍ muta a lo largo de
// su ciclo de vida real (DRAFT -> APPROVED -> SCHEDULED -> PUBLISHING ->
// PUBLISHED/FAILED/CONFIGURATION_REQUIRED/CANCELLED), así que save() es
// upsert (crea si no existe, sobrescribe si ya existe) en vez de
// write-once -- un ProductionArtifact es un artefacto inmutable; un
// ScheduledPublication es un registro de estado vivo.
//
// No se crea PostgreSQL nuevo ni otra base de datos (instrucción explícita
// del encargo) -- reutiliza el mismo patrón de archivo real ya validado en
// el proyecto (creative-intelligence/, performance-learning-intelligence/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = path.join(fileURLToPath(new URL('../data', import.meta.url)), 'scheduledPublications');

function ensureDir() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

function recordPath(id) {
  return path.join(DATA_ROOT, `${id}.json`);
}

/** Upsert real -- crea si no existe, sobrescribe si ya existe (transición de estado). */
export function save(record) {
  if (!record?.id) throw new Error('scheduledPublicationStore.save: "id" es obligatorio.');
  ensureDir();
  fs.writeFileSync(recordPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

/** Recupera un registro real -- null si no existe, nunca inventa uno. */
export function get(id) {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function exists(id) {
  return fs.existsSync(recordPath(id));
}

/** Todos los registros reales, ordenados por createdAt ascendente. */
export function list() {
  ensureDir();
  return fs.readdirSync(DATA_ROOT)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_ROOT, f), 'utf8')))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export function del(id) {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
