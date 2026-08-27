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
import { buildVisualStrategy } from './creativeDirector.js';
import { resolveVisualGenerationRequest } from './visualGenerationRequest.js';
import { resolveAssetPlan } from './assetResolver.js';
import { selectProvider } from './providerRouter.js';
import { runProductionQualityGate } from './productionQualityGate.js';
import { LocalFfmpegEnhancementProvider } from './enhancementProvider.js';
import { selectMusicTrack } from './musicProvider.js';
import { getOutputProfile } from './outputProfiles.js';
import { OpenAIImageProvider } from '../../image-generation/src/providers/openAIImageProvider.js';
import { MiniMaxVideoProvider } from '../../video-generation/src/providers/miniMaxVideoProvider.js';

// Pricing público estimado (Paso 34 del encargo: "economic provider" antes
// que "premium") -- documentado junto a cada adapter real (ver
// openAIImageProvider.js/miniMaxVideoProvider.js), solo referenciado aquí
// para construir la lista real de candidatos del Provider Router.
const OPENAI_IMAGE_ESTIMATED_COST_USD = 0.02;
const MINIMAX_VIDEO_ESTIMATED_COST_USD = 0.50;

/**
 * Provider Router REAL (Paso 13 del encargo Creative Director) -- decisión
 * auditable (chosen/reason) sobre la lista real de candidatos de imagen
 * disponibles en este entorno. Sin OPENAI_API_KEY real, "chosen" es null y
 * assetResolver.js cae al fallback tipográfico real (nunca simula una
 * generación). NUNCA se incluye MockImageProvider como candidato real de
 * producción -- un mock nunca es un candidato válido para un asset final.
 */
function routeImageProvider() {
  return selectProvider({
    task: 'image',
    candidates: [{ provider: new OpenAIImageProvider(), estimatedCost: OPENAI_IMAGE_ESTIMATED_COST_USD }],
  });
}

function routeVideoProvider() {
  return selectProvider({
    task: 'video',
    candidates: [{ provider: new MiniMaxVideoProvider(), estimatedCost: MINIMAX_VIDEO_ESTIMATED_COST_USD }],
  });
}

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
 *   productFacts?: ?object, variantIndex?: number,
 * }} args
 * @returns {Promise<object>} ProductionJob real.
 */
