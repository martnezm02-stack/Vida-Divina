// hypothesisBatchStore.js — persistencia real de lotes (Batches) de
// hipótesis creativas generadas por content-orchestrator/src/
// hypothesisCreativeEngine.js#buildHypothesisExperiment(). Antes de esta
// fase, cada llamada a "Sugerir variantes" era efectivamente stateless:
// mismo productId + mismo variantCount siempre devolvía exactamente las
// mismas 3-5 variantes (selectVariantBlueprints() hace slice(0, count)
// sobre un arreglo fijo, sin memoria de llamadas previas) — root cause
// real de "genero variantes, no me gustan, vuelvo a pulsar, salen las
// mismas". Este store da a una campaña (hoy: productId) memoria real
// entre llamadas, para que cada Batch nuevo pueda pedir variantes NO
// vistas todavía.
//
// PATRÓN REUTILIZADO, NO DUPLICADO: mismo criterio de
// creative-intelligence/production/productionArtifactStore.js — mismo
// DATA_ROOT (orchestrator/cycleStore.js), direccionado por identidad
// (batchId), inmutable una vez guardado (escritura exclusiva 'wx', nunca
// sobrescribe).

import fs from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from '../orchestrator/cycleStore.js';

// Override INDEPENDIENTE de DATA_ROOT (deliberado): DATA_ROOT es compartido
// por cycles/evidence/productionArtifacts/visualProductionPackages -- un
// test que aísla DATA_ROOT completo (ej. CREATIVE_INTELLIGENCE_DATA_ROOT en
// un test del Dashboard) aislaría TAMBIÉN los CreativeCells reales que
// campaignMode.js necesita leer, rompiendo esos tests sin relación alguna
// con Batches. HYPOTHESIS_BATCH_DATA_ROOT permite aislar SOLO el store de
// Batches (ej. en tests) sin tocar el resto de Creative Intelligence.
export const HYPOTHESIS_BATCHES_DIR = process.env.HYPOTHESIS_BATCH_DATA_ROOT
  ? path.join(path.resolve(process.env.HYPOTHESIS_BATCH_DATA_ROOT), 'hypothesisBatches')
  : path.join(DATA_ROOT, 'hypothesisBatches');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function batchPath(batchId) {
  return path.join(HYPOTHESIS_BATCHES_DIR, `${batchId}.json`);
}

function assertValidShape(batch) {
  if (!batch?.batchId?.trim?.()) throw new Error('hypothesisBatchStore: "batchId" es obligatorio.');
  if (!batch.campaignId?.trim?.()) throw new Error('hypothesisBatchStore: "campaignId" es obligatorio.');
  if (!Number.isInteger(batch.batchNumber) || batch.batchNumber < 1) throw new Error('hypothesisBatchStore: "batchNumber" debe ser un entero >= 1.');
  if (!batch.generationId?.trim?.()) throw new Error('hypothesisBatchStore: "generationId" es obligatorio.');
  if (!Array.isArray(batch.fingerprints) || batch.fingerprints.length === 0) throw new Error('hypothesisBatchStore: "fingerprints" debe ser un arreglo no vacío (uno por variante real del batch).');
  if (!batch.createdAt?.trim?.()) throw new Error('hypothesisBatchStore: "createdAt" es obligatorio.');
}

/** Guarda un Batch real, inmutable una vez guardado (mismo criterio que productionArtifactStore.js). */
export function saveBatch(batch) {
  assertValidShape(batch);
  ensureDir(HYPOTHESIS_BATCHES_DIR);
  const filePath = batchPath(batch.batchId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(batch, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`saveBatch: ya existe un Batch guardado con id "${batch.batchId}" -- son inmutables. Un Batch nuevo requiere un batchId nuevo.`);
    }
    throw err;
  }
  return Object.freeze({ batchId: batch.batchId, path: filePath });
}

export function getBatch(batchId) {
  const filePath = batchPath(batchId);
  if (!fs.existsSync(filePath)) throw new Error(`getBatch: no existe ningún Batch guardado con id "${batchId}".`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Lista los Batches reales de una campaña (hoy: productId), ordenados por batchNumber ascendente -- nunca inventa un batch. */
export function listBatchesForCampaign(campaignId) {
  if (!campaignId?.trim?.()) throw new Error('listBatchesForCampaign: "campaignId" es obligatorio.');
  ensureDir(HYPOTHESIS_BATCHES_DIR);
  const files = fs.readdirSync(HYPOTHESIS_BATCHES_DIR).filter((f) => f.endsWith('.json'));
  const batches = files
    .map((f) => JSON.parse(fs.readFileSync(path.join(HYPOTHESIS_BATCHES_DIR, f), 'utf8')))
    .filter((b) => b.campaignId === campaignId);
  batches.sort((a, b) => a.batchNumber - b.batchNumber);
  return Object.freeze(batches);
}

/**
 * Estado real acumulado de una campaña, derivado de sus Batches ya
 * guardados -- lo que hypothesisCreativeEngine.js necesita para que el
 * PRÓXIMO batch explore combinaciones nuevas y rechace duplicados reales:
 *   - nextBatchNumber: 1 si la campaña nunca generó nada.
 *   - blueprintOffset: cuántas variantes ya se generaron en total (avanza
 *     el puntero determinista de selectBlueprintRange()).
 *   - usedFingerprints: unión real de fingerprints de TODAS las variantes
 *     ya mostradas en esta campaña, sin importar el batch.
 */
export function getCampaignBatchState(campaignId) {
  const batches = listBatchesForCampaign(campaignId);
  const usedFingerprints = new Set();
  let blueprintOffset = 0;
  for (const batch of batches) {
    for (const fp of batch.fingerprints) usedFingerprints.add(fp);
    blueprintOffset += batch.variantCount ?? batch.fingerprints.length;
  }
  return Object.freeze({
    nextBatchNumber: batches.length + 1,
    blueprintOffset,
    usedFingerprints,
    previousBatches: batches,
  });
}
