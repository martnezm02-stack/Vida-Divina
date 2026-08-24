// campaignStore.js — persistencia real de Campaign (Fase 14, Parte 8).
// Mismo patrón de archivo JSON por id que
// publishing-scheduler/src/scheduledPublicationStore.js -- sin PostgreSQL
// ni base de datos nueva.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = path.join(fileURLToPath(new URL('../data', import.meta.url)), 'campaigns');

function ensureDir() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

function recordPath(id) {
  return path.join(DATA_ROOT, `${id}.json`);
}

export function save(record) {
  if (!record?.id) throw new Error('campaignStore.save: "id" es obligatorio.');
  ensureDir();
  fs.writeFileSync(recordPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function get(id) {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Todas las campañas reales, más recientes primero. */
export function list() {
  ensureDir();
  return fs.readdirSync(DATA_ROOT)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_ROOT, f), 'utf8')))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function del(id) {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
