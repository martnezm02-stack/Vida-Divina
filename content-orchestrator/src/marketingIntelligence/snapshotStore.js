// snapshotStore.js — Marketing Intelligence: manifest de snapshot.
//
// Un snapshot es inmutable una vez creado (sección 37 del encargo: "no
// sobrescribir investigaciones anteriores") -- createSnapshot con el mismo
// snapshotId es idempotente (devuelve el manifest existente), nunca lo
// reescribe. Snapshots futuros (snapshot-2026-09-30, etc.) coexisten sin
// pisarse -- sección 38: comparar 30d vs 90d vs históricos.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MI_ROOT } from './signalStore.js';

const SNAPSHOT_ID_PATTERN = /^snapshot-\d{4}-\d{2}-\d{2}$/;

function manifestPath(snapshotId) {
  return join(MI_ROOT, snapshotId, 'manifest.json');
}

/**
 * @param {string} snapshotId formato obligatorio "snapshot-YYYY-MM-DD".
 * @param {{researchReportPath: string, sourcesUsed?: string[], sourcesUnavailable?: string[], dataQualityNotes?: string|null}} fields
 */
export function createSnapshot(snapshotId, fields) {
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId ?? '')) {
    throw new Error(`createSnapshot: "snapshotId" debe seguir el patrón "snapshot-YYYY-MM-DD", recibido: "${snapshotId}".`);
  }
  const { researchReportPath, sourcesUsed = [], sourcesUnavailable = [], dataQualityNotes = null } = fields ?? {};
  if (!researchReportPath?.trim()) {
    throw new Error('createSnapshot: "researchReportPath" es obligatorio -- todo snapshot debe apuntar a su reporte de origen (trazabilidad, sección 51).');
  }

  mkdirSync(join(MI_ROOT, snapshotId), { recursive: true });
  const filePath = manifestPath(snapshotId);
  if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8')); // idempotente: mismo snapshotId, no se reescribe.

  const manifest = Object.freeze({
    snapshotId,
    researchReportPath,
    sourcesUsed: Object.freeze([...sourcesUsed]),
    sourcesUnavailable: Object.freeze([...sourcesUnavailable]),
    dataQualityNotes,
    createdAt: new Date().toISOString(),
  });
  writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

/** Recupera el manifest real de un snapshot -- lanza si no existe, nunca inventa uno. */
export function getSnapshotManifest(snapshotId) {
  const filePath = manifestPath(snapshotId);
  if (!existsSync(filePath)) throw new Error(`getSnapshotManifest: no existe ningún snapshot "${snapshotId}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** Lista todos los snapshotIds reales que tienen manifest guardado (para comparación histórica, sección 38). */
export function listSnapshots() {
  if (!existsSync(MI_ROOT)) return Object.freeze([]);
  return Object.freeze(readdirSync(MI_ROOT).filter((d) => existsSync(manifestPath(d))).sort());
}
