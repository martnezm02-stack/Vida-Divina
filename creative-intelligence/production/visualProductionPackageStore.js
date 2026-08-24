// visualProductionPackageStore.js — persistencia real de
// VisualProductionPackage. Mismo patrón que productionArtifactStore.js
// (identity-addressed por visualProductionPackageId, inmutable, DATA_ROOT
// compartido) -- ver ese archivo para la justificación completa del
// patrón, no repetida aquí.
//
// TRAZABILIDAD REAL (Parte 4/5 de esta fase): un VisualProductionPackage
// siempre referencia un productionArtifactId real (createVisualProductionPackage()
// lo exige). Este store verifica que ese ProductionArtifact YA esté
// guardado en productionArtifactStore.js antes de aceptar el paquete
// visual -- mismo espíritu que resolveRef() en
// creative-intelligence/orchestrator/cycleOrchestrator.js: una relación
// rota se rechaza explícitamente, nunca se guarda en silencio.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from '../orchestrator/cycleStore.js';
import { productionArtifactExists } from './productionArtifactStore.js';

export const VISUAL_PRODUCTION_PACKAGES_DIR = path.join(DATA_ROOT, 'visualProductionPackages');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function packagePath(visualProductionPackageId) {
  return path.join(VISUAL_PRODUCTION_PACKAGES_DIR, `${visualProductionPackageId}.json`);
}

/** Validación estructural -- igual criterio que productionArtifactStore.js: nunca reglas de compliance (ya corrieron en createVisualProductionPackage()), solo forma real + trazabilidad de la referencia a su ProductionArtifact. */
function assertValidShape(pkg) {
  if (!pkg?.visualProductionPackageId?.trim?.()) {
    throw new Error('visualProductionPackageStore: "visualProductionPackageId" es obligatorio y debe ser el id real ya generado por createVisualProductionPackage() -- este store nunca genera uno nuevo.');
  }
  if (pkg.status !== 'DRAFT_FOR_REVIEW') {
    throw new Error(`visualProductionPackageStore: "status" inesperado "${pkg.status}" -- createVisualProductionPackage() solo produce "DRAFT_FOR_REVIEW".`);
  }
  if (!pkg.productionArtifactId?.trim?.()) {
    throw new Error('visualProductionPackageStore: "productionArtifactId" es obligatorio -- todo VisualProductionPackage real referencia el ProductionArtifact del que viene.');
  }
  if (!pkg.assetType?.trim?.()) throw new Error('visualProductionPackageStore: "assetType" es obligatorio.');
  if (!pkg.createdAt?.trim?.()) throw new Error('visualProductionPackageStore: "createdAt" es obligatorio.');
}

/**
 * Guarda un VisualProductionPackage real. Rechaza si su
 * productionArtifactId no corresponde a ningún ProductionArtifact ya
 * guardado -- relación rota, nunca se persiste en silencio (trazabilidad
 * real, Parte 4). Inmutable una vez guardado, mismo criterio de
 * idempotencia por rechazo que productionArtifactStore.js.
 */
export function saveVisualProductionPackage(pkg) {
  assertValidShape(pkg);
  if (!productionArtifactExists(pkg.productionArtifactId)) {
    throw new Error(`saveVisualProductionPackage: "productionArtifactId" ("${pkg.productionArtifactId}") no corresponde a ningún ProductionArtifact guardado en productionArtifactStore -- relación rota. Guarda el ProductionArtifact real primero (ver productionArtifactStore.saveProductionArtifact()).`);
  }
  ensureDir(VISUAL_PRODUCTION_PACKAGES_DIR);
  const filePath = packagePath(pkg.visualProductionPackageId);
  if (fs.existsSync(filePath)) {
    throw new Error(`saveVisualProductionPackage: ya existe un VisualProductionPackage guardado con id "${pkg.visualProductionPackageId}" -- son inmutables una vez guardados.`);
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`saveVisualProductionPackage: ya existe un VisualProductionPackage guardado con id "${pkg.visualProductionPackageId}" (condición de carrera detectada por el filesystem).`);
    }
    throw err;
  }
  return Object.freeze({ visualProductionPackageId: pkg.visualProductionPackageId, path: filePath });
}

/** Recupera un VisualProductionPackage real ya guardado -- lanza si no existe, nunca inventa uno. */
export function getVisualProductionPackage(visualProductionPackageId) {
  const filePath = packagePath(visualProductionPackageId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`getVisualProductionPackage: no existe ningún VisualProductionPackage guardado con id "${visualProductionPackageId}".`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function visualProductionPackageExists(visualProductionPackageId) {
  return fs.existsSync(packagePath(visualProductionPackageId));
}

/** Lista resúmenes livianos de todos los VisualProductionPackage guardados. */
export function listVisualProductionPackages() {
  ensureDir(VISUAL_PRODUCTION_PACKAGES_DIR);
  const files = fs.readdirSync(VISUAL_PRODUCTION_PACKAGES_DIR).filter((f) => f.endsWith('.json'));
  const summaries = files.map((f) => {
    const p = JSON.parse(fs.readFileSync(path.join(VISUAL_PRODUCTION_PACKAGES_DIR, f), 'utf8'));
    return Object.freeze({
      visualProductionPackageId: p.visualProductionPackageId,
      productionArtifactId: p.productionArtifactId,
      creativeCellCandidateId: p.creativeCellCandidateId,
      variantId: p.variantId,
      assetType: p.assetType,
      status: p.status,
      createdAt: p.createdAt,
    });
  });
  summaries.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return Object.freeze(summaries);
}

/** Borra un VisualProductionPackage guardado (mismo criterio que deleteProductionArtifact — es un borrador descartable, no un registro histórico permanente). Nunca se invoca automáticamente desde el pipeline en esta fase. */
export function deleteVisualProductionPackage(visualProductionPackageId) {
  const filePath = packagePath(visualProductionPackageId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`deleteVisualProductionPackage: no existe ningún VisualProductionPackage guardado con id "${visualProductionPackageId}" -- nada que borrar.`);
  }
  fs.unlinkSync(filePath);
  return true;
}

/** Lista todos los VisualProductionPackage guardados que referencian un ProductionArtifact real específico -- proyección de trazabilidad (ProductionArtifact -> sus VisualProductionPackage), no un store nuevo. */
export function listVisualProductionPackagesByProductionArtifact(productionArtifactId) {
  return listVisualProductionPackages().filter((p) => p.productionArtifactId === productionArtifactId);
}
