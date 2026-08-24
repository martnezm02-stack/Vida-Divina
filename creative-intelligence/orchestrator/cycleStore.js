// cycleStore.js — Persistencia basada en archivo para ciclos del Creative
// Intelligence Orchestrator (Fase: primera etapa del Orchestrator,
// autorizada explícitamente — solo persistencia, NUNCA reglas de negocio).
//
// Resuelve el hallazgo central de la auditoría previa: los ciclos de
// Creative Intelligence ejecutados hasta ahora vivieron únicamente en
// scratchpad de sesión (fuera del repositorio, no reejecutables, perdidos
// al cerrar la conversación). Este archivo los hace persistentes,
// recuperables y auditables sin depender de la conversación con Claude.
//
// Sin PostgreSQL, sin CRM, sin red — mismo patrón de persistencia por
// archivo ya usado en este proyecto (viral-content-intelligence/data/
// intelligence/*.jsonl, content-strategy/exports/phase16/*.json), y mismo
// idioma de resolución de rutas ya usado en simulator/src/contextoStorage.js
// (path.dirname(fileURLToPath(import.meta.url)) + path.resolve).
//
// Dos estrategias de direccionamiento, deliberadamente distintas:
//   - Cycles: direccionados por IDENTIDAD (cycleId) — inmutables una vez
//     escritos; un segundo intento de guardar el mismo cycleId lanza en
//     vez de sobrescribir en silencio (regla explícita de esta fase).
//   - Evidence snapshots: direccionados por CONTENIDO (hash SHA-256 del
//     evidenceBatch, mismo criterio que el campo `content_version` ya
//     usado en content-strategy/exports/phase16/human_review_record.json)
//     — guardar el mismo contenido dos veces es un no-op idempotente, no
//     una pérdida de historia, porque el contenido (y por tanto el
//     archivo) es exactamente el mismo.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCycleOutput, validateCycleOutput } from '../schemas/cycleOutput.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// Override exclusivamente para tests (ver test/cycleStore.test.js) — así
// la suite nunca escribe ciclos/evidencia de prueba dentro del data/ real
// del paquete, que está pensado para persistir ciclos reales. Sin la
// variable de entorno, el comportamiento por defecto es exactamente
// creative-intelligence/data/ (sin cambios).
export const DATA_ROOT = process.env.CREATIVE_INTELLIGENCE_DATA_ROOT
  ? path.resolve(process.env.CREATIVE_INTELLIGENCE_DATA_ROOT)
  : path.join(PACKAGE_ROOT, 'data');
export const CYCLES_DIR = path.join(DATA_ROOT, 'cycles');
export const EVIDENCE_DIR = path.join(DATA_ROOT, 'evidence');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cyclePath(cycleId) {
  return path.join(CYCLES_DIR, `${cycleId}.json`);
}

function evidencePath(hash) {
  return path.join(EVIDENCE_DIR, `${hash}.json`);
}

// ---------------------------------------------------------------------
// Evidence snapshots — direccionados por contenido (hash).
// ---------------------------------------------------------------------

/**
 * Hash reproducible de un evidenceBatch — mismo evidenceBatch (mismo
 * contenido, sin importar el orden de generación) produce siempre el
 * mismo hash. Serialización canónica simple (JSON.stringify de un
 * arreglo ya en el orden que el llamador proveyó) — no se reordena ni se
 * normaliza más allá de eso, para mantener el hash predecible y auditable
 * a simple vista.
 */
