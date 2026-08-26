// projectEditor.js — Editable Video Project (2026-08-24).
//
// Aplica ediciones reales del usuario sobre el draft de un
// EditableVideoProject (editableVideoProject.js) de forma inmutable
// (devuelve un proyecto nuevo, nunca muta el original), y clasifica el
// changeset real entre una versión ya renderizada y el draft actual --
// esta clasificación es la que le permite a projectRenderer.js decidir qué
// escenas reales necesita volver a renderizar y cuáles puede REUTILIZAR
// (Paso central del encargo: "no regeneres la campaña/copy/voz por
// defecto, no rerenderices toda la producción para un cambio de estilo").

import { existsSync } from 'node:fs';
import { mergeCaptionStyle, assertValidTextOverlay, CAPTION_VISIBILITY_MODES } from '../../video-production/src/captionStyle.js';
import { currentSceneBaseDuration } from './editableVideoProject.js';

export const ASSET_OVERRIDE_SOURCES = Object.freeze(['USER_UPLOAD', 'EXISTING_ASSET', 'REGENERATE_AI']);

function assertValidAssetOverride(override, sceneId) {
  if (override === null) return;
  if (!ASSET_OVERRIDE_SOURCES.includes(override.source)) {
    throw new Error(`applyProjectEdit: escena "${sceneId}": assetOverride.source inválido "${override.source}" (válidos: ${ASSET_OVERRIDE_SOURCES.join(', ')}).`);
  }
  if (override.source !== 'REGENERATE_AI') {
    if (!override.imageSourcePath?.trim()) throw new Error(`applyProjectEdit: escena "${sceneId}": assetOverride.imageSourcePath es obligatorio para source "${override.source}".`);
    if (!existsSync(override.imageSourcePath)) throw new Error(`applyProjectEdit: escena "${sceneId}": assetOverride.imageSourcePath no existe realmente ("${override.imageSourcePath}").`);
  }
}

/**
 * Aplica un conjunto real de ediciones sobre el draft de un proyecto --
 * inmutable, valida cada campo, nunca acepta un override real inválido en
 * silencio.
 *
 * @param {object} project — EditableVideoProject real (ver editableVideoProject.js).
 * @param {{
 *   globalCaptionStyle?: ?object, musicTrack?: ?object, outputProfileNames?: string[], ctaText?: string,
 *   scenes?: {[sceneId:string]: {
 *     captionStyleOverride?: ?object, textOverlaysOverride?: ?object[], assetOverride?: ?object,
 *     onScreenTextOverride?: ?string, onScreenTextVisible?: boolean, voiceoverTextOverride?: ?string,
 *     captionsVisibility?: 'AUTO'|'SHOW'|'HIDE', durationOverride?: ?number,
 *     voiceTrack?: {volume?:number, isRegenerated?:boolean, sourcePath?:string, durationSeconds?:number, regeneratedAt?:string},
 *   }},
 * }} edits
 *
 * REGLA DE CAPAS (Fix Editor Hook/Voiceover/Captions, 2026-08-25):
 * `onScreenTextOverride`/`onScreenTextVisible` editan SOLO el Hook/texto en
 * pantalla -- nunca tocan voz ni captions. `voiceoverTextOverride` edita
 * SOLO el guion hablado -- se guarda como draft real (Save) SIN regenerar
 * audio (eso requiere una llamada explícita a applyVoiceRegeneration() más
 * abajo, nunca automática al escribir). `captionsVisibility`/
 * `captionStyleOverride` editan SOLO el render visual de captions -- nunca
 * regeneran voz ni cambian su contenido.
 */
