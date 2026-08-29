// assetClassification.js — Corrección "Normalizar Asset Registry y Dashboard
// Assets" (2026-08-29). Extiende el Asset Registry EXISTENTE de la vista
// Assets del Dashboard (productionLibrary.js#listFinalOutputsWithLineage +
// library.js#handleAssets) -- no crea un registro paralelo. Este módulo solo
// CORRELACIONA lo que esos módulos ya devuelven contra los stores reales que
// ya existían antes de esta fase (ProductionJobStore, EditableProjectStore,
// HypothesisBatchStore, ScheduledPublicationStore, AssetLineage), y produce
// metadata de clasificación (assetType/assetStatus/origin/productId/
// campaignId/projectId/productionJobId/versionNumber/displayName).
//
// REGLA CENTRAL (igual que en las dos fases de limpieza previas de este
// mismo proyecto): nunca se infiere origin/status por similitud, antigüedad,
// nombre "que parece de prueba" o timestamp. Solo evidencia objetiva real:
//   - batchId/ruta con el literal "real-e2e" (convención propia y ya
//     verificada de los scripts E2E de este proyecto) -> TEST.
//   - Existe un registro REAL en ProductionJobStore/EditableProjectStore
//     para ese archivo -> PRODUCTION (solo el pipeline real
//     /api/create/produce y projects.js#handleRenderProject escriben en
//     esos stores -- los tests aislados usan DATA_ROOT propio vía env vars,
//     nunca el store real; ver ARCHITECTURE_v1.md).
//   - Ninguna evidencia real -> UNKNOWN (nunca se fuerza a PRODUCTION o TEST).

import { listAllProductionJobs } from '../../../content-orchestrator/src/productionJobStore.js';
import { listAllProjects } from '../../../content-orchestrator/src/editableProjectStore.js';
import { getBatch } from '../../../creative-intelligence/src/hypothesisBatchStore.js';
import { buildDisplayName, humanizeConceptId } from '../../../content-orchestrator/src/displayName.js';
import * as scheduledPublicationStore from '../../../publishing-scheduler/src/scheduledPublicationStore.js';
import { listArchivedPaths } from './assetOverrideStore.js';

export const ASSET_TYPES = Object.freeze(['VIDEO', 'PHOTO', 'AUDIO']);
export const ASSET_STATUSES = Object.freeze(['EDITING', 'GENERATED', 'FINAL_APPROVED', 'ARCHIVED']);
export const ASSET_ORIGINS = Object.freeze(['PRODUCTION', 'TEST', 'CATALOG', 'UPLOAD', 'SYSTEM', 'UNKNOWN']);

function norm(p) {
  return p ? String(p).toLowerCase() : p;
}

// Única convención real y auto-declarada de "esto es una prueba E2E" ya
// verificada forensicamente en las dos fases de limpieza de este proyecto
// (batchId literal "real-e2e-..." fabricado a mano por los scripts de test,
// nunca generado por el pipeline real). No es una heurística de similitud:
// es la firma textual que los propios scripts de test escriben.
function esRutaOBatchDePrueba({ batchId, projectDir }) {
  if (typeof batchId === 'string' && /real-e2e/i.test(batchId)) return true;
  if (typeof projectDir === 'string' && /real-e2e/i.test(projectDir)) return true;
  return false;
}

function getCachedBatch(cache, batchId) {
  if (!batchId) return null;
  if (cache.has(batchId)) return cache.get(batchId);
  let batch = null;
  try {
    batch = getBatch(batchId);
  } catch {
    batch = null;
  }
  cache.set(batchId, batch);
  return batch;
}

/**
 * Construye, una sola vez por request, un índice real path -> metadata a
 * partir de TODOS los ProductionJob y EditableVideoProject ya persistidos.
 * Los EditableVideoProject se procesan DESPUÉS (sobrescriben) porque son la
 * fuente más rica y más actual para un archivo que ya fue abierto en el
 * editor -- ya traen projectId, versionNumber real y, desde v2 en adelante,
 * displayName ya construido por projects.js con este mismo buildDisplayName
 * (nunca se recalcula un valor que ya existe real -- Paso 8 del encargo).
 */