export async function produceCreative({
  creativeVariant, campaignIntent = null, productRawAssets = [],
  audioSourcePath, audioDurationSeconds, outputProfileNames, projectDir, ffmpegBinDir = null,
  campaignId = null, batchId = null, generationId = null, creativeId = randomUUID(),
  // undefined (no "null") es la señal real de "el llamador no decidió" --
  // así produceCreative() puede enrutar un provider real por defecto
  // (Provider Router, Paso 13) SIN romper a quien explícitamente pasa
  // "null" para forzar el fallback tipográfico (comportamiento
  // preexistente intacto, ver tests).
  imageProvider = undefined, videoProvider = undefined, includeMusic = true,
  productFacts = null, variantIndex = 0,
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
  const scenePlanBase = Object.freeze({ ...scenePlanEstimado, scenes: Object.freeze(scenePlanEstimado.scenes.map((s) => proporcion(s, factorEscala))), totalDurationSeconds: audioDurationSeconds });

  // 2b. CREATIVE DIRECTOR real (nueva capa, Paso 1 del encargo Creative
  // Director/Visual Generation Provider Router): transforma el Scene Plan
  // real en una Visual Strategy real -- tratamiento visual, dirección de
  // escena, product grounding -- SOLO añade campos sobre las MISMAS
  // escenas reales de scenePlanner.js, nunca las reemplaza.
  const visualStrategy = buildVisualStrategy({
    creativeVariant, campaignIntent, productFacts, productRawAssets, scenePlan: scenePlanBase,
    format: creativeVariant.creativeVariant.format, variantIndex, campaignId, batchId, creativeId,
  });
  const scenePlan = Object.freeze({ ...scenePlanBase, scenes: visualStrategy.sceneVisuals });

  // 3. PROVIDER ROUTER real (Paso 13) -- decisión auditable, sin
  // credenciales reales cae a null (assetResolver.js usa el fallback
  // tipográfico real, nunca simula una generación). "undefined" del
  // llamador es la señal real de "decide tú"; "null" explícito del
  // llamador sigue forzando el fallback tipográfico (comportamiento
  // preexistente intacto, ver tests).
  const imageRouting = imageProvider === undefined ? routeImageProvider() : null;
  const resolvedImageProvider = imageProvider === undefined ? imageRouting.chosen : imageProvider;
  const videoRouting = videoProvider === undefined ? routeVideoProvider() : null;
  const resolvedVideoProvider = videoProvider === undefined ? videoRouting.chosen : videoProvider;

  // 3b. ASSET PLAN real -- prioridad real (existente > generado local > stock > premium > tipográfico).
  const assetPlan = await resolveAssetPlan({ scenes: scenePlan.scenes, imageProvider: resolvedImageProvider, videoProvider: resolvedVideoProvider });

  // Visual Generation Requests reales (Paso 15/22 del encargo): une el
  // request PENDIENTE que ya construyó el Creative Director con la
  // resolución REAL de Asset Resolver -- honesto por diseño (ver
  // visualGenerationRequest.js): nunca etiqueta un fallback tipográfico
  // como "generado por IA".
  const requestBySceneId = new Map(visualStrategy.imageGenerationRequests.map((r) => [r.sceneId, r]));
  const visualGenerationRequests = Object.freeze(
    assetPlan
      .filter((resolution) => requestBySceneId.has(resolution.sceneId))
      .map((resolution) => resolveVisualGenerationRequest(requestBySceneId.get(resolution.sceneId), resolution)),
  );

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
    costEntries.push({
      sceneId: scene.sceneId,
      provider: resolution.providerUsed ?? 'local_ffmpeg',
      estimatedCost: resolution.cost?.estimatedCost ?? 0,
      actualCost: resolution.cost?.actualCost ?? 0,
    });
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
    actualTotal: costEntries.reduce((s, e) => s + (e.actualCost ?? 0), 0),
    currency: 'USD',
  });

  return Object.freeze({
    status: overallStatus,
    campaignId, batchId, generationId, creativeId,
    conceptId: creativeVariant.conceptId, angleId: creativeVariant.angleId, hookId: creativeVariant.hookId,
    script: videoScript, scenePlan, assetPlan: Object.freeze(assetPlan), musicSelection,
    // Creative Director / Visual Generation Provider Router (Paso 1/13/15
    // del encargo) -- visualStrategySummary omite "sceneVisuals" (ya está,
    // MÁS completo, dentro de scenePlan.scenes; evita duplicar el mismo
    // dato dos veces en el mismo ProductionJob real).
    visualStrategy: (({ sceneVisuals, ...rest }) => Object.freeze(rest))(visualStrategy),
    visualGenerationRequests,
    providerRouting: Object.freeze({
      image: imageRouting ? Object.freeze({ chosenProvider: imageRouting.chosen?.providerName ?? null, reason: imageRouting.reason }) : Object.freeze({ chosenProvider: resolvedImageProvider?.providerName ?? null, reason: 'produceCreative: provider de imagen explícito del llamador (no enrutado).' }),
      video: videoRouting ? Object.freeze({ chosenProvider: videoRouting.chosen?.providerName ?? null, reason: videoRouting.reason }) : Object.freeze({ chosenProvider: resolvedVideoProvider?.providerName ?? null, reason: 'produceCreative: provider de video explícito del llamador (no enrutado).' }),
    }),
    masterPath, outputs: Object.freeze(outputs), qualityReports: Object.freeze(qualityReports), costReport,
  });
}
