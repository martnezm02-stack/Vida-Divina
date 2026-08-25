// creativeProductionOrchestrator.js — Creative Production Orchestrator
// (2026-08-24). Punto de entrada único: transforma una creatividad
// estratégica YA APROBADA (una entrada real de
// hypothesisCreativeEngine.js#buildHypothesisExperiment().variantsDetail,
// con su CampaignIntent real) en un ProductionJob real: N escenas
// distintas, voiceover real recortado por escena, música real si hay una
// pista real disponible, captions reales (ya horneadas por escena vía
// hyperframesRenderer.js#renderScene), concatenadas en un master real, y
// re-renderizadas a los formatos reales pedidos (9:16/4:5/1:1/16:9, ver
// outputProfiles.js).
//
// NUNCA vuelve a generar copy ni campaña -- consume lo que
// hypothesisCreativeEngine.js/campaignIntent.js ya construyeron y
// validaron. NUNCA llama a Voice Engine directamente (esa es una
// responsabilidad real de la capa HTTP del Dashboard, igual que ya lo es
// hoy para /api/create -- ver dashboard/server/lib/voiceEngineClient.js);
// este orquestador recibe el WAV real completo YA generado
// (audioSourcePath/audioDurationSeconds) como entrada, y decide cómo
// repartirlo entre escenas.

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import {
  renderScene, recortarAudioReal, distribuirSubtitulos,
} from '../../video-production/src/hyperframesRenderer.js';
import { buildVideoScript } from './videoScriptGenerator.js';
import { buildScenePlan } from './scenePlanner.js';
import { resolveAssetPlan } from './assetResolver.js';
import { runProductionQualityGate } from './productionQualityGate.js';
import { LocalFfmpegEnhancementProvider } from './enhancementProvider.js';
import { selectMusicTrack } from './musicProvider.js';
import { getOutputProfile } from './outputProfiles.js';

// Exportado (Editable Video Project, 2026-08-24) -- editableVideoProject.js
// necesita derivar el MISMO sceneKind real al envolver un ProductionJob ya
// producido, sin duplicar esta regla de negocio.
export const SCENE_KIND_BY_VISUAL_INTENT = Object.freeze({
  CONCEPT_OPENING: 'CONCEPT', AUDIENCE_CONTEXT: 'CONCEPT', PRODUCT_REVEAL: 'PRODUCT', CTA_BRAND: 'CTA',
});

function proporcion(scene, factorEscala) {
  return Object.freeze({ ...scene, startSeconds: +(scene.startSeconds * factorEscala).toFixed(2), duration: +(scene.duration * factorEscala).toFixed(2) });
}

/**
 * @param {{
 *   creativeVariant: object, campaignIntent: ?object, productRawAssets?: object[],
 *   audioSourcePath: string, audioDurationSeconds: number,
 *   outputProfileNames: string[], projectDir: string, ffmpegBinDir?: string,
 *   campaignId?: ?string, batchId?: ?string, generationId?: ?string, creativeId?: string,
 *   imageProvider?: object, videoProvider?: object, includeMusic?: boolean,
 * }} args
 * @returns {Promise<object>} ProductionJob real.
 */