export function applyProjectEdit(project, edits = {}) {
  const sceneEdits = { ...(edits.scenes ?? {}) };

  // Conveniencia real: "ctaText" de alto nivel se traduce al
  // onScreenTextOverride real de la escena CTA -- una sola fuente de
  // verdad (por-escena), nunca dos campos que puedan desincronizarse.
  if (edits.ctaText !== undefined) {
    const ctaScene = project.scenes.find((s) => s.sceneKind === 'CTA');
    if (!ctaScene) throw new Error('applyProjectEdit: el proyecto no tiene una escena CTA real -- no se puede editar "ctaText".');
    if (!edits.ctaText?.trim()) throw new Error('applyProjectEdit: "ctaText" no puede ser una cadena vacía.');
    sceneEdits[ctaScene.sceneId] = { ...(sceneEdits[ctaScene.sceneId] ?? {}), onScreenTextOverride: edits.ctaText };
  }

  let { scenes } = project;
  if (Object.keys(sceneEdits).length > 0) {
    const idsDesconocidos = Object.keys(sceneEdits).filter((id) => !project.scenes.some((s) => s.sceneId === id));
    if (idsDesconocidos.length > 0) throw new Error(`applyProjectEdit: sceneId(s) desconocido(s) para este proyecto: ${idsDesconocidos.join(', ')}.`);

    scenes = project.scenes.map((scene) => {
      const e = sceneEdits[scene.sceneId];
      if (!e) return scene;
      const next = { ...scene };

      if ('captionStyleOverride' in e) {
        next.captionStyleOverride = e.captionStyleOverride === null ? null : mergeCaptionStyle(e.captionStyleOverride);
      }
      if ('textOverlaysOverride' in e) {
        if (e.textOverlaysOverride !== null) e.textOverlaysOverride.forEach((o, i) => assertValidTextOverlay(o, i));
        next.textOverlaysOverride = e.textOverlaysOverride;
      }
      if ('assetOverride' in e) {
        assertValidAssetOverride(e.assetOverride, scene.sceneId);
        next.assetOverride = e.assetOverride;
      }
      if ('onScreenTextOverride' in e) {
        if (e.onScreenTextOverride !== null && !e.onScreenTextOverride.trim()) throw new Error(`applyProjectEdit: escena "${scene.sceneId}": onScreenTextOverride no puede ser una cadena vacía.`);
        next.onScreenTextOverride = e.onScreenTextOverride;
      }
      if ('onScreenTextVisible' in e) {
        if (typeof e.onScreenTextVisible !== 'boolean') throw new Error(`applyProjectEdit: escena "${scene.sceneId}": onScreenTextVisible debe ser boolean.`);
        next.onScreenTextVisible = e.onScreenTextVisible;
      }
      // VOICEOVER (Problema 4): editar este campo es SOLO un Save de draft
      // -- guarda el texto real pero NUNCA llama a Voice Engine ni toca
      // voiceTrack (eso requiere applyVoiceRegeneration(), abajo, invocado
      // explícitamente por el botón "Regenerar voz" de la UI).
      if ('voiceoverTextOverride' in e) {
        if (e.voiceoverTextOverride !== null && !e.voiceoverTextOverride.trim()) throw new Error(`applyProjectEdit: escena "${scene.sceneId}": voiceoverTextOverride no puede ser una cadena vacía.`);
        next.voiceoverTextOverride = e.voiceoverTextOverride;
      }
      if ('captionsVisibility' in e) {
        if (!CAPTION_VISIBILITY_MODES.includes(e.captionsVisibility)) {
          throw new Error(`applyProjectEdit: escena "${scene.sceneId}": captionsVisibility inválida "${e.captionsVisibility}" (válidas: ${CAPTION_VISIBILITY_MODES.join(', ')}).`);
        }
        next.captionsVisibility = e.captionsVisibility;
      }
      if ('durationOverride' in e) {
        if (e.durationOverride !== null) {
          const baseDuration = currentSceneBaseDuration(scene);
          if (!(e.durationOverride > 0)) throw new Error(`applyProjectEdit: escena "${scene.sceneId}": durationOverride debe ser > 0.`);
          if (e.durationOverride > baseDuration) {
            throw new Error(`applyProjectEdit: escena "${scene.sceneId}": durationOverride (${e.durationOverride}s) no puede ser mayor a la duración real vigente (${baseDuration}s) -- alargar una escena requeriría voz real que no existe todavía (limitación real documentada; acortar sí está soportado).`);
          }
        }
        next.durationOverride = e.durationOverride;
      }
      if ('voiceTrack' in e) {
        if (e.voiceTrack.volume !== undefined && (!Number.isFinite(e.voiceTrack.volume) || e.voiceTrack.volume < 0)) {
          throw new Error(`applyProjectEdit: escena "${scene.sceneId}": voiceTrack.volume debe ser un número real >= 0.`);
        }
        if (e.voiceTrack.sourcePath !== undefined && !existsSync(e.voiceTrack.sourcePath)) {
          throw new Error(`applyProjectEdit: escena "${scene.sceneId}": voiceTrack.sourcePath no existe realmente ("${e.voiceTrack.sourcePath}").`);
        }
        if (e.voiceTrack.durationSeconds !== undefined && (!Number.isFinite(e.voiceTrack.durationSeconds) || e.voiceTrack.durationSeconds <= 0)) {
          throw new Error(`applyProjectEdit: escena "${scene.sceneId}": voiceTrack.durationSeconds debe ser un número real > 0.`);
        }
        next.voiceTrack = Object.freeze({ ...scene.voiceTrack, ...e.voiceTrack });
      }
      return Object.freeze(next);
    });
  }

  return Object.freeze({
    ...project,
    globalCaptionStyle: 'globalCaptionStyle' in edits
      ? (edits.globalCaptionStyle === null ? null : mergeCaptionStyle(edits.globalCaptionStyle))
      : project.globalCaptionStyle,
    musicTrack: 'musicTrack' in edits ? edits.musicTrack : project.musicTrack,
    outputProfileNames: edits.outputProfileNames ?? project.outputProfileNames,
    scenes: Object.freeze(scenes),
    updatedAt: new Date().toISOString(),
  });
}

function shallowEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compara el draft actual (`project`) contra el snapshot real de la última
 * versión renderizada (`prevVersion.projectSnapshot`) y decide, escena por
 * escena, si necesita un re-render visual real (Chrome+ffmpeg) o si puede
 * REUTILIZAR el clip real ya renderizado -- costo real cero en ese caso.
 *
 * Un cambio en `globalCaptionStyle` fuerza re-render de toda escena que NO
 * tenga su propio `captionStyleOverride` (el override por-escena siempre
 * gana sobre el global, así que si una escena ya tiene su propio estilo,
 * un cambio del estilo global no la afecta).
 */
export function classifyChangeset(prevVersion, project) {
  const prevScenesById = Object.fromEntries(prevVersion.projectSnapshot.scenes.map((s) => [s.sceneId, s]));
  const globalCaptionChanged = !shallowEqualJson(prevVersion.projectSnapshot.globalCaptionStyle, project.globalCaptionStyle);

  const rerenderedSceneIds = [];
  const reusedSceneIds = [];
  const voiceRegeneratedSceneIds = [];

  for (const scene of project.scenes) {
    const prevScene = prevScenesById[scene.sceneId];
    const visualChanged = !prevScene
      || !shallowEqualJson(prevScene.captionStyleOverride, scene.captionStyleOverride)
      || !shallowEqualJson(prevScene.textOverlaysOverride, scene.textOverlaysOverride)
      || !shallowEqualJson(prevScene.assetOverride, scene.assetOverride)
      || prevScene.onScreenTextOverride !== scene.onScreenTextOverride
      || (prevScene.onScreenTextVisible ?? true) !== (scene.onScreenTextVisible ?? true)
      || prevScene.voiceoverTextOverride !== scene.voiceoverTextOverride
      || (prevScene.captionsVisibility ?? 'AUTO') !== (scene.captionsVisibility ?? 'AUTO')
      || prevScene.durationOverride !== scene.durationOverride
      || prevScene.voiceTrack?.sourcePath !== scene.voiceTrack?.sourcePath
      || prevScene.voiceTrack?.volume !== scene.voiceTrack?.volume
      || prevScene.voiceTrack?.durationSeconds !== scene.voiceTrack?.durationSeconds;
    const afectadaPorGlobal = globalCaptionChanged && !scene.captionStyleOverride;

    if (visualChanged || afectadaPorGlobal) {
      rerenderedSceneIds.push(scene.sceneId);
      if (scene.voiceTrack?.isRegenerated && (!prevScene || prevScene.voiceTrack?.sourcePath !== scene.voiceTrack?.sourcePath)) {
        voiceRegeneratedSceneIds.push(scene.sceneId);
      }
    } else {
      reusedSceneIds.push(scene.sceneId);
    }
  }

  const musicChanged = !shallowEqualJson(prevVersion.projectSnapshot.musicTrack, project.musicTrack);
  const formatsChanged = !shallowEqualJson(prevVersion.projectSnapshot.outputProfileNames, project.outputProfileNames);
  const formatsOnly = rerenderedSceneIds.length === 0 && !musicChanged && formatsChanged;
  const musicOnly = rerenderedSceneIds.length === 0 && musicChanged && !formatsChanged;
  const noVisualChanges = rerenderedSceneIds.length === 0;

  return Object.freeze({
    rerenderedSceneIds: Object.freeze(rerenderedSceneIds),
    reusedSceneIds: Object.freeze(reusedSceneIds),
    voiceRegeneratedSceneIds: Object.freeze(voiceRegeneratedSceneIds),
    musicChanged,
    formatsChanged,
    noVisualChanges,
    formatsOnly,
    musicOnly,
  });
}

