// projects.js — Editable Video Project (2026-08-24). Capa HTTP delgada
// sobre content-orchestrator/src/editableVideoProject.js /
// productionJobStore.js / projectEditor.js / projectRenderer.js -- MISMO
// criterio que generation.js: valida la solicitud contra datos reales ya
// conocidos, arma los argumentos, y delega. Nunca reimplementa el modelo
// de proyecto ni la lógica de render aquí.

import { randomUUID } from 'node:crypto';
import { sendJson, badRequest, notFound, serverError, readJsonBody } from '../lib/http.js';
import { toMediaUrl } from '../lib/safePaths.js';
import { generateNewVoiceover } from '../lib/voiceEngineClient.js';
import { getProductionJob, saveProductionJob } from '../../../content-orchestrator/src/productionJobStore.js';
import { buildDisplayName } from '../../../content-orchestrator/src/displayName.js';
import { getProduct } from '../lib/productCatalog.js';
import {
  buildEditableProjectFromProductionJob, getLatestVersion, currentSceneNarration, currentSceneBaseDuration,
} from '../../../content-orchestrator/src/editableVideoProject.js';
import { saveProject, getProject, listProjectsForCreative } from '../../../content-orchestrator/src/editableProjectStore.js';
import { applyProjectEdit, applyVoiceRegeneration, classifyChangeset } from '../../../content-orchestrator/src/projectEditor.js';
import { renderProjectVersion, normalizeVoiceLoudnessReal, reconcileVoiceTimingReal } from '../../../content-orchestrator/src/projectRenderer.js';
import { leerInfoWav } from '../../../tts-text-preprocessor/src/audioAssetAdapter.js';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { listMusicLibrary } from '../../../content-orchestrator/src/musicProvider.js';
import { assertVoiceoverTextSafe } from '../../../content-orchestrator/src/videoScriptGenerator.js';
import {
  CAPTION_POSITIONS, CAPTION_ALIGNMENTS, CAPTION_ANIMATIONS, CAPTION_VISIBILITY_MODES, CAPTION_FONT_FAMILIES,
  CAPTION_PRESET_NAMES, resolveCaptionPreset,
} from '../../../video-production/src/captionStyle.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

function versionWithMediaUrls(version) {
  return {
    ...version,
    masterPath: undefined,
    masterMediaUrl: version.masterPath ? toMediaUrl(version.masterPath) : null,
    outputs: (version.outputs ?? []).map((o) => ({ ...o, mediaUrl: o.outputPath ? toMediaUrl(o.outputPath) : null })),
  };
}

function projectForClient(project) {
  return { ...project, versions: project.versions.map(versionWithMediaUrls) };
}

