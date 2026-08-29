// assetOverrideStore.js — Corrección "Normalizar Asset Registry" (2026-08-29,
// Paso 21/24/30 del encargo). Único propósito: recordar qué Final Outputs
// reales el usuario marcó ARCHIVED desde la vista de Assets -- sin tocar el
// archivo físico ni ningún store real existente (ProductionJob/
// EditableVideoProject/AssetLineage siguen intactos). Metadata pura,
// reversible, keyed por sourcePath real normalizado.
//
// Deliberadamente NO es un Asset Registry paralelo: no describe qué es un
// asset (eso lo sigue haciendo assetClassification.js a partir de los
// stores reales existentes), solo guarda un override explícito del usuario
// sobre un asset que ya existe.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Override de test (mismo patrón ya usado en productionJobStore.js/
// editableProjectStore.js/hypothesisBatchStore.js): aislar SOLO este store
// en un test nunca debe tocar los overrides reales del usuario.
const DATA_DIR = process.env.ASSET_OVERRIDE_DATA_ROOT
  ? path.resolve(process.env.ASSET_OVERRIDE_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
const OVERRIDES_PATH = path.join(DATA_DIR, 'assetOverrides.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizarPath(sourcePath) {
  return sourcePath ? String(sourcePath).toLowerCase() : sourcePath;
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureDir();
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function isArchived(sourcePath) {
  const data = readAll();
  return Boolean(data[normalizarPath(sourcePath)]?.archived);
}

/** Marca/desmarca ARCHIVED un asset real por su sourcePath -- nunca borra ni mueve el archivo. */
export function setArchived(sourcePath, archived) {
  if (!sourcePath?.trim()) throw new Error('assetOverrideStore.setArchived: "sourcePath" es obligatorio.');
  const data = readAll();
  const key = normalizarPath(sourcePath);
  if (archived) {
    data[key] = { sourcePath, archived: true, archivedAt: new Date().toISOString() };
  } else {
    delete data[key];
  }
  writeAll(data);
  return Object.freeze({ sourcePath, archived: Boolean(archived) });
}

/** Set real de paths (normalizados) marcados ARCHIVED -- usado por el clasificador para no reinventar el estado en cada consulta. */
export function listArchivedPaths() {
  const data = readAll();
  return new Set(Object.entries(data).filter(([, v]) => v?.archived).map(([k]) => k));
}
