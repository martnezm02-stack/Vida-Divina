// assetDeletion.js — eliminación REAL de un Final Output (MP4 de
// video-production/) desde la Biblioteca de Assets del Dashboard.
//
// Corrección 2026-08-26: el botón "Eliminar" de Assets NO debe ser solo
// cosmético (quitarlo de la lista en memoria) -- debe borrar el registro
// de lineage real (si existe) y el archivo físico real del disco, para que
// las pruebas no acumulen basura. Antes de borrar nada, comprueba contra
// TODAS las referencias persistentes reales del proyecto (lineage,
// ProductionJob, EditableVideoProject, ScheduledPublication) -- si alguna
// depende del archivo, la eliminación se bloquea con un motivo explícito
// (nunca borra "a ciegas").
//
// Deliberadamente restringido a video-production/ (Final Outputs) -- las
// fotografías RAW de assets/products/ son catálogo real de producto, no
// "assets de prueba", y nunca se ofrecen para borrado desde aquí.

import { existsSync, unlinkSync } from 'node:fs';
import { sep, join } from 'node:path';
import { resolveSafeMediaPath, ALLOWED_MEDIA_ROOTS } from './safePaths.js';
import { hashFile, lineageExists, getLineage, listLineageBySourceAsset, LINEAGE_DIR } from '../../../content-orchestrator/src/assetLineage.js';
import { listAllProjects } from '../../../content-orchestrator/src/editableProjectStore.js';
import { listAllProductionJobs } from '../../../content-orchestrator/src/productionJobStore.js';
import * as scheduledPublicationStore from '../../../publishing-scheduler/src/scheduledPublicationStore.js';

const VIDEO_PRODUCTION_ROOT = ALLOWED_MEDIA_ROOTS.find((r) => r.endsWith('video-production'));

function normaliza(p) {
  return p ? String(p).toLowerCase() : p;
}

/**
 * Busca, en TODAS las referencias persistentes reales del proyecto, algo
 * que todavía dependa del archivo real en `absolutePath` -- nunca infiere,
 * solo compara rutas/ids reales ya persistidos.
 *
 * @returns {{path:string|null, reason:string}|null} null si no hay ninguna dependencia real conocida.
 */
export function findAssetDependents(absolutePath) {
  const objetivo = normaliza(absolutePath);

  // 1. Lineage real: ¿algún OTRO asset derivado usa este archivo como fuente?
  let assetId = null;
  try { assetId = hashFile(absolutePath); } catch { /* archivo ya no existe -- nada que comprobar por hash */ }
  if (assetId) {
    const dependientes = listLineageBySourceAsset(assetId).filter((r) => r.derivedAssetPath && normaliza(r.derivedAssetPath) !== objetivo);
    if (dependientes.length > 0) {
      return { path: dependientes[0].derivedAssetPath, reason: `Es la fuente real de otro asset ya derivado (${dependientes[0].operation}).` };
    }
  }

  // 2. ProductionJob real: ¿es el masterPath o alguno de los outputs de un job ya producido?
  for (const record of listAllProductionJobs()) {
    const job = record.job;
    if (normaliza(job?.masterPath) === objetivo) {
      return { path: job.masterPath, reason: `Es el render maestro real del ProductionJob "${record.productionJobId}".` };
    }
    const output = (job?.outputs ?? []).find((o) => normaliza(o.outputPath) === objetivo);
    if (output) {
      return { path: output.outputPath, reason: `Es un output real (${output.profileName}) del ProductionJob "${record.productionJobId}".` };
    }
  }

  // 3. EditableVideoProject real: ¿referenciado por alguna versión (master/outputs) o por el override de assets de alguna escena?
  for (const project of listAllProjects()) {
    for (const version of project.versions ?? []) {
      if (normaliza(version.masterPath) === objetivo) {
        return { path: version.masterPath, reason: `Utilizado por el proyecto editable "${project.projectId}" (v${version.versionNumber}).` };
      }
      const output = (version.outputs ?? []).find((o) => normaliza(o.outputPath) === objetivo);
      if (output) {
        return { path: output.outputPath, reason: `Utilizado por el proyecto editable "${project.projectId}" (v${version.versionNumber}, ${output.profileName}).` };
      }
    }
    for (const scene of project.scenes ?? []) {
      if (normaliza(scene.assetOverride?.imageSourcePath) === objetivo) {
        return { path: scene.assetOverride.imageSourcePath, reason: `Utilizado como asset de una escena del proyecto editable "${project.projectId}".` };
      }
    }
  }

  // 4. ScheduledPublication real (Calendario/Revisión): ¿aparece en el snapshot real ya publicado/programado?
  for (const record of scheduledPublicationStore.list()) {
    const snapshot = record.assetPackageSnapshot;
    const enSalidas = (snapshot?.outputAssets ?? []).some((o) => normaliza(o.path) === objetivo);
    const enAudio = (snapshot?.audioAssets ?? []).some((a) => normaliza(a.path) === objetivo);
    if (enSalidas || enAudio) {
      return { path: absolutePath, reason: `Utilizado por la publicación "${record.platform}" (estado ${record.status}).` };
    }
  }

  return null;
}

/**
 * Elimina REALMENTE un Final Output real (archivo físico + su propio
 * registro de lineage, si tiene uno) -- SOLO si nada depende de él
 * (findAssetDependents() ya se comprobó antes). Nunca borra carpetas
 * completas ni archivos fuera de video-production/.
 */
export function deleteFinalOutputAsset(absolutePath) {
  if (!existsSync(absolutePath)) {
    return { deleted: false, fileDeleted: false, reason: 'El archivo ya no existe en disco -- nada que borrar.' };
  }
  let assetId = null;
  try { assetId = hashFile(absolutePath); } catch { /* se borra igual, sin lineage propio que limpiar */ }

  unlinkSync(absolutePath);

  // Limpieza del registro de lineage PROPIO de este asset (nunca el de
  // otro) -- solo si el registro apunta exactamente a este archivo.
  let lineageDeleted = false;
  if (assetId && lineageExists(assetId)) {
    const record = getLineage(assetId);
    if (normaliza(record.derivedAssetPath) === normaliza(absolutePath)) {
      try {
        unlinkSync(join(LINEAGE_DIR, `${assetId}.json`));
        lineageDeleted = true;
      } catch { /* el archivo físico ya se borró -- el registro de lineage huérfano no bloquea nada, se reporta igual como éxito parcial */ }
    }
  }

  return { deleted: true, fileDeleted: true, lineageDeleted };
}

export function isDeletableFinalOutputPath(absolutePath) {
  const real = resolveSafeMediaPath(absolutePath);
  return Boolean(real && VIDEO_PRODUCTION_ROOT && (real === VIDEO_PRODUCTION_ROOT || real.startsWith(VIDEO_PRODUCTION_ROOT + sep)));
}
