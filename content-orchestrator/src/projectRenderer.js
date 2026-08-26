// projectRenderer.js — Editable Video Project (2026-08-24).
//
// Renderiza (o previsualiza) UNA versión real de un EditableVideoProject.
// Regla central del encargo: "no regeneres la campaña/copy/voz por
// defecto, no rerenderices toda la producción para un cambio de estilo".
// Esta función clasifica el changeset real (projectEditor.js#classifyChangeset)
// entre el draft actual y la última versión ya renderizada, y SOLO
// re-renderiza (Chrome+ffmpeg real, vía renderScene ya existente) las
// escenas reales que de verdad cambiaron visualmente -- las demás
// REUTILIZAN el clip real ya producido, costo real cero. La voz nunca se
// regenera aquí (Voice Engine no se llama desde este módulo, igual que
// creativeProductionOrchestrator.js) salvo que el propio draft ya traiga
// un voiceTrack.sourcePath distinto (regenerado explícitamente por el
// usuario en una capa superior).

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import {
  renderScene, distribuirSubtitulos, recortarAudioReal, correr,
} from '../../video-production/src/hyperframesRenderer.js';
import { shouldRenderCaptions } from '../../video-production/src/captionStyle.js';
import { generateImage } from '../../image-generation/src/imageProvider.js';
import { LocalFfmpegEnhancementProvider } from './enhancementProvider.js';
import { selectMusicTrack } from './musicProvider.js';
import { getOutputProfile } from './outputProfiles.js';
import { runProductionQualityGate } from './productionQualityGate.js';
import { classifyChangeset } from './projectEditor.js';
import {
  getLatestVersion, currentSceneBaseDuration, currentSceneNarration, currentSceneOnScreenText, currentSceneOnScreenTextVisible,
} from './editableVideoProject.js';

export const RENDER_MODES = Object.freeze(['RENDER', 'PREVIEW']);

function aplicarVolumenReal(sourcePath, volume, outputPath, ffmpegBinDir) {
  const ffmpegBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffmpeg.exe') : 'ffmpeg';
  const r = correr(ffmpegBin, ['-y', '-i', sourcePath, '-af', `volume=${volume}`, '-acodec', 'pcm_s16le', '-ar', '44100', outputPath]);
  if (r.status !== 0) throw new Error(`projectRenderer: ffmpeg falló al ajustar el volumen real de "${sourcePath}": ${r.stderr || r.stdout}`);
  return outputPath;
}

/**
 * Resuelve el audio REAL a usar para una escena en esta versión -- recorta
 * si hay durationOverride real (nunca alarga, ver projectEditor.js),
 * ajusta volumen real si difiere de 1. Nunca vuelve a llamar a Voice
 * Engine (eso ya ocurrió, si aplica, en applyVoiceRegeneration() ANTES de
 * llegar aquí -- este renderer solo consume `scene.voiceTrack.sourcePath`
 * ya resuelto, sea original o regenerado).
 *
 * `baseDuration` (Problema 4) usa la duración real del audio REGENERADO si
 * la voz ya se regeneró para esta escena -- nunca la duración original de
 * producción en ese caso (ver editableVideoProject.js#currentSceneBaseDuration).
 */
function resolverAudioEfectivoEscena(scene, versionDir, ffmpegBinDir) {
  let audioPath = scene.voiceTrack.sourcePath;
  const baseDuration = currentSceneBaseDuration(scene);
  const effectiveDuration = scene.durationOverride ?? baseDuration;
  const sceneWorkDir = join(versionDir, scene.sceneId);
  if (scene.durationOverride && scene.durationOverride < baseDuration) {
    mkdirSync(sceneWorkDir, { recursive: true });
    const trimmedPath = join(sceneWorkDir, `${scene.sceneId}-audio-trimmed.wav`);
    recortarAudioReal(audioPath, 0, effectiveDuration, trimmedPath, ffmpegBinDir);
    audioPath = trimmedPath;
  }
  if (scene.voiceTrack.volume !== 1) {
    mkdirSync(sceneWorkDir, { recursive: true });
    const volPath = join(sceneWorkDir, `${scene.sceneId}-audio-vol.wav`);
    aplicarVolumenReal(audioPath, scene.voiceTrack.volume, volPath, ffmpegBinDir);
    audioPath = volPath;
  }
  return { audioPath, effectiveDuration };
}

