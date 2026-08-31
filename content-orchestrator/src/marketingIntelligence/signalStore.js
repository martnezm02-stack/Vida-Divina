// signalStore.js — Marketing Intelligence: almacenamiento de señales por
// snapshot. Mismo patrón que ../assetLineage.js: DATA_ROOT overrideable
// por CONTENT_ORCHESTRATOR_DATA_ROOT para tests aislados, un archivo JSON
// por registro, nunca se inventa un registro que no exista en disco.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSignal } from './schema.js';

// Sin la variable de entorno, el comportamiento por defecto es exactamente
// content-orchestrator/data/marketing-intelligence/snapshots (sin cambios) --
// ese directorio está en .gitignore (content-orchestrator/data/), así que
// los JSON generados aquí son un artefacto regenerable (correr
// ingestMarketingIntelligenceSnapshot20260831.mjs), no la fuente de verdad
// versionada -- la fuente de verdad versionada es seedData/*.js.
export const DATA_ROOT = process.env.CONTENT_ORCHESTRATOR_DATA_ROOT
  ? join(process.env.CONTENT_ORCHESTRATOR_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const MI_ROOT = join(DATA_ROOT, 'marketing-intelligence', 'snapshots');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function signalsDir(snapshotId) {
  return join(MI_ROOT, snapshotId, 'signals');
}

function signalPath(snapshotId, signalId) {
  return join(signalsDir(snapshotId), `${signalId}.json`);
}

/** Crea SIEMPRE un registro nuevo -- usar upsertSignal() para deduplicación por título/tipo. */
export function saveSignal(snapshotId, fields) {
  if (!snapshotId?.trim()) throw new Error('saveSignal: "snapshotId" es obligatorio.');
  const signal = createSignal(fields);
  ensureDir(signalsDir(snapshotId));
  writeFileSync(signalPath(snapshotId, signal.id), JSON.stringify(signal, null, 2), 'utf8');
  return signal;
}

/**
 * Inserta o fusiona por dedupeKey (mismo type+title normalizado) dentro de
 * UN snapshot -- sección 32 del encargo: "si el mismo hallazgo aparece en
 * múltiples fuentes, no duplicarlo innecesariamente; registrar sourceCount
 * y fuentes independientes." Si ya existe una señal con el mismo
 * dedupeKey, incrementa sourceCount (y independentSourceCount si la nueva
 * fuente es independiente) en vez de crear un registro nuevo. Nunca eleva
 * evidenceLevel/confidence al fusionar -- eso sería inventar certeza.
 */
export function upsertSignal(snapshotId, fields, { additionalSourceIsIndependent = false } = {}) {
  if (!snapshotId?.trim()) throw new Error('upsertSignal: "snapshotId" es obligatorio.');
  const candidate = createSignal(fields);
  const existing = listSignals(snapshotId).find((s) => s.dedupeKey === candidate.dedupeKey);
  if (!existing) {
    ensureDir(signalsDir(snapshotId));
    writeFileSync(signalPath(snapshotId, candidate.id), JSON.stringify(candidate, null, 2), 'utf8');
    return candidate;
  }
  const nextIndependentCount = existing.independentSourceCount + (additionalSourceIsIndependent ? 1 : 0);
  const merged = Object.freeze({
    ...existing,
    sourceCount: existing.sourceCount + 1,
    independentSourceCount: nextIndependentCount,
    crossSourceConfirmed: nextIndependentCount >= 2,
    updatedAt: new Date().toISOString(),
  });
  writeFileSync(signalPath(snapshotId, existing.id), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

/** Recupera una señal real -- lanza si no existe, nunca inventa una. */
export function getSignal(snapshotId, signalId) {
  const filePath = signalPath(snapshotId, signalId);
  if (!existsSync(filePath)) throw new Error(`getSignal: no existe la señal "${signalId}" en el snapshot "${snapshotId}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** Lista TODAS las señales reales guardadas en un snapshot. */
export function listSignals(snapshotId) {
  const dir = signalsDir(snapshotId);
  if (!existsSync(dir)) return Object.freeze([]);
  return Object.freeze(
    readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))),
  );
}

/**
 * Consulta señales por combinación de filtros -- sección 36 del encargo,
 * ej. "¿qué tendencias recientes existen para Venus?". Proyección en
 * memoria sobre listSignals(), no un motor de consulta nuevo.
 */
export function querySignals(snapshotId, filters = {}) {
  const { type, productId, category, audience, sourceType, minConfidence, timeWindow, platform, tag } = filters;
  return Object.freeze(
    listSignals(snapshotId).filter((s) => (
      (type === undefined || s.type === type)
      && (productId === undefined || s.productId === productId)
      && (category === undefined || s.category === category)
      && (audience === undefined || s.audience === audience)
      && (sourceType === undefined || s.sourceType === sourceType)
      && (minConfidence === undefined || s.confidence >= minConfidence)
      && (timeWindow === undefined || s.timeWindow === timeWindow)
      && (platform === undefined || s.details?.platform === platform)
      && (tag === undefined || s.tags.includes(tag))
    )),
  );
}

/** Construye/reescribe index.json -- índice liviano para localizar señales sin cargar todas en memoria (sección 35). */
export function buildIndex(snapshotId) {
  const signals = listSignals(snapshotId);
  const index = {
    snapshotId,
    signalCount: signals.length,
    byType: {},
    byProduct: {},
    byCategory: {},
    byAudience: {},
    bySourceType: {},
    builtAt: new Date().toISOString(),
  };
  for (const s of signals) {
    index.byType[s.type] = (index.byType[s.type] ?? 0) + 1;
    if (s.productId) index.byProduct[s.productId] = (index.byProduct[s.productId] ?? 0) + 1;
    if (s.category) index.byCategory[s.category] = (index.byCategory[s.category] ?? 0) + 1;
    if (s.audience) index.byAudience[s.audience] = (index.byAudience[s.audience] ?? 0) + 1;
    index.bySourceType[s.sourceType] = (index.bySourceType[s.sourceType] ?? 0) + 1;
  }
  ensureDir(join(MI_ROOT, snapshotId));
  writeFileSync(join(MI_ROOT, snapshotId, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  return index;
}