export async function produceCreative({
  creativeVariant, campaignIntent = null, productRawAssets = [],
  audioSourcePath, audioDurationSeconds, outputProfileNames, projectDir, ffmpegBinDir = null,
  campaignId = null, batchId = null, generationId = null, creativeId = randomUUID(),
  imageProvider = null, videoProvider = null, includeMusic = true,
}) {
  if (!audioSourcePath?.trim() || !existsSync(audioSourcePath)) {
    throw new Error(`produceCreative: "audioSourcePath" debe ser un WAV real ya existente (recibido: ${audioSourcePath}).`);
  }
  if (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds <= 0) {
    throw new Error('produceCreative: "audioDurationSeconds" debe ser un número real > 0 (medido del WAV real, nunca estimado).');
  }
  if (!Array.isArray(outputProfileNames) || outputProfileNames.length === 0) {
    throw new Error('produceCreative: se requiere al menos 1 outputProfile real (ej. INSTAGRAM_REEL, INSTAGRAM_FEED).');
  }
  outputProfileNames.forEach((n) => getOutputProfile(n));

  // 1. SCRIPT -- reutiliza videoScriptGenerator.js real, sin cambios.
  const videoScript = buildVideoScript({
    hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
    sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
    format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
  });
  if (!videoScript.applicable) {
    return Object.freeze({
      status: 'FAILED', creativeId, campaignId, batchId, generationId,
      error: videoScript.reason, script: videoScript, scenePlan: null, assetPlan: null, outputs: [], costReport: null, qualityReports: [],
    });
  }

  // 2. SCENE PLAN real -- reescalado al AUDIO REAL medido (nunca al
  // estimado por conteo de palabras, que solo sirve como target ANTES de
  // generar el audio real).
  const scenePlanEstimado = buildScenePlan({ videoScript, productRawAssets, campaignIntent });
  const factorEscala = audioDurationSeconds / videoScript.estimatedDurationSeconds;
  const scenePlan = Object.freeze({ ...scenePlanEstimado, scenes: Object.freeze(scenePlanEstimado.scenes.map((s) => proporcion(s, factorEscala))), totalDurationSeconds: audioDurationSeconds });

  // 3. ASSET PLAN real -- prioridad real (existente > generado local > stock > premium > tipográfico).
  const assetPlan = await resolveAssetPlan({ scenes: scenePlan.scenes, imageProvider, videoProvider });

  // 4. MÚSICA real -- pista curada real si existe (nunca fabricada).
  const musicSelection = includeMusic ? selectMusicTrack({}) : { status: 'NO_TRACK_AVAILABLE', track: null };

  // 5. Por escena real: recorta el segmento REAL de audio y renderiza la escena real (HyperFrames + ffmpeg, con captions horneados).
  mkdirSync(projectDir, { recursive: true });
  const enhancement = new LocalFfmpegEnhancementProvider();
  const scenePaths = [];
  const costEntries = [];
  for (let i = 0; i < scenePlan.scenes.length; i += 1) {
    const scene = scenePlan.scenes[i];
    const resolution = assetPlan[i];
    const sceneAudioPath = join(projectDir, `scene-${i + 1}-audio.wav`);
    // eslint-disable-next-line no-await-in-loop
    recortarAudioReal(audioSourcePath, scene.startSeconds, scene.duration, sceneAudioPath, ffmpegBinDir);
    const subtitulos = distribuirSubtitulos([scene.narration], scene.duration);
    const sceneKind = resolution.source === 'EXISTING_PRODUCT_ASSET' || resolution.source === 'GENERATED_IMAGE'
      ? 'PRODUCT' : SCENE_KIND_BY_VISUAL_INTENT[scene.visualIntent] ?? 'CONCEPT';
    const sceneProjectDir = join(projectDir, `scene-${i + 1}`, 'proj');
    // eslint-disable-next-line no-await-in-loop
    const rendered = renderScene({
      projectDir: sceneProjectDir, sceneKind, text: scene.textOverlay ?? scene.narration,
      ctaWhatsappLabel: sceneKind === 'CTA' ? 'WhatsApp' : null,
      imageSourcePath: resolution.imageSourcePath, audioSourcePath: sceneAudioPath, durationSeconds: scene.duration,
      subtitulos, ffmpegBinDir,
    });
    if (rendered.status !== 'COMPLETADO') {
      return Object.freeze({
        status: 'FAILED', creativeId, campaignId, batchId, generationId,
        error: `Escena real "${scene.sceneId}" falló al renderizar: ${rendered.error}`,
        script: videoScript, scenePlan, assetPlan, outputs: [], costReport: null, qualityReports: [],
      });
    }
    scenePaths.push(rendered.outputPath);
    costEntries.push({ sceneId: scene.sceneId, provider: resolution.providerUsed ?? 'local_ffmpeg', estimatedCost: 0 });
  }

  // 6. Concatena TODAS las escenas reales en UN master real (MISMO
  // filter_complex real ya validado por postProduction.test.js).
  const masterPath = join(projectDir, 'master.mp4');
  const genericProfile = getOutputProfile('GENERIC_VERTICAL');
  const concatOps = ['MULTI_SCENE_CONCAT'];
  const concatParams = { MULTI_SCENE_CONCAT: { scenePaths } };
  if (musicSelection.status === 'SUCCESS') {
    concatOps.push('MUSIC_REPLACEMENT');
    concatParams.MUSIC_REPLACEMENT = { musicPath: musicSelection.track.path, musicVolume: 0.12, mode: 'mix' };
  }
  const masterResult = enhancement.apply({
    inputPath: scenePaths[0], outputPath: masterPath, outputProfile: genericProfile,
    operations: concatOps, operationParams: concatParams, ffmpegBinDir,
  });
  if (masterResult.status === 'POSTPRODUCTION_FAILED' || masterResult.status === 'VALIDATION_FAILED') {
    return Object.freeze({
      status: 'FAILED', creativeId, campaignId, batchId, generationId,
      error: `Concatenación real del master falló: ${masterResult.error}`,
      script: videoScript, scenePlan, assetPlan, outputs: [], costReport: null, qualityReports: [],
    });
  }
  const musicIncluded = masterResult.operationsApplied.includes('MUSIC_REPLACEMENT');

  // 7. Un render real por Output Profile pedido (RESIZE_TO_PROFILE ya real, sin duplicar el master).
  const outputs = [];
  const qualityReports = [];
  for (const profileName of outputProfileNames) {
    const profile = getOutputProfile(profileName);
    const outPath = join(projectDir, `output-${profileName}.mp4`);
    // eslint-disable-next-line no-await-in-loop
    const formatResult = enhancement.apply({
      inputPath: masterPath, outputPath: outPath, outputProfile: profile, operations: ['RESIZE_TO_PROFILE'], ffmpegBinDir,
    });
    const qa = runProductionQualityGate({
      outputPath: formatResult.status === 'POSTPRODUCTION_FAILED' ? masterPath : outPath,
      expectedVoiceoverDurationSeconds: audioDurationSeconds, expectedCtaText: creativeVariant.copy.cta,
      scenePlan, captionsApplied: true, musicIncluded, campaignId, creativeId, ffmpegBinDir,
    });
    qualityReports.push(Object.freeze({ profileName, ...qa }));
    outputs.push(Object.freeze({
      profileName, aspectRatio: profile.aspectRatio, outputPath: formatResult.status === 'POSTPRODUCTION_FAILED' ? null : outPath,
      status: formatResult.status, fileSizeBytes: formatResult.status !== 'POSTPRODUCTION_FAILED' && existsSync(outPath) ? statSync(outPath).size : null,
    }));
  }

  const overallStatus = qualityReports.some((q) => q.status === 'FAILED') ? 'FAILED'
    : qualityReports.some((q) => q.status === 'DEGRADED_PRODUCTION') ? 'DEGRADED_PRODUCTION' : 'FULL_PRODUCTION';

  const costReport = Object.freeze({
    entries: Object.freeze(costEntries),
    estimatedTotal: costEntries.reduce((s, e) => s + e.estimatedCost, 0),
    currency: 'USD',
  });

  return Object.freeze({
    status: overallStatus,
    campaignId, batchId, generationId, creativeId,
    conceptId: creativeVariant.conceptId, angleId: creativeVariant.angleId, hookId: creativeVariant.hookId,
    script: videoScript, scenePlan, assetPlan: Object.freeze(assetPlan), musicSelection,
    masterPath, outputs: Object.freeze(outputs), qualityReports: Object.freeze(qualityReports), costReport,
  });
}