export function computeEvidenceSnapshotHash(evidenceBatch) {
  if (!Array.isArray(evidenceBatch) || evidenceBatch.length === 0) {
    throw new Error('computeEvidenceSnapshotHash: se requiere un "evidenceBatch" real con al menos 1 entrada.');
  }
  const canonical = JSON.stringify(evidenceBatch);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Guarda un evidenceBatch de forma inmutable, direccionado por su propio
 * contenido. Si el mismo contenido ya fue guardado antes, es un no-op
 * (mismo hash → mismo archivo → nada que perder); nunca sobrescribe un
 * archivo existente con contenido distinto porque, por construcción, un
 * hash distinto siempre apunta a un archivo distinto.
 */
export function saveEvidenceSnapshot(evidenceBatch) {
  const hash = computeEvidenceSnapshotHash(evidenceBatch);
  ensureDir(EVIDENCE_DIR);
  const filePath = evidencePath(hash);
  if (!fs.existsSync(filePath)) {
    const record = { hash, savedAt: new Date().toISOString(), evidenceBatch };
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
  }
  return Object.freeze({ hash, path: filePath });
}

/** Recupera un evidence snapshot real por hash — lanza si no existe (nunca devuelve un snapshot inventado). */
export function getEvidenceSnapshot(hash) {
  const filePath = evidencePath(hash);
  if (!fs.existsSync(filePath)) {
    throw new Error(`getEvidenceSnapshot: no existe ningún evidence snapshot con hash "${hash}".`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function evidenceSnapshotExists(hash) {
  return fs.existsSync(evidencePath(hash));
}

// ---------------------------------------------------------------------
// Cycles — direccionados por identidad (cycleId), inmutables.
// ---------------------------------------------------------------------

/**
 * Guarda un CycleOutput. Valida contra el schema (incluye el guard
 * anti-WINNER) antes de tocar disco. Lanza si el cycleId ya existe —
 * nunca sobrescribe historia en silencio; una nueva versión requiere un
 * nuevo cycleId (o un nuevo ciclo que referencie al anterior vía
 * `previousCycleId` en su CycleInput, capa que no se implementa en esta
 * fase).
 */
export function saveCycle(cycleOutput) {
  validateCycleOutput(cycleOutput);
  ensureDir(CYCLES_DIR);
  const filePath = cyclePath(cycleOutput.cycleId);
  if (fs.existsSync(filePath)) {
    throw new Error(`saveCycle: ya existe un ciclo guardado con cycleId "${cycleOutput.cycleId}" — los ciclos son inmutables una vez guardados. Genera un cycleId nuevo para una nueva versión.`);
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(cycleOutput, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`saveCycle: ya existe un ciclo guardado con cycleId "${cycleOutput.cycleId}" (condición de carrera detectada por el filesystem) — los ciclos son inmutables.`);
    }
    throw err;
  }
  return Object.freeze({ cycleId: cycleOutput.cycleId, path: filePath });
}

/** Recupera un CycleOutput real ya guardado — lanza si no existe (nunca inventa un ciclo). */
export function getCycle(cycleId) {
  const filePath = cyclePath(cycleId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`getCycle: no existe ningún ciclo guardado con cycleId "${cycleId}".`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function cycleExists(cycleId) {
  return fs.existsSync(cyclePath(cycleId));
}

/** Lista todos los ciclos guardados — resumen liviano (no el payload completo), ordenado por generatedAt ascendente. */
export function listCycles() {
  ensureDir(CYCLES_DIR);
  const files = fs.readdirSync(CYCLES_DIR).filter((f) => f.endsWith('.json'));
  const summaries = files.map((f) => {
    const cycle = JSON.parse(fs.readFileSync(path.join(CYCLES_DIR, f), 'utf8'));
    return Object.freeze({
      cycleId: cycle.cycleId,
      generatedAt: cycle.generatedAt,
      evidenceSnapshotHash: cycle.evidenceSnapshotRef?.hash ?? null,
      priorityCreativeCellCount: cycle.priorityCreativeCells?.length ?? 0,
    });
  });
  summaries.sort((a, b) => (a.generatedAt < b.generatedAt ? -1 : a.generatedAt > b.generatedAt ? 1 : 0));
  return Object.freeze(summaries);
}

/**
 * Proyección de solo lectura: "¿qué estrategia usó este ciclo?" — extrae
 * personas/pains/angles/formatDecisions/strategyMap directamente del
 * CycleOutput ya guardado. No se persiste por separado (duplicaría el
 * mismo dato dos veces); es una vista, no un store nuevo.
 */
export function getStrategySnapshot(cycleId) {
  const cycle = getCycle(cycleId);
  return Object.freeze({
    cycleId: cycle.cycleId,
    personas: cycle.personas,
    subPersonaDecisions: cycle.subPersonaDecisions,
    pains: cycle.pains,
    angles: cycle.angles,
    emptyCells: cycle.emptyCells,
    formatDecisions: cycle.formatDecisions,
    andromedaReport: cycle.andromedaReport,
    strategyMap: cycle.strategyMap,
  });
}

/**
 * Ensambla evidenceBatch → hash → snapshot guardado → CycleOutput
 * completo → guardado. Conveniencia sobre las funciones de arriba para
 * el caso de uso más común ("tengo un CycleInput ya construido y las
 * entidades que produjo una etapa futura, guarda el ciclo completo") —
 * no reemplaza createCycleOutput() (schemas/cycleOutput.schema.js), solo
 * encadena guardar-evidencia + guardar-ciclo en un solo paso.
 */
export function saveCycleWithEvidence(evidenceBatch, cycleOutputFields) {
  const snapshotRef = saveEvidenceSnapshot(evidenceBatch);
  const cycleOutput = createCycleOutput({ ...cycleOutputFields, evidenceSnapshotRef: snapshotRef });
  return saveCycle(cycleOutput);
}