/** POST /api/projects — crea (o recupera, si ya existe uno) un EditableVideoProject real sobre un ProductionJob ya producido. */
export async function handleCreateProject(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { productionJobId } = body;
  if (!productionJobId?.trim()) { badRequest(res, 'projects: "productionJobId" es obligatorio -- un proyecto editable siempre envuelve un ProductionJob real ya producido.'); return; }

  let jobRecord;
  try {
    jobRecord = getProductionJob(productionJobId);
  } catch (err) {
    notFound(res, err.message);
    return;
  }

  try {
    const project = buildEditableProjectFromProductionJob({ jobRecord });
    saveProject(project);
    sendJson(res, 200, projectForClient(project));
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleGetProject(req, res, projectId) {
  try {
    const project = getProject(projectId);
    sendJson(res, 200, projectForClient(project));
  } catch (err) {
    notFound(res, err.message);
  }
}

export async function handleListProjectsForCreative(req, res, url) {
  const creativeId = url.searchParams.get('creativeId');
  if (!creativeId?.trim()) { badRequest(res, 'projects: "creativeId" es obligatorio.'); return; }
  try {
    const projects = listProjectsForCreative(creativeId);
    sendJson(res, 200, { projects: projects.map(projectForClient) });
  } catch (err) {
    serverError(res, err);
  }
}

/** POST /api/projects/:projectId/edit — aplica ediciones reales al draft (Save), SIN renderizar. */
export async function handleEditProject(req, res, projectId) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  let project;
  try { project = getProject(projectId); } catch (err) { notFound(res, err.message); return; }

  try {
    const edited = applyProjectEdit(project, body.edits ?? {});
    saveProject(edited);
    const changeset = classifyChangeset(getLatestVersion(edited), edited);
    sendJson(res, 200, { project: projectForClient(edited), pendingChangeset: changeset });
  } catch (err) {
    badRequest(res, err.message);
  }
}

/**
 * POST /api/projects/:projectId/scenes/:sceneId/regenerate-voice — Problema
 * 4 "EDITAR VOICEOVER DEBE REGENERAR LA VOZ". ÚNICO camino real por el que
 * el audio de una escena cambia -- invocado SOLO por el botón explícito
 * "Regenerar voz" de la UI (nunca al escribir, ver editor.js), nunca
 * automáticamente al editar el Hook/On-Screen Text ni el estilo/
 * visibilidad de captions (Regla de Capas).
 *
 * Mismo patrón real que POST /api/create (generation.js#handleCreate):
 * Claim Safety (assertVoiceoverTextSafe) ANTES de llamar a Voice Engine
 * (nunca gasta una generación real sobre texto que de todas formas se
 * rechazaría), y el MISMO Voice Engine ya existente (voiceEngineClient.js)
 * -- nunca un segundo TTS. El resultado real (WAV + duración real medida)
 * se aplica sobre el proyecto vía applyVoiceRegeneration() (projectEditor.js),
 * que también deja lineage real (voiceTrack.isRegenerated/regeneratedAt).
 */
export async function handleRegenerateSceneVoice(req, res, projectId, sceneId) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }

  let project;
  try { project = getProject(projectId); } catch (err) { notFound(res, err.message); return; }
  const scene = project.scenes.find((s) => s.sceneId === sceneId);
  if (!scene) { notFound(res, `projects: la escena "${sceneId}" no existe en el proyecto "${projectId}".`); return; }

  const voiceoverText = (body.voiceoverText?.trim() || currentSceneNarration(scene))?.trim();
  if (!voiceoverText) { badRequest(res, 'projects: se requiere un voiceoverText real (o que la escena ya tenga narración) para regenerar la voz.'); return; }

  try {
    assertVoiceoverTextSafe(voiceoverText, 'voiceoverText');
  } catch (err) {
    sendJson(res, 200, { status: 'VALIDATION_FAILED', errors: [err.message] });
    return;
  }

  // VOICE REGENERATION METADATA (Paso 2/7 del encargo "Consistencia de
  // audio..."): reutiliza los MISMOS parámetros reales de Voice Engine ya
  // usados por esta escena (voiceTrack.voiceParams, si ya se regeneró
  // antes) -- nunca varía en silencio entre regeneraciones sucesivas de
  // la MISMA escena. Sin uno previo, generateNewVoiceover() cae al
  // DEFAULT_VOICE_PARAMS centralizado real (mismo criterio real que la
  // producción original).
  let resultadoVoz;
  try {
    resultadoVoz = await generateNewVoiceover({ text: voiceoverText, voiceParams: scene.voiceTrack?.voiceParams ?? undefined });
  } catch (err) {
    sendJson(res, 200, { status: 'SOURCE_ASSET_REQUIRED', error: err.message });
    return;
  }

  try {
    // AUDIO NORMALIZATION — PER SCENE (Paso 3 del encargo): normaliza el
    // loudness real del segmento NUEVO antes de incorporarlo al proyecto
    // -- política real centralizada (VOICE_NORMALIZATION), nunca valores
    // distintos por escena.
    const workDir = join(project.sourceProjectDir, 'voice-regen', sceneId);
    mkdirSync(workDir, { recursive: true });
    const normalizedPath = join(workDir, `voice-${Date.now()}-normalized.wav`);
    normalizeVoiceLoudnessReal(resultadoVoz.resolvedPath, normalizedPath, FFMPEG_BIN_DIR);

    // PROSODY / SPEECH RATE (Paso 5/6 del encargo): reconcilia la
    // duración real nueva contra el target real vigente de la escena
    // (su duración real ANTES de esta regeneración -- original o de una
    // regeneración real anterior, ver currentSceneBaseDuration()) --
    // corrección real de tempo SOLO dentro de la banda segura real,
    // nunca time-stretch extremo.
    const targetDurationSeconds = currentSceneBaseDuration(scene);
    const infoNormalizado = leerInfoWav(normalizedPath);
    const measuredDurationSeconds = infoNormalizado.duracionSegundos ?? resultadoVoz.durationSeconds;
    const {
      audioPath: finalAudioPath, actualDurationSeconds, voiceTimingMismatch,
    } = reconcileVoiceTimingReal({
      sourcePath: normalizedPath, targetDurationSeconds, measuredDurationSeconds, workDir, ffmpegBinDir: FFMPEG_BIN_DIR,
    });

    // 1. Guarda el texto real como fuente de verdad de la escena (Save
    //    implícito -- el usuario ya confirmó "Regenerar voz" con este texto).
    let updated = applyProjectEdit(project, { scenes: { [sceneId]: { voiceoverTextOverride: voiceoverText } } });
    // 2. Aplica el resultado real de Voice Engine YA normalizado/reconciliado
    //    (WAV + duración real) -- único lugar donde voiceTrack.sourcePath
    //    real cambia. targetDurationMs/actualDurationMs (Paso 6) + voiceParams
    //    real (Paso 2/7) quedan como lineage real para la próxima regeneración.
    updated = applyVoiceRegeneration(updated, sceneId, {
      audioSourcePath: finalAudioPath, audioDurationSeconds: actualDurationSeconds,
      targetDurationMs: Math.round(targetDurationSeconds * 1000),
      actualDurationMs: Math.round(actualDurationSeconds * 1000),
      voiceTimingMismatch,
      voiceParams: resultadoVoz.resolvedVoiceParams,
    });
    saveProject(updated);
    const changeset = classifyChangeset(getLatestVersion(updated), updated);
    sendJson(res, 200, { project: projectForClient(updated), pendingChangeset: changeset, voiceTimingMismatch });
  } catch (err) {
    badRequest(res, err.message);
  }
}