/**
 * Problema 4 "EDITAR VOICEOVER DEBE REGENERAR LA VOZ" -- ÚNICO camino real
 * para que el voiceTrack de una escena cambie de audio real. Nunca se
 * invoca al escribir (el llamador -- dashboard/server/routes/projects.js
 * -- ya obtuvo `audioSourcePath`/`audioDurationSeconds` reales de una
 * llamada explícita y ya completada al Voice Engine existente, ver
 * voiceEngineClient.js; este módulo NUNCA conoce a Voice Engine ni hace
 * TTS, solo aplica el resultado real ya generado sobre el proyecto).
 *
 * Reutiliza applyProjectEdit() (misma validación/inmutabilidad real) --
 * nunca reimplementa el merge de escenas. Efectos reales:
 *  - voiceTrack.sourcePath/durationSeconds -> apuntan al WAV real nuevo.
 *  - voiceTrack.isRegenerated = true, voiceTrack.regeneratedAt = lineage real.
 *  - durationOverride se resetea a null -- un recorte manual previo era
 *    relativo a la duración BASE anterior; con audio nuevo, ya no aplica
 *    (el usuario puede volver a recortar sobre la nueva duración real si
 *    quiere).
 *  - onScreenTextOverride/captionStyleOverride/captionsVisibility NUNCA se
 *    tocan aquí (Regla de Capas: regenerar voz nunca cambia el Hook ni el
 *    estilo/visibilidad de captions).
 *
 * classifyChangeset() ya detecta este cambio (voiceTrack.sourcePath
 * distinto + isRegenerated=true) y marca la escena real tanto para
 * re-render como en `voiceRegeneratedSceneIds` -- sin cambios adicionales.
 */
export function applyVoiceRegeneration(project, sceneId, { audioSourcePath, audioDurationSeconds, regeneratedAt = new Date().toISOString() }) {
  const scene = project.scenes.find((s) => s.sceneId === sceneId);
  if (!scene) throw new Error(`applyVoiceRegeneration: sceneId desconocido para este proyecto: "${sceneId}".`);
  if (!audioSourcePath?.trim()) throw new Error(`applyVoiceRegeneration: escena "${sceneId}": "audioSourcePath" real es obligatorio.`);
  if (!existsSync(audioSourcePath)) throw new Error(`applyVoiceRegeneration: escena "${sceneId}": "audioSourcePath" no existe realmente ("${audioSourcePath}").`);
  if (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds <= 0) throw new Error(`applyVoiceRegeneration: escena "${sceneId}": "audioDurationSeconds" debe ser un número real > 0.`);

  return applyProjectEdit(project, {
    scenes: {
      [sceneId]: {
        voiceTrack: {
          sourcePath: audioSourcePath, isRegenerated: true, durationSeconds: audioDurationSeconds, regeneratedAt,
        },
        durationOverride: null,
      },
    },
  });
}
