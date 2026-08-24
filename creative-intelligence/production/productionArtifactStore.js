// productionArtifactStore.js — persistencia real de ProductionArtifact
// (Fase "Persistencia de Production Artifacts y Visual Production
// Packages"). Antes de esta fase, un ProductionArtifact solo vivía en
// memoria del proceso que llamaba a createProductionArtifact() — se perdía
// al terminar el proceso, exactamente el mismo problema que cycleStore.js
// resolvió para los ciclos de Creative Intelligence.
//
// PATRÓN REUTILIZADO, NO DUPLICADO: mismo criterio de direccionamiento que
// orchestrator/cycleStore.js — identity-addressed por productionArtifactId
// (un id real ya generado por createProductionArtifact()), inmutable una
// vez guardado (escritura exclusiva 'wx', nunca sobrescribe), y el mismo
// DATA_ROOT (reutilizado por import, no reimplementado) para que todo lo
// que persiste Creative Intelligence viva bajo la misma raíz de datos.
//
// VALIDACIÓN EN ESTE STORE (deliberadamente distinta de
// validateProductionArtifact() de creativeProductionArtifact.js): esa
// función revalida TODAS las reglas de negocio, incluyendo los guards de
// compliance, y por eso exige "riskyClaims" de nuevo -- exactamente el
// mismo insumo externo que ya se usó una vez al construir el artefacto
// (createProductionArtifact ya lo aplicó, y el objeto resultante está
// congelado/inmutable). Igual que cycleOutput.schema.js separa
// createCycleOutput() (validación completa, con guards) de
// assertValidShape() (validación estructural, sin insumos externos, la
// que cycleStore.saveCycle() realmente usa), este store valida solo FORMA
// -- nunca reconstruye ni relaja los guards de compliance, que ya
// corrieron una vez y no necesitan volver a correr sobre un objeto
// congelado que no cambió.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from '../orchestrator/cycleStore.js';

export const PRODUCTION_ARTIFACTS_DIR = path.join(DATA_ROOT, 'productionArtifacts');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function artifactPath(productionArtifactId) {
  return path.join(PRODUCTION_ARTIFACTS_DIR, `${productionArtifactId}.json`);
}

/** Validación estructural -- NUNCA reglas de compliance (esas ya corrieron en createProductionArtifact(), sobre un objeto que llega aquí ya congelado). Solo confirma que lo que se va a persistir tiene la forma real de un ProductionArtifact, para no guardar basura ni un objeto a medio construir. */
function assertValidShape(artifact) {
  if (!artifact?.productionArtifactId?.trim?.()) {
    throw new Error('productionArtifactStore: "productionArtifactId" es obligatorio y debe ser el id real ya generado por createProductionArtifact() -- este store nunca genera uno nuevo.');
  }
  if (artifact.status !== 'DRAFT_FOR_REVIEW') {
    throw new Error(`productionArtifactStore: "status" inesperado "${artifact.status}" -- createProductionArtifact() solo produce "DRAFT_FOR_REVIEW"; un valor distinto indica un objeto que no vino de ese constructor real.`);
  }
  if (!artifact.creativeCellCandidateId?.trim?.()) throw new Error('productionArtifactStore: "creativeCellCandidateId" es obligatorio.');
  if (!artifact.hypothesisRef?.trim?.()) throw new Error('productionArtifactStore: "hypothesisRef" es obligatorio.');
  if (!artifact.createdAt?.trim?.()) throw new Error('productionArtifactStore: "createdAt" es obligatorio.');
  if (!Array.isArray(artifact.variants) || artifact.variants.length < 2) {
    throw new Error('productionArtifactStore: "variants" debe tener al menos 2 entradas reales (mismo requisito que createProductionArtifact()).');
  }
}

/**
 * Guarda un ProductionArtifact real. Inmutable una vez guardado -- un
 * segundo intento con el mismo productionArtifactId lanza, nunca
 * sobrescribe (idempotencia por rechazo explícito, mismo criterio que
 * cycleStore.saveCycle()).
 */
export function saveProductionArtifact(artifact) {
  assertValidShape(artifact);
  ensureDir(PRODUCTION_ARTIFACTS_DIR);
  const filePath = artifactPath(artifact.productionArtifactId);
  if (fs.existsSync(filePath)) {
    throw new Error(`saveProductionArtifact: ya existe un ProductionArtifact guardado con id "${artifact.productionArtifactId}" -- son inmutables una vez guardados. Un ProductionArtifact nuevo requiere un productionArtifactId nuevo (uno por llamada real a createProductionArtifact()).`);
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`saveProductionArtifact: ya existe un ProductionArtifact guardado con id "${artifact.productionArtifactId}" (condición de carrera detectada por el filesystem) -- son inmutables.`);
    }
    throw err;
  }
  return Object.freeze({ productionArtifactId: artifact.productionArtifactId, path: filePath });
}

/** Recupera un ProductionArtifact real ya guardado -- lanza si no existe, nunca inventa uno. */
export function getProductionArtifact(productionArtifactId) {
  const filePath = artifactPath(productionArtifactId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`getProductionArtifact: no existe ningún ProductionArtifact guardado con id "${productionArtifactId}".`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function productionArtifactExists(productionArtifactId) {
  return fs.existsSync(artifactPath(productionArtifactId));
}

/** Lista resúmenes livianos (no el payload completo) de todos los ProductionArtifact guardados -- mismo criterio que cycleStore.listCycles(). */
export function listProductionArtifacts() {
  ensureDir(PRODUCTION_ARTIFACTS_DIR);
  const files = fs.readdirSync(PRODUCTION_ARTIFACTS_DIR).filter((f) => f.endsWith('.json'));
  const summaries = files.map((f) => {
    const a = JSON.parse(fs.readFileSync(path.join(PRODUCTION_ARTIFACTS_DIR, f), 'utf8'));
    return Object.freeze({
      productionArtifactId: a.productionArtifactId,
      creativeCellCandidateId: a.creativeCellCandidateId,
      hypothesisRef: a.hypothesisRef,
      commercialObjective: a.commercialObjective,
      format: a.format,
      status: a.status,
      createdAt: a.createdAt,
    });
  });
  summaries.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return Object.freeze(summaries);
}

/**
 * Borra un ProductionArtifact guardado. A diferencia de los Cycles
 * (registro histórico de razonamiento estratégico, permanente por
 * diseño), un ProductionArtifact es un borrador de producción
 * (`DRAFT_FOR_REVIEW`) que un humano puede legítimamente descartar antes
 * de usarlo -- por eso este store sí ofrece delete, a diferencia de
 * cycleStore.js. Nunca se invoca automáticamente desde el resto del
 * pipeline en esta fase.
 */
export function deleteProductionArtifact(productionArtifactId) {
  const filePath = artifactPath(productionArtifactId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`deleteProductionArtifact: no existe ningún ProductionArtifact guardado con id "${productionArtifactId}" -- nada que borrar.`);
  }
  fs.unlinkSync(filePath);
  return true;
}