/** POST /api/projects/:projectId/render — Render real (agrega versión nueva) o Preview real (no agrega versión). */
export async function handleRenderProject(req, res, projectId) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const mode = body.mode === 'PREVIEW' ? 'PREVIEW' : 'RENDER';

  let project;
  try { project = getProject(projectId); } catch (err) { notFound(res, err.message); return; }

  try {
    const version = await renderProjectVersion(project, { ffmpegBinDir: FFMPEG_BIN_DIR, mode });
    if (mode === 'RENDER' && version.status !== 'FAILED') {
      // ProductionJob real por versión (Corrección "Flujo creativo
      // integral", 2026-08-28, Paso 20/21 del encargo): antes, un render
      // real de V2 solo vivía dentro de project.versions[] -- nunca tenía
      // productionJobId propio, así que quedaba SIN la protección real de
      // findAssetDependents() (que solo consulta productionJobStore.js) y
      // sin lineage explícito real hacia la versión anterior. Se persiste
      // aquí con el MISMO saveProductionJob() de siempre (nunca un
      // segundo store) -- "job" es el "version" real mismo (ya trae
      // status/masterPath/outputs, mismo contrato real que valida
      // saveProductionJob()), con projectDir = version.renderDir real
      // (carpeta física DISTINTA de V1, ver projectRenderer.js).
      const previousProductionJobId = getLatestVersion(project).productionJobId ?? project.productionJobId ?? null;
      const { productionJobId } = saveProductionJob({ job: version, projectDir: version.renderDir });

      // displayName real (Paso 17/18 del encargo) -- conceptId/angleId
      // reales vienen del ProductionJob ORIGINAL (nunca inventados aquí;
      // el EditableVideoProject real no los guarda por separado).
      let conceptId = null;
      let angleId = null;
      try {
        const original = getProductionJob(project.productionJobId);
        conceptId = original.job.conceptId ?? null;
        angleId = original.job.angleId ?? null;
      } catch { /* ProductionJob original real ya no disponible -- displayName se degrada sin concepto, nunca inventa uno. */ }
      const product = getProduct(project.campaignId);
      const outputsConNombre = version.outputs.map((o) => ({
        ...o,
        ...buildDisplayName({
          nombreVisible: product?.nombreVisible, nombreComercial: product?.nombreComercial,
          conceptId, angleId, outputProfileName: o.profileName, versionNumber: version.versionNumber,
        }),
      }));

      const versionConLineage = {
        ...version, productionJobId, previousProductionJobId, outputs: Object.freeze(outputsConNombre),
      };
      const updated = { ...project, versions: [...project.versions, versionConLineage], updatedAt: new Date().toISOString() };
      saveProject(updated);
      sendJson(res, 200, { project: projectForClient(updated), version: versionWithMediaUrls(versionConLineage) });
      return;
    }
    sendJson(res, 200, { version: versionWithMediaUrls(version) });
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleMusicLibrary(req, res) {
  try {
    const tracks = listMusicLibrary().filter((t) => t.license);
    sendJson(res, 200, { tracks: tracks.map((t) => ({ filename: t.filename, license: t.license })) });
  } catch (err) {
    serverError(res, err);
  }
}

/**
 * GET /api/caption-style-options — Problema 3 "FALTA EL EDITOR REAL DE
 * ESTILOS DE CAPTIONS". Expone las opciones/presets REALES de
 * video-production/src/captionStyle.js para que el editor del Dashboard
 * las consuma tal cual (nunca duplica los valores de los presets en el
 * cliente -- una sola fuente de verdad).
 */
export async function handleCaptionStyleOptions(req, res) {
  try {
    const presets = Object.fromEntries(CAPTION_PRESET_NAMES.map((name) => [name, resolveCaptionPreset(name)]));
    sendJson(res, 200, {
      positions: CAPTION_POSITIONS,
      alignments: CAPTION_ALIGNMENTS,
      animations: CAPTION_ANIMATIONS,
      visibilityModes: CAPTION_VISIBILITY_MODES,
      fontFamilies: CAPTION_FONT_FAMILIES,
      presetNames: CAPTION_PRESET_NAMES,
      presets,
    });
  } catch (err) {
    serverError(res, err);
  }
}
