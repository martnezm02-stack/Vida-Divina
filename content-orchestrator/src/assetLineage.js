// assetLineage.js — Content Generation Engine, lineage de assets
// derivados. Responde: ¿de qué video/foto salió este video?, ¿de qué
// ProductionArtifact/VisualProductionPackage?, ¿para qué plataforma?,
// ¿con qué operación? -- sin romper ProductionArtifactStore ni
// VisualProductionPackageStore (no los duplica, los referencia por id
// cuando aplica).
//
// PATRÓN: mismo criterio content-addressed que
// creative-intelligence/orchestrator/cycleStore.js#saveEvidenceSnapshot --
// un registro de lineage se direcciona por el hash real del archivo
// derivado (nunca un id inventado), así que guardar el mismo archivo dos
// veces con el mismo lineage es un no-op idempotente, nunca un duplicado.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Override exclusivamente para tests -- mismo criterio que
// CREATIVE_INTELLIGENCE_DATA_ROOT en cycleStore.js: sin la variable de
// entorno, el comportamiento por defecto es exactamente
// content-orchestrator/data/lineage (sin cambios).
export const DATA_ROOT = process.env.CONTENT_ORCHESTRATOR_DATA_ROOT
  ? join(process.env.CONTENT_ORCHESTRATOR_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
export const LINEAGE_DIR = join(DATA_ROOT, 'lineage');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/** Hash real de contenido de un archivo -- mismo idioma sha256 ya usado en assetRegistry.js/hyperframesRenderer.js, no una librería nueva. */
export function hashFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`hashFile: no existe el archivo real ${filePath}.`);
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function recordPath(derivedAssetId) {
  return join(LINEAGE_DIR, `${derivedAssetId}.json`);
}

/**
 * Registra la procedencia real de UN asset derivado (un MP4 de salida, una
 * composición, etc.). `derivedAssetId` debe ser el hash real del archivo
 * derivado (usar hashFile()) -- nunca un id inventado. Content-addressed:
 * si el mismo derivedAssetId ya tiene un registro, es un no-op (el mismo
 * archivo con el mismo lineage ya está documentado).
 *
 * @param {{
 *   derivedAssetId: string, derivedAssetPath: string,
 *   sourceAssetIds: string[], sourceAssetPaths: string[],
 *   operation: string, outputProfileName?: string|null,
 *   productionArtifactId?: string|null, visualProductionPackageId?: string|null,
 * }} args
 */
export function recordLineage({
  derivedAssetId, derivedAssetPath, sourceAssetIds, sourceAssetPaths, operation,
  outputProfileName = null, productionArtifactId = null, visualProductionPackageId = null,
}) {
  if (!derivedAssetId?.trim()) throw new Error('recordLineage: "derivedAssetId" es obligatorio (usar hashFile() sobre el archivo real derivado).');
  if (!Array.isArray(sourceAssetIds)) throw new Error('recordLineage: "sourceAssetIds" debe ser un arreglo (puede estar vacío solo si el asset no tiene fuente real, ej. un intro genérico).');
  if (!operation?.trim()) throw new Error('recordLineage: "operation" es obligatorio -- nunca se registra un lineage sin decir con qué operación se produjo.');

  ensureDir(LINEAGE_DIR);
  const filePath = recordPath(derivedAssetId);
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf8')); // idempotente: mismo contenido, mismo id, no se reescribe.
  }

  const record = Object.freeze({
    derivedAssetId,
    derivedAssetPath,
    sourceAssetIds: Object.freeze([...sourceAssetIds]),
    sourceAssetPaths: Object.freeze([...(sourceAssetPaths ?? [])]),
    operation,
    outputProfileName,
    productionArtifactId,
    visualProductionPackageId,
    createdAt: new Date().toISOString(),
  });
  writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

/** Recupera un registro de lineage real -- lanza si no existe, nunca inventa uno. */
export function getLineage(derivedAssetId) {
  const filePath = recordPath(derivedAssetId);
  if (!existsSync(filePath)) throw new Error(`getLineage: no existe ningún registro de lineage para "${derivedAssetId}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function lineageExists(derivedAssetId) {
  return existsSync(recordPath(derivedAssetId));
}

/** Lista TODOS los registros de lineage reales guardados -- usado por el dashboard (Operation Dashboard) para poblar la Biblioteca de Assets sin inventar ninguno. */
export function listAllLineage() {
  ensureDir(LINEAGE_DIR);
  const files = readdirSync(LINEAGE_DIR).filter((f) => f.endsWith('.json'));
  return Object.freeze(files.map((f) => JSON.parse(readFileSync(join(LINEAGE_DIR, f), 'utf8'))));
}

/**
 * Recorre la cadena de lineage real hacia atrás: derivedAssetId -> sus
 * sourceAssetIds -> los lineage de ESOS (si tienen registro propio) -> ...
 * hasta llegar a un asset sin registro de lineage (el origen real: una
 * fotografía o un audio que nunca fue "derivado" de otra cosa). Nunca
 * inventa un eslabón: si un sourceAssetId no tiene registro propio, la
 * cadena simplemente termina ahí (es un asset de origen, no un error).
 */
export function traceLineageChain(derivedAssetId) {
  const visitados = new Set();
  const cadena = [];

  function visitar(id) {
    if (visitados.has(id)) return; // evita ciclos, aunque no deberían existir en la práctica.
    visitados.add(id);
    if (!lineageExists(id)) {
      cadena.push({ assetId: id, isOrigin: true });
      return;
    }
    const record = getLineage(id);
    cadena.push({ assetId: id, isOrigin: false, operation: record.operation, outputProfileName: record.outputProfileName, productionArtifactId: record.productionArtifactId, visualProductionPackageId: record.visualProductionPackageId });
    for (const srcId of record.sourceAssetIds) visitar(srcId);
  }

  visitar(derivedAssetId);
  return Object.freeze(cadena);
}

/** Lista todos los registros de lineage reales que referencian un sourceAssetId dado -- "¿qué se derivó de este asset?" (proyección, no un store nuevo). */
export function listLineageBySourceAsset(sourceAssetId) {
  ensureDir(LINEAGE_DIR);
  const files = readdirSync(LINEAGE_DIR).filter((f) => f.endsWith('.json'));
  return Object.freeze(
    files
      .map((f) => JSON.parse(readFileSync(join(LINEAGE_DIR, f), 'utf8')))
      .filter((r) => r.sourceAssetIds.includes(sourceAssetId)),
  );
}
