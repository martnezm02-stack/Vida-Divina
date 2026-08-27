// referenceAdaptation.js — Adaptar contenido / Video de referencia
// (2026-08-26). Capa HTTP delgada: ingiere y analiza un video de
// referencia real (ffprobe/ffmpeg, ver referenceVideoAnalyzer.js), y
// convierte el análisis + un producto real de Vida Divina en 2-3
// propuestas de adaptación reales -- reutilizando EXACTAMENTE el mismo
// Creative Strategy Engine (suggestHypothesisVariantsCore, generation.js)
// que ya usan Crear Autónomo/Crear Contenido. Ningún pipeline nuevo:
// producir la propuesta elegida es la MISMA llamada real que ya existe,
// POST /api/create/produce (batchId+variantIndex), sin cambios.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sendJson, badRequest, notFound, serverError, readJsonBody } from '../lib/http.js';
import { toMediaUrl, PROJECT_ROOT } from '../lib/safePaths.js';
import { getProduct } from '../lib/productCatalog.js';
import { ingestReferenceVideo, analyzeReferenceVideo } from '../../../content-orchestrator/src/referenceVideoAnalyzer.js';
import { saveReferenceAnalysis, getReferenceAnalysis, listReferenceAnalyses } from '../../../content-orchestrator/src/referenceAnalysisStore.js';
import { suggestHypothesisVariantsCore } from './generation.js';
import { buildAdaptationProposals } from '../lib/referenceAdaptationProposals.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const REFERENCE_VIDEOS_DIR = join(PROJECT_ROOT, 'video-production', 'reference-analysis');

/** Traduce keyframes/paths reales del análisis a mediaUrl servibles -- el cliente nunca recibe una ruta absoluta de filesystem. */
function analysisForClient(analysis) {
  return {
    ...analysis,
    source: { ...analysis.source, mediaUrl: toMediaUrl(analysis.source.originalPath) },
    keyframes: analysis.keyframes.map((k) => ({ ...k, mediaUrl: toMediaUrl(k.path) })),
  };
}

/**
 * POST /api/adapt/reference/analyze
 * body: { sourcePath } — ruta real local del video de referencia (puede
 * estar en cualquier carpeta del equipo del usuario, no solo dentro de las
 * raíces de medios del proyecto -- ese es justamente el punto de un video
 * de referencia externo). Se copia una vez a una carpeta contenida y
 * content-addressed (nunca se opera sobre el original). Si el MISMO video
 * real ya fue analizado antes, se reutiliza el análisis persistido -- no
 * se vuelve a correr ffmpeg/ffprobe (regla 11).
 */
export async function handleAnalyzeReference(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { sourcePath } = body;
  if (!sourcePath?.trim()) { badRequest(res, 'REFERENCE: "sourcePath" es obligatorio (ruta real local del video de referencia).'); return; }
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    badRequest(res, `REFERENCE: no existe ningún archivo real en "${sourcePath}".`);
    return;
  }

  let ingested;
  try {
    ingested = ingestReferenceVideo(sourcePath, { referenceDir: REFERENCE_VIDEOS_DIR });
  } catch (err) {
    badRequest(res, err.message);
    return;
  }

  const existing = getReferenceAnalysis(ingested.referenceId);
  if (existing) {
    sendJson(res, 200, { analysis: analysisForClient(existing), reused: true });
    return;
  }

  try {
    const analysis = analyzeReferenceVideo({
      referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_VIDEOS_DIR, ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    saveReferenceAnalysis(analysis);
    sendJson(res, 200, { analysis: analysisForClient(analysis), reused: false });
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleListReferenceAnalyses(req, res) {
  const analyses = listReferenceAnalyses().map(analysisForClient);
  sendJson(res, 200, analyses);
}

/**
 * POST /api/adapt/reference/propose
 * body: { referenceId, productId } — el análisis real ya debe existir
 * (handleAnalyzeReference). Genera 2-3 propuestas reales de adaptación
 * para el producto real elegido, vía el MISMO Creative Strategy Engine
 * (suggestHypothesisVariantsCore) -- nunca redacta copy aquí, nunca lanza
 * una producción real (eso solo ocurre cuando el usuario elige una
 * propuesta y llama a /api/create/produce, ya existente).
 */
export async function handleProposeReferenceAdaptation(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { referenceId, productId } = body;
  if (!referenceId?.trim()) { badRequest(res, 'REFERENCE: "referenceId" es obligatorio.'); return; }
  if (!productId?.trim()) { badRequest(res, 'REFERENCE: "productId" es obligatorio -- no se inventa un producto.'); return; }

  const analysis = getReferenceAnalysis(referenceId);
  if (!analysis) { notFound(res, `REFERENCE: no existe ningún análisis real para "${referenceId}" -- analiza el video de referencia primero.`); return; }
  if (!getProduct(productId)) { badRequest(res, `REFERENCE: "${productId}" no es un producto real ya registrado.`); return; }

  try {
    const result = await suggestHypothesisVariantsCore({ productId, variantCount: 3, campaignIntent: null });
    if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
      sendJson(res, 200, result);
      return;
    }
    const proposals = buildAdaptationProposals(result, analysis);
    sendJson(res, 200, { status: 'PROPOSALS_READY', referenceId, productId, proposals });
  } catch (err) {
    serverError(res, err);
  }
}