function buildPathIndex() {
  const index = new Map();
  const batchCache = new Map();
  const jobsById = new Map();

  for (const record of listAllProductionJobs()) {
    jobsById.set(record.productionJobId, record.job);
    const job = record.job;
    const batch = getCachedBatch(batchCache, job.batchId);
    const esPrueba = esRutaOBatchDePrueba({ batchId: job.batchId, projectDir: record.projectDir });
    const base = {
      productionJobId: record.productionJobId,
      projectId: null,
      campaignId: job.campaignId ?? null,
      batchId: job.batchId ?? null,
      productId: batch?.product?.productId ?? null,
      nombreVisible: batch?.product?.nombreVisible ?? null,
      nombreComercial: batch?.product?.nombreComercial ?? null,
      versionNumber: 1,
      origin: esPrueba ? 'TEST' : 'PRODUCTION',
      originEvidence: esPrueba
        ? 'batchId/ruta con literal "real-e2e" (script E2E auto-declarado).'
        : 'ProductionJob real persistido por el pipeline real (/api/create/produce) -- los tests aislados nunca escriben en este store.',
    };
    if (job.masterPath) {
      const dn = buildDisplayName({
        nombreVisible: base.nombreVisible, nombreComercial: base.nombreComercial,
        conceptId: job.conceptId, angleId: job.angleId, outputProfileName: null, versionNumber: 1,
      });
      index.set(norm(job.masterPath), { ...base, outputProfileName: null, ...dn });
    }
    for (const o of job.outputs ?? []) {
      if (!o.outputPath) continue;
      const dn = buildDisplayName({
        nombreVisible: base.nombreVisible, nombreComercial: base.nombreComercial,
        conceptId: job.conceptId, angleId: job.angleId, outputProfileName: o.profileName, versionNumber: 1,
      });
      index.set(norm(o.outputPath), { ...base, outputProfileName: o.profileName ?? null, ...dn });
    }
  }

  for (const project of listAllProjects()) {
    const batch = getCachedBatch(batchCache, project.batchId);
    const esPrueba = esRutaOBatchDePrueba({ batchId: project.batchId, projectDir: project.sourceProjectDir });
    // conceptId/angleId reales viven en el ProductionJob original que este
    // proyecto envuelve -- nunca se guardan de nuevo en el propio proyecto.
    const jobOriginal = jobsById.get(project.productionJobId) ?? null;
    const base = {
      productionJobId: project.productionJobId ?? null,
      projectId: project.projectId,
      campaignId: project.campaignId ?? null,
      batchId: project.batchId ?? null,
      productId: batch?.product?.productId ?? null,
      nombreVisible: batch?.product?.nombreVisible ?? null,
      nombreComercial: batch?.product?.nombreComercial ?? null,
      origin: esPrueba ? 'TEST' : 'PRODUCTION',
      originEvidence: esPrueba
        ? 'batchId/ruta con literal "real-e2e" (script E2E auto-declarado).'
        : 'EditableVideoProject real persistido, envuelve un ProductionJob real -- nunca escrito por un test aislado.',
    };
    for (const version of project.versions ?? []) {
      const versionNumber = version.versionNumber ?? null;
      const conceptId = jobOriginal?.conceptId ?? null;
      if (version.masterPath) {
        const dn = buildDisplayName({
          nombreVisible: base.nombreVisible, nombreComercial: base.nombreComercial,
          conceptId, angleId: null, outputProfileName: null, versionNumber,
        });
        index.set(norm(version.masterPath), { ...base, versionNumber, outputProfileName: null, ...dn });
      }
      for (const o of version.outputs ?? []) {
        if (!o.outputPath) continue;
        // Reutiliza displayName/displayFilename YA construidos por
        // projects.js (Paso 8: "no crear otro generador de nombres") --
        // solo se calcula aquí cuando la versión es anterior a esa mejora
        // (v1, que nunca pasó por handleRenderProject).
        const displayName = o.displayName ?? buildDisplayName({
          nombreVisible: base.nombreVisible, nombreComercial: base.nombreComercial,
          conceptId, angleId: null, outputProfileName: o.profileName, versionNumber,
        }).displayName;
        const displayFilename = o.displayFilename ?? null;
        index.set(norm(o.outputPath), {
          ...base, versionNumber, outputProfileName: o.profileName ?? null, displayName, displayFilename,
        });
      }
    }
  }

  return index;
}

