// editableVideoProject.js — Editable Video Project (2026-08-24).
//
// Convierte un ProductionJob real YA producido (creativeProductionOrchestrator.js
// -> productionJobStore.js) en un proyecto audiovisual editable y
// persistente. El MP4 es un OUTPUT del proyecto, no el proyecto -- este
// módulo define la fuente de verdad real: escenas, timeline, estilos de
// caption, overlays de texto, música, voz -- todo editable sin volver a
// correr la capa estratégica (CampaignIntent/hypothesisCreativeEngine/
// Creative Batch System, que este módulo NUNCA toca ni reimporta).
//
// El proyecto REFERENCIA al ProductionJob original (productionJobId,
// sourceProjectDir) en vez de duplicar su script/copy -- lo único que este
// módulo copia son los campos que necesitan volverse editables por-escena
// (duración, texto en pantalla, ruta del clip base, ruta del audio base).

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SCENE_KIND_BY_VISUAL_INTENT } from './creativeProductionOrchestrator.js';

export const PROJECT_VERSION_STATUSES = Object.freeze(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION', 'FAILED']);

function sceneClipPath(projectDir, sceneId) {
  return join(projectDir, sceneId, 'proj.mp4');
}
function sceneAudioPath(projectDir, sceneId) {
  return join(projectDir, `${sceneId}-audio.wav`);
}

/**
 * Envuelve un ProductionJob real (registro de productionJobStore.js) en un
 * EditableVideoProject real -- versión 1, sin ningún override todavía
 * (edits.scenes vacío): el estado inicial es EXACTAMENTE lo que
 * produceCreative() ya produjo, byte-idéntico.
 *
 * @param {{jobRecord: {productionJobId:string, projectDir:string, job:object, createdAt:string}, projectId?:string}} args
 */
export function buildEditableProjectFromProductionJob({ jobRecord, projectId = randomUUID() }) {
  const { projectDir, job, productionJobId } = jobRecord;
  if (!job || job.status === 'FAILED') {
    throw new Error('buildEditableProjectFromProductionJob: no se puede editar un ProductionJob real que falló (status FAILED) -- no hay escenas reales que envolver.');
  }
  if (!job.scenePlan?.scenes?.length) {
    throw new Error('buildEditableProjectFromProductionJob: el ProductionJob real no trae un Scene Plan real -- nada que editar.');
  }

  const scenes = job.scenePlan.scenes.map((scene, i) => {
    const resolution = job.assetPlan[i];
    const sceneKind = resolution.source === 'EXISTING_PRODUCT_ASSET' || resolution.source === 'GENERATED_IMAGE'
      ? 'PRODUCT' : SCENE_KIND_BY_VISUAL_INTENT[scene.visualIntent] ?? 'CONCEPT';
    return Object.freeze({
      sceneId: scene.sceneId,
      order: i,
      startSeconds: scene.startSeconds,
      duration: scene.duration,
      narration: scene.narration,
      visualIntent: scene.visualIntent,
      visualType: scene.visualType,
      visualPrompt: scene.visualPrompt,
      sceneKind,
      baseClipPath: sceneClipPath(projectDir, scene.sceneId),
      baseAudioPath: sceneAudioPath(projectDir, scene.sceneId),
      baseImageSourcePath: resolution.imageSourcePath,
      onScreenText: scene.textOverlay ?? scene.narration,
      // --- overrides editables (todos null = usa el valor base real) ---
      captionStyleOverride: null,
      textOverlaysOverride: null,
      assetOverride: null,
      onScreenTextOverride: null,
      durationOverride: null,
      voiceTrack: Object.freeze({
        sourcePath: sceneAudioPath(projectDir, scene.sceneId), volume: 1, isRegenerated: false,
      }),
    });
  });

  const initialMusicTrack = job.musicSelection?.status === 'SUCCESS'
    ? Object.freeze({ trackFilename: job.musicSelection.track.filename, volume: 0.12, startSeconds: 0, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 })
    : null;
  const initialOutputProfileNames = Object.freeze(job.outputs.map((o) => o.profileName));

  const version1 = Object.freeze({
    versionNumber: 1,
    createdAt: jobRecord.createdAt,
    editsSummary: 'Producción original (Creative Production Orchestrator) -- sin ediciones.',
    changeset: null,
    // Snapshot real del estado editable AL MOMENTO de esta versión --
    // projectRenderer.js#classifyChangeset() lo compara contra el draft
    // actual para decidir qué escenas necesitan re-render real y cuáles se
    // reutilizan (Paso "no regeneres innecesariamente").
    projectSnapshot: Object.freeze({ scenes, globalCaptionStyle: null, musicTrack: initialMusicTrack, outputProfileNames: initialOutputProfileNames }),
    sceneClipPaths: Object.freeze(Object.fromEntries(scenes.map((s) => [s.sceneId, s.baseClipPath]))),
    masterPath: job.masterPath,
    outputs: job.outputs,
    qualityReports: job.qualityReports,
    costReport: job.costReport,
    status: job.status,
    mode: 'RENDER',
  });

  const now = new Date().toISOString();
  return Object.freeze({
    projectId,
    productionJobId,
    campaignId: job.campaignId,
    batchId: job.batchId,
    generationId: job.generationId,
    creativeId: job.creativeId,
    sourceProjectDir: projectDir,
    createdAt: now,
    updatedAt: now,
    // Draft real editable (mutado inmutablemente por projectEditor.js) --
    // null = usa el default del renderer (video-production/src/captionStyle.js#DEFAULT_CAPTION_STYLE),
    // mismo comportamiento que hoy hasta que el usuario edite algo.
    globalCaptionStyle: null,
    musicTrack: initialMusicTrack,
    outputProfileNames: initialOutputProfileNames,
    scenes: Object.freeze(scenes),
    versions: Object.freeze([version1]),
  });
}

/** El draft actual (estado editable, versión más reciente NO necesariamente renderizada todavía) de un proyecto real. */
export function getCurrentDraftSnapshot(project) {
  return Object.freeze({
    scenes: project.scenes, globalCaptionStyle: project.globalCaptionStyle,
    musicTrack: project.musicTrack, outputProfileNames: project.outputProfileNames,
  });
}

export function getLatestVersion(project) {
  return project.versions[project.versions.length - 1];
}
