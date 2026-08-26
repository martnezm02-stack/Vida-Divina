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
import { getProductionJob } from '../../../content-orchestrator/src/productionJobStore.js';
import {
  buildEditableProjectFromProductionJob, getLatestVersion, currentSceneNarration,
} from '../../../content-orchestrator/src/editableVideoProject.js';
import { saveProject, getProject, listProjectsForCreative } from '../../../content-orchestrator/src/editableProjectStore.js';
import { applyProjectEdit, applyVoiceRegeneration, classifyChangeset } from '../../../content-orchestrator/src/projectEditor.js';
import { renderProjectVersion } from '../../../content-orchestrator/src/projectRenderer.js';
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

  let resultadoVoz;
  try {
    resultadoVoz = await generateNewVoiceover({ text: voiceoverText });
  } catch (err) {
    sendJson(res, 200, { status: 'SOURCE_ASSET_REQUIRED', error: err.message });
    return;
  }

  try {
    // 1. Guarda el texto real como fuente de verdad de la escena (Save
    //    implícito -- el usuario ya confirmó "Regenerar voz" con este texto).
    let updated = applyProjectEdit(project, { scenes: { [sceneId]: { voiceoverTextOverride: voiceoverText } } });
    // 2. Aplica el resultado real de Voice Engine (WAV + duración real) --
    //    único lugar donde voiceTrack.sourcePath real cambia.
    updated = applyVoiceRegeneration(updated, sceneId, {
      audioSourcePath: resultadoVoz.resolvedPath, audioDurationSeconds: resultadoVoz.durationSeconds,
    });
    saveProject(updated);
    const changeset = classifyChangeset(getLatestVersion(updated), updated);
    sendJson(res, 200, { project: projectForClient(updated), pendingChangeset: changeset });
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
      const updated = { ...project, versions: [...project.versions, version], updatedAt: new Date().toISOString() };
      saveProject(updated);
      sendJson(res, 200, { project: projectForClient(updated), version: versionWithMediaUrls(version) });
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