/** Regenera el asset visual de UNA escena real vía un ImageProvider real -- ÚNICO camino de esta fase con costo real distinto de cero (ver costReport). Nunca acepta un resultado mock como asset real usable (mismo criterio que assetResolver.js). */
async function regenerarAssetEscenaConIA(scene, imageProvider) {
  if (!imageProvider) throw new Error(`projectRenderer: escena "${scene.sceneId}" pide assetOverride.source "REGENERATE_AI" pero no se proveyó un imageProvider real.`);
  const request = Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: null,
    providerName: imageProvider.providerName,
    model: imageProvider.model,
    generationPrompt: scene.visualPrompt,
    negativePrompt: 'texto en pantalla, marcas de agua, logos ajenos, contenido explícito, afirmaciones médicas',
    aspectRatio: '9:16',
    productReference: null,
    generationFingerprint: createHash('sha256').update(JSON.stringify({ p: scene.visualPrompt, provider: imageProvider.providerName, model: imageProvider.model, sceneId: scene.sceneId })).digest('hex'),
  });
  const result = await generateImage({ provider: imageProvider, request });
  if (result.status !== 'SUCCESS' || result.isMock) {
    throw new Error(`projectRenderer: la regeneración real de asset (IA) para "${scene.sceneId}" no produjo un activo real usable (status=${result.status}, isMock=${result.isMock}${result.error ? `, error=${result.error}` : ''}).`);
  }
  return { imageSourcePath: result.asset.sourcePath, providerUsed: result.providerName, cost: result.actualCost || result.estimatedCost || 0 };
}

function buildEditsSummary(changeset) {
  const partes = [];
  if (changeset.rerenderedSceneIds.length) partes.push(`${changeset.rerenderedSceneIds.length} escena(s) re-renderizada(s) real(es) (${changeset.rerenderedSceneIds.join(', ')})`);
  if (changeset.reusedSceneIds.length) partes.push(`${changeset.reusedSceneIds.length} escena(s) reutilizada(s) sin costo real (${changeset.reusedSceneIds.join(', ')})`);
  if (changeset.voiceRegeneratedSceneIds.length) partes.push(`voz regenerada real en: ${changeset.voiceRegeneratedSceneIds.join(', ')}`);
  if (changeset.musicChanged) partes.push('música cambiada');
  if (changeset.formatsChanged) partes.push('formatos de salida cambiados');
  return partes.length ? partes.join('; ') : 'Sin cambios reales detectados.';
}

/**
 * @param {object} project — EditableVideoProject real, ya con las ediciones del draft aplicadas (projectEditor.js#applyProjectEdit).
 * @param {{ffmpegBinDir?:string, mode?:'RENDER'|'PREVIEW', imageProvider?:object}} opts
 * @returns {Promise<object>} un registro de versión real -- el llamador decide si lo agrega a project.versions[] (solo en mode 'RENDER') y lo persiste.
 */
