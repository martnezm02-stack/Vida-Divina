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
import { resolveEffectiveCaptionsVisibility } from '../../video-production/src/captionStyle.js';

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
      // Fix Editor Hook/Voiceover/Captions (2026-08-25) -- HOOK/ON-SCREEN
      // TEXT, VOICEOVER y CAPTIONS son TRES capas distintas (ver
      // docs/PROJECT_STATE.md): `onScreenTextOverride` (arriba) edita SOLO
      // el texto visual; `voiceoverTextOverride` edita SOLO el guion
      // hablado (regenera voz real, ver projectEditor.js#applyVoiceRegeneration);
      // ninguno de los dos toca al otro.
      voiceoverTextOverride: null,
      onScreenTextVisible: true,
      // Captions: Auto/Mostrar/Ocultar (Problema 1) -- 'AUTO' decide en
      // base a isHookCaptionDuplicate() (Problema 2, ver captionStyle.js).
      captionsVisibility: 'AUTO',
      durationOverride: null,
      voiceTrack: Object.freeze({
        sourcePath: sceneAudioPath(projectDir, scene.sceneId), volume: 1, isRegenerated: false,
        // Duración real conocida del audio BASE de esta escena (= scene.duration,
        // ya medido por la producción original) -- se actualiza SOLO cuando
        // se regenera la voz real (Problema 4), nunca al editar el Hook/On-Screen
        // Text ni el estilo de captions.
        durationSeconds: scene.duration,
        regeneratedAt: null,
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

// ---------------------------------------------------------------------
// Helpers de "valor efectivo actual" de una escena -- fuente ÚNICA de
// verdad para projectEditor.js (validación) y projectRenderer.js (render),
// para que ambos nunca puedan desincronizarse sobre qué duración/narración/
// texto/visibilidad está REALMENTE vigente para una escena real. Todos
// usan `??`/fallback explícito -- backward compatible con proyectos reales
// guardados ANTES de estos campos (Fix Editor Hook/Voiceover/Captions,
// 2026-08-25): un proyecto viejo cargado de disco sin `voiceoverTextOverride`/
// `captionsVisibility`/`onScreenTextVisible`/`voiceTrack.durationSeconds`
// se comporta EXACTAMENTE igual que antes de este fix.

/** Duración real "base" vigente de una escena -- la del audio REGENERADO real si ya se regeneró la voz (Problema 4), o la original de producción si no. `durationOverride` (recorte manual) se aplica SOBRE este valor, nunca lo reemplaza. */
export function currentSceneBaseDuration(scene) {
  return scene.voiceTrack?.isRegenerated && Number.isFinite(scene.voiceTrack?.durationSeconds)
    ? scene.voiceTrack.durationSeconds
    : scene.duration;
}

/** Texto de VOICEOVER real vigente de una escena -- el override real del usuario (Problema 4) si existe, la narración original si no. Nunca el mismo campo que el Hook/On-Screen Text (Problema 2: son TRES capas distintas). */
export function currentSceneNarration(scene) {
  return scene.voiceoverTextOverride ?? scene.narration;
}

/** Texto de HOOK/ON-SCREEN TEXT real vigente de una escena -- el override real del usuario si existe, el original si no. */
export function currentSceneOnScreenText(scene) {
  return scene.onScreenTextOverride ?? scene.onScreenText;
}

/** true si el Hook/On-Screen Text de esta escena debe verse -- backward compatible (ausente = true, mismo comportamiento que antes de este fix). */
export function currentSceneOnScreenTextVisible(scene) {
  return scene.onScreenTextVisible ?? true;
}

/** Modo real de visibilidad de captions vigente ('AUTO'/'SHOW'/'HIDE') -- backward compatible (ausente/inválido = 'AUTO', mismo comportamiento visual que antes de este fix: captions siempre mostrados). */
export function currentSceneCaptionsVisibility(scene) {
  return resolveEffectiveCaptionsVisibility(scene.captionsVisibility);
}
