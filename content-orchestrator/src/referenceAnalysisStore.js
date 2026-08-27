// referenceAnalysisStore.js — Adaptar contenido / Video de referencia
// (2026-08-26). Persiste el ReferenceAnalysis real, content-addressed por
// el hash real del archivo de video (mismo criterio ya usado en
// assetLineage.js) -- reanalizar el MISMO video real es un no-op: se
// reutiliza el análisis ya persistido (regla 11 del encargo), nunca se
// vuelve a correr ffmpeg/ffprobe innecesariamente. Mismo patrón de
// store JSON-por-id ya usado en todo el proyecto (hypothesisBatchStore.js,
// editableProjectStore.js) -- ninguna base de datos nueva.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = process.env.CONTENT_ORCHESTRATOR_DATA_ROOT
  ? join(process.env.CONTENT_ORCHESTRATOR_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
export const REFERENCE_ANALYSIS_DIR = join(DATA_ROOT, 'referenceAnalysis');

function ensureDir() {
  mkdirSync(REFERENCE_ANALYSIS_DIR, { recursive: true });
}

function recordPath(referenceId) {
  return join(REFERENCE_ANALYSIS_DIR, `${referenceId}.json`);
}

/** Guarda (o sobrescribe -- idempotente, mismo referenceId real produce el mismo análisis real) un ReferenceAnalysis real. */
export function saveReferenceAnalysis(analysis) {
  if (!analysis?.referenceId?.trim()) throw new Error('saveReferenceAnalysis: "referenceId" es obligatorio.');
  ensureDir();
  writeFileSync(recordPath(analysis.referenceId), JSON.stringify(analysis, null, 2), 'utf8');
  return analysis;
}

/** Recupera un ReferenceAnalysis real ya persistido -- null si nunca se analizó este video real (nunca inventa uno). */
export function getReferenceAnalysis(referenceId) {
  const p = recordPath(referenceId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function referenceAnalysisExists(referenceId) {
  return existsSync(recordPath(referenceId));
}

/** Todos los ReferenceAnalysis reales ya persistidos -- usado por el Dashboard para listar referencias ya analizadas sin volver a procesarlas. */
export function listReferenceAnalyses() {
  ensureDir();
  return Object.freeze(
    readdirSync(REFERENCE_ANALYSIS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(REFERENCE_ANALYSIS_DIR, f), 'utf8'))),
  );
}