export async function renderProjectVersion(project, { ffmpegBinDir = null, mode = 'RENDER', imageProvider = null } = {}) {
  if (!RENDER_MODES.includes(mode)) throw new Error(`renderProjectVersion: "mode" inválido "${mode}" (válidos: ${RENDER_MODES.join(', ')}).`);
  const prevVersion = getLatestVersion(project);
  const changeset = classifyChangeset(prevVersion, project);
  const nextVersionNumber = mode === 'RENDER' ? prevVersion.versionNumber + 1 : prevVersion.versionNumber;
  const versionDir = join(project.sourceProjectDir, 'versions', mode === 'RENDER' ? `v${nextVersionNumber}` : `preview-${Date.now()}`);
  mkdirSync(versionDir, { recursive: true });

  const sceneClipPaths = {};
  const costEntries = [];

  for (const scene of project.scenes) {
    if (!changeset.rerenderedSceneIds.includes(scene.sceneId)) {
      sceneClipPaths[scene.sceneId] = prevVersion.sceneClipPaths[scene.sceneId];
      continue; // REUTILIZACIÓN real -- ningún render, ningún costo.
    }

    let imageSourcePath = scene.assetOverride?.imageSourcePath ?? scene.baseImageSourcePath;
    if (scene.assetOverride?.source === 'REGENERATE_AI') {
      // eslint-disable-next-line no-await-in-loop
      const regenerado = await regenerarAssetEscenaConIA(scene, imageProvider);
      imageSourcePath = regenerado.imageSourcePath;
      costEntries.push({ sceneId: scene.sceneId, provider: regenerado.providerUsed, estimatedCost: regenerado.cost, reason: 'Regeneración real de asset vía IA (assetOverride.source=REGENERATE_AI).' });
    } else {
      costEntries.push({ sceneId: scene.sceneId, provider: 'local_ffmpeg', estimatedCost: 0, reason: 'Re-render visual real (estilo/overlay/asset local/texto/duración) -- sin regeneración de IA, costo real cero.' });
    }

    const { audioPath, effectiveDuration } = resolverAudioEfectivoEscena(scene, versionDir, ffmpegBinDir);
    // Problema 2/4: el texto REAL vigente de cada capa -- narración
    // (voiceover, fuente de los captions) y on-screen text (Hook) son DOS
    // campos independientes, nunca uno solo (ver editableVideoProject.js).
    const narrationText = currentSceneNarration(scene);
    const onScreenText = currentSceneOnScreenText(scene);
    const captionsVisible = shouldRenderCaptions({
      visibilityMode: scene.captionsVisibility, onScreenText, narrationText,
    });
    const subtitulos = captionsVisible ? distribuirSubtitulos([narrationText], effectiveDuration) : [];
    const sceneVersionDir = join(versionDir, scene.sceneId, 'proj');
    // eslint-disable-next-line no-await-in-loop
    const rendered = renderScene({
      projectDir: sceneVersionDir,
      sceneKind: scene.sceneKind,
      text: onScreenText,
      onScreenTextVisible: currentSceneOnScreenTextVisible(scene),
      ctaWhatsappLabel: scene.sceneKind === 'CTA' ? 'WhatsApp' : null,
      imageSourcePath,
      audioSourcePath: audioPath,
      durationSeconds: effectiveDuration,
      subtitulos,
      captionStyle: scene.captionStyleOverride ?? project.globalCaptionStyle ?? null,
      textOverlays: scene.textOverlaysOverride ?? [],
      ffmpegBinDir,
    });
    if (rendered.status !== 'COMPLETADO') {
      return Object.freeze({
        versionNumber: nextVersionNumber, mode, status: 'FAILED', changeset,
        error: `Escena real "${scene.sceneId}" falló al re-renderizar: ${rendered.error}`,
        createdAt: new Date().toISOString(), renderDir: versionDir,
      });
    }
    sceneClipPaths[scene.sceneId] = rendered.outputPath;
  }

  const enhancement = new LocalFfmpegEnhancementProvider();
  const genericProfile = getOutputProfile('GENERIC_VERTICAL');
  const scenePathsOrdered = project.scenes.map((s) => sceneClipPaths[s.sceneId]);
  const masterPreMusic = join(versionDir, 'master-pre-music.mp4');
  const concatResult = enhancement.apply({
    inputPath: scenePathsOrdered[0], outputPath: masterPreMusic, outputProfile: genericProfile,
    operations: ['MULTI_SCENE_CONCAT'], operationParams: { MULTI_SCENE_CONCAT: { scenePaths: scenePathsOrdered } }, ffmpegBinDir,
  });
  if (concatResult.status === 'POSTPRODUCTION_FAILED' || concatResult.status === 'VALIDATION_FAILED') {
    return Object.freeze({
      versionNumber: nextVersionNumber, mode, status: 'FAILED', changeset,
      error: `Concatenación real del master falló: ${concatResult.error}`,
      createdAt: new Date().toISOString(), renderDir: versionDir,
    });
  }

  let masterPath = masterPreMusic;
  let musicIncluded = false;
  if (project.musicTrack) {
    const musicSelection = selectMusicTrack({ trackFilename: project.musicTrack.trackFilename });
    if (musicSelection.status === 'SUCCESS') {
      const masterConMusica = join(versionDir, 'master.mp4');
      const musicResult = enhancement.apply({
        inputPath: masterPreMusic, outputPath: masterConMusica, outputProfile: genericProfile,
        operations: ['MUSIC_REPLACEMENT'],
        operationParams: { MUSIC_REPLACEMENT: { musicPath: musicSelection.track.path, musicVolume: project.musicTrack.volume, mode: 'mix' } },
        ffmpegBinDir,
      });
      if (musicResult.operationsApplied.includes('MUSIC_REPLACEMENT')) { masterPath = masterConMusica; musicIncluded = true; }
    }
  }

  const profilesToRender = mode === 'PREVIEW' ? ['GENERIC_VERTICAL'] : project.outputProfileNames;
  const outputs = [];
  const qualityReports = [];
  const ctaScene = project.scenes.find((s) => s.sceneKind === 'CTA');
  const expectedCtaText = ctaScene ? currentSceneOnScreenText(ctaScene) : (project.scenes[0]?.onScreenText ?? '');
  const totalDurationSeconds = project.scenes.reduce((acc, s) => acc + (s.durationOverride ?? currentSceneBaseDuration(s)), 0);

  for (const profileName of profilesToRender) {
    const profile = getOutputProfile(profileName);
    const outPath = join(versionDir, `output-${profileName}.mp4`);
    // eslint-disable-next-line no-await-in-loop
    const formatResult = enhancement.apply({ inputPath: masterPath, outputPath: outPath, outputProfile: profile, operations: ['RESIZE_TO_PROFILE'], ffmpegBinDir });
    const qa = runProductionQualityGate({
      outputPath: formatResult.status === 'POSTPRODUCTION_FAILED' ? masterPath : outPath,
      expectedVoiceoverDurationSeconds: totalDurationSeconds, expectedCtaText,
      scenePlan: { allScenesShowProduct: false }, captionsApplied: true, musicIncluded,
      campaignId: project.campaignId, creativeId: project.creativeId, ffmpegBinDir,
    });
    qualityReports.push(Object.freeze({ profileName, ...qa }));
    outputs.push(Object.freeze({
      profileName, aspectRatio: profile.aspectRatio,
      outputPath: formatResult.status === 'POSTPRODUCTION_FAILED' ? null : outPath, status: formatResult.status,
    }));
  }

  const overallStatus = qualityReports.some((q) => q.status === 'FAILED') ? 'FAILED'
    : qualityReports.some((q) => q.status === 'DEGRADED_PRODUCTION') ? 'DEGRADED_PRODUCTION' : 'FULL_PRODUCTION';

  const costReport = Object.freeze({ entries: Object.freeze(costEntries), estimatedTotal: costEntries.reduce((s, e) => s + (e.estimatedCost || 0), 0), currency: 'USD' });

  return Object.freeze({
    versionNumber: nextVersionNumber,
    mode,
    createdAt: new Date().toISOString(),
    editsSummary: buildEditsSummary(changeset),
    changeset,
    projectSnapshot: Object.freeze({
      scenes: project.scenes, globalCaptionStyle: project.globalCaptionStyle, musicTrack: project.musicTrack, outputProfileNames: project.outputProfileNames,
    }),
    sceneClipPaths: Object.freeze(sceneClipPaths),
    masterPath,
    outputs: Object.freeze(outputs),
    qualityReports: Object.freeze(qualityReports),
    costReport,
    status: overallStatus,
    renderDir: versionDir,
  });
}
