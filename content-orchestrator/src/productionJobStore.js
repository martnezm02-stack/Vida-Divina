// productionJobStore.js — Editable Video Project (2026-08-24).
//
// Antes de esta fase, produceCreative() (creativeProductionOrchestrator.js)
// devolvía un ProductionJob real solo en la respuesta HTTP -- nunca se
// persistía. Eso hacía imposible construir un proyecto editable sobre un
// job ya producido: no había forma de "volver a abrirlo" después de la
// respuesta original. Este store guarda el ProductionJob real, direccionado
// por IDENTIDAD (productionJobId), inmutable una vez guardado -- mismo
// criterio que hypothesisBatchStore.js/cycleStore.js: un ProductionJob ya
// producido es un hecho histórico real, nunca se reescribe (las ediciones
// viven en editableVideoProject.js/editableProjectStore.js, en capas por
// encima de este hecho inmutable).
//
// DATA_ROOT propio e independiente (mismo motivo ya documentado en
// hypothesisBatchStore.js): aislar este store en un test nunca debe aislar
// datos reales de otro store no relacionado.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_JOBS_DIR = process.env.PRODUCTION_JOB_DATA_ROOT
  ? path.join(path.resolve(process.env.PRODUCTION_JOB_DATA_ROOT), 'productionJobs')
  : fileURLToPath(new URL('../data/productionJobs', import.meta.url));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function jobPath(productionJobId) {
  return path.join(PRODUCTION_JOBS_DIR, `${productionJobId}.json`);
}

/**
 * Guarda un ProductionJob real (resultado de produceCreative()) junto con
 * el `projectDir` real usado para producirlo -- imprescindible para que
 * editableVideoProject.js pueda localizar los clips reales por-escena
 * (scene-N/proj.mp4, scene-N-audio.wav) que produceCreative() ya escribió
 * en disco pero no expone en su valor de retorno.
 */
export function saveProductionJob({ job, projectDir, productionJobId = randomUUID() }) {
  if (!job?.status) throw new Error('saveProductionJob: "job" debe ser un ProductionJob real (con "status").');
  if (!projectDir?.trim()) throw new Error('saveProductionJob: "projectDir" es obligatorio -- sin él no se pueden localizar los clips reales por-escena.');
  ensureDir(PRODUCTION_JOBS_DIR);
  const record = { productionJobId, projectDir, job, createdAt: new Date().toISOString() };
  const filePath = jobPath(productionJobId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`saveProductionJob: ya existe un ProductionJob guardado con id "${productionJobId}" -- son inmutables.`);
    throw err;
  }
  return Object.freeze({ productionJobId, path: filePath });
}

export function getProductionJob(productionJobId) {
  const filePath = jobPath(productionJobId);
  if (!fs.existsSync(filePath)) throw new Error(`getProductionJob: no existe ningún ProductionJob guardado con id "${productionJobId}".`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
