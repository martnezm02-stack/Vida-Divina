// workspaceStore.js — Corrección "Nueva Biblioteca de Producción Activa"
// (2026-08-29, Paso 4/17/18 del encargo). Único propósito: guardar un
// timestamp real (`productionWorkspaceStartedAt`) que marca el punto de
// referencia "desde aquí empieza mi biblioteca de producción real". Nunca
// borra, mueve ni modifica ningún asset/job/proyecto -- assetClassification.js
// lo consume como dato de solo lectura para calcular `visibilityScope`, sin
// tocar ningún timestamp original.
//
// Metadata pura, mismo patrón de archivo real que assetOverrideStore.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Override de test (mismo patrón que assetOverrideStore.js/productionJobStore.js).
const DATA_DIR = process.env.WORKSPACE_DATA_ROOT
  ? path.resolve(process.env.WORKSPACE_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
const WORKSPACE_PATH = path.join(DATA_DIR, 'productionWorkspace.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(WORKSPACE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(WORKSPACE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Timestamp real ya guardado, o null si nunca se inició una Biblioteca de Producción Activa. */
export function getWorkspaceStartedAt() {
  return readAll().productionWorkspaceStartedAt ?? null;
}

/** Paso 18 del encargo: "no sobrescribirlo accidentalmente" -- lanzado cuando ya existe un reset real y se reintenta sin `force`. */
export class WorkspaceAlreadyStartedError extends Error {
  constructor(existing) {
    super(`workspaceStore.startNewProductionWorkspace: ya existe una Biblioteca de Producción Activa real iniciada el ${existing} -- pasa { force: true } para reiniciarla intencionalmente (esto NO borra ni modifica ningún asset/job/proyecto existente, solo mueve el punto de referencia).`);
    this.name = 'WorkspaceAlreadyStartedError';
    this.existing = existing;
  }
}

/**
 * Crea (o, con `force`, reemplaza) el punto de referencia real. NUNCA toca
 * ningún archivo/asset/job/proyecto -- solo guarda un timestamp propio.
 * @returns {string} el `productionWorkspaceStartedAt` real (ISO) ya guardado.
 */
export function startNewProductionWorkspace({ force = false } = {}) {
  const existing = getWorkspaceStartedAt();
  if (existing && !force) throw new WorkspaceAlreadyStartedError(existing);
  ensureDir();
  const startedAt = new Date().toISOString();
  fs.writeFileSync(WORKSPACE_PATH, JSON.stringify({ productionWorkspaceStartedAt: startedAt }, null, 2), 'utf8');
  return startedAt;
}