function buildApprovedPathSet() {
  const set = new Set();
  for (const record of scheduledPublicationStore.list()) {
    if (!record.approvedAt) continue; // Paso 20: nunca se infiere aprobación -- solo approvedAt real (PublishingScheduler.approve()).
    const snapshot = record.assetPackageSnapshot;
    for (const o of snapshot?.outputAssets ?? []) if (o.path) set.add(norm(o.path));
    for (const a of snapshot?.audioAssets ?? []) if (a.path) set.add(norm(a.path));
  }
  return set;
}

export function computeAssetStatus({ sourcePath, lineage, approvedPaths, archivedPaths }) {
  if (archivedPaths.has(norm(sourcePath))) return 'ARCHIVED';
  if (approvedPaths.has(norm(sourcePath))) return 'FINAL_APPROVED';
  if (lineage?.operation?.startsWith('EDIT')) return 'EDITING';
  return 'GENERATED'; // Paso 20: un render que termina NO es "aprobado" -- es "generado" hasta que haya evidencia real de aprobación.
}

/**
 * Enriquece la lista real de Final Outputs (video-production/*.mp4 ya
 * encontrados por productionLibrary.js#listFinalOutputsWithLineage) con
 * clasificación real -- nunca agrega ni quita ningún archivo de la lista.
 */
export function classifyFinalOutputs(finalOutputs) {
  const index = buildPathIndex();
  const approvedPaths = buildApprovedPathSet();
  const archivedPaths = listArchivedPaths();

  return finalOutputs.map((o) => {
    const meta = index.get(norm(o.path)) ?? null;
    const assetStatus = computeAssetStatus({ sourcePath: o.path, lineage: o.lineage, approvedPaths, archivedPaths });
    return {
      ...o,
      assetType: 'VIDEO',
      assetStatus,
      origin: meta?.origin ?? 'UNKNOWN',
      originEvidence: meta?.originEvidence ?? 'Sin ProductionJob/EditableVideoProject real asociado a este archivo -- no se puede determinar con evidencia objetiva.',
      productId: meta?.productId ?? null,
      nombreVisible: meta?.nombreVisible ?? null,
      campaignId: meta?.campaignId ?? null,
      campaignLabel: meta?.campaignId ? humanizeConceptId(meta.campaignId) : null,
      batchId: meta?.batchId ?? null,
      projectId: meta?.projectId ?? null,
      productionJobId: meta?.productionJobId ?? null,
      versionNumber: meta?.versionNumber ?? null,
      displayName: meta?.displayName ?? null,
      displayFilename: meta?.displayFilename ?? null,
      lineageOperation: o.lineage?.operation ?? null,
    };
  });
}

/** Metadata real para las fotografías RAW de catálogo (assets/products/) -- origin fijo CATALOG, nunca se mezcla con GENERADO (Paso 17). `nombreVisible` viene del producto real (productCatalog.js), nunca inventado -- si el producto no tiene nombre comercial real todavía, se omite (nunca placeholder). */
export function classifyRawAsset(rawAsset, nombreVisible = null) {
  return {
    ...rawAsset,
    category: 'RAW', // compatibilidad hacia atrás -- server.test.js ya verificaba este campo antes de esta corrección.
    assetType: 'PHOTO',
    assetStatus: null,
    origin: 'CATALOG',
    originEvidence: 'Fotografía RAW real del catálogo de producto (assets/products/) -- nunca generada por el sistema.',
    nombreVisible,
    displayName: nombreVisible ? `${nombreVisible} — Fotografía de producto` : null,
  };
}

/** Metadata real para los Audio Assets reutilizables de _audio-cache/ -- origin SYSTEM (recurso compartido entre producciones, no atado a un único ProductionJob). */
export function classifyAudioAsset(audioAsset) {
  const archivedPaths = listArchivedPaths();
  return {
    ...audioAsset,
    assetType: 'AUDIO',
    assetStatus: archivedPaths.has(norm(audioAsset.path)) ? 'ARCHIVED' : 'GENERATED',
    origin: 'SYSTEM',
    originEvidence: 'Audio Asset real curado en video-production/_audio-cache/ -- reutilizable entre producciones, no exclusivo de un ProductionJob.',
    displayName: audioAsset.filename ?? null,
  };
}
