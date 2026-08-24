// campaignPilot.js — Fase 16, Parte 13/14/15: primera Campaign Pilot real
// desde el Dashboard. Hallazgo real de esta fase: /api/content-plans es
// SOLO LECTURA (Fase 12/13 lo documentan explícitamente) -- ningún
// endpoint del dashboard invocaba planContent() todavía; los ContentPlan
// ya visibles en el dashboard fueron creados por un proceso externo
// (script/servicio), nunca por el Dashboard mismo. Este archivo cierra ese
// hueco: reutiliza planContent() real (content-planning/src/
// contentPlanningService.js) -- el mismo StrategyContext real +
// buildCreativeProposal real + generateContent() real (idéntico renderer
// que ya usa /api/create) + Quality Gate real. Nunca reimplementa ninguno.
//
// Seguridad de esta fase (Human-in-the-loop, NO auto-publish): este
// endpoint rechaza explícitamente executionMode=AUTO_PUBLISH con 400,
// además de la protección real ya existente dentro de planContent()
// (nunca aprueba/publica sin que autoPublishConfig.enabled sea true, que
// hoy es false) -- doble cinturón, no una nueva regla de negocio.

import { sendJson, badRequest, serverError, readJsonBody } from '../lib/http.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getProduct } from '../lib/productCatalog.js';
import { listExistingAudioAssets, generateNewVoiceover } from '../lib/voiceEngineClient.js';
import { PROJECT_ROOT } from '../lib/safePaths.js';
import { dividirEnFrases } from '../../../content-orchestrator/src/contentOrchestrator.js';
import { getOutputProfile } from '../../../content-orchestrator/src/outputProfiles.js';
import { planContent } from '../../../content-planning/src/contentPlanningService.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const DASHBOARD_OUTPUT_ROOT = join(PROJECT_ROOT, 'video-production', 'dashboard-outputs');

const ALLOWED_EXECUTION_MODES = Object.freeze(['PREPARE_ONLY', 'HUMAN_REVIEW']);

/**
 * Construye `generationInputs` real (mismo shape exacto que
 * generation.js#handleCreate ya valida y usa para /api/create) -- sin
 * generationInputs completos, planContent() se detiene en PROPOSAL_READY
 * (comportamiento real ya documentado, no una limitación nueva).
 * Devuelve { error } si algo no es válido, o { generationInputs } si sí.
 */
async function buildGenerationInputs(body) {
  const { productId, hookText, ctaText, voiceoverText, productBody, audioSource, audioAssetPath, imageAssetPath, outputProfileNames } = body;
  if (!Array.isArray(outputProfileNames) || outputProfileNames.length === 0) return { error: 'se requiere al menos 1 Output Profile real.' };
  try { outputProfileNames.forEach((n) => getOutputProfile(n)); } catch (err) { return { error: err.message }; }

  const product = getProduct(productId);
  let audioSourcePath, audioDurationSeconds;
  if (audioSource === 'generate') {
    try {
      const resultado = await generateNewVoiceover({ text: voiceoverText });
      audioSourcePath = resultado.resolvedPath;
      audioDurationSeconds = resultado.durationSeconds;
    } catch (err) {
      return { error: `Voice Engine: ${err.message}` };
    }
  } else {
    const encontrado = listExistingAudioAssets().find((a) => a.path === audioAssetPath);
    if (!encontrado) return { error: `"audioAssetPath" debe ser uno de los Audio Assets reales ya listados en /api/audio-assets (recibido: ${audioAssetPath}).` };
    audioSourcePath = encontrado.path;
    audioDurationSeconds = encontrado.durationSeconds;
  }

  let imageAssetSourcePath = null;
  if (imageAssetPath) {
    const rawReal = (product?.rawAssets ?? []).find((a) => a.sourcePath === imageAssetPath);
    if (!rawReal) return { error: `"imageAssetPath" debe ser una fotografía RAW real ya registrada para "${productId}" (recibido: ${imageAssetPath}).` };
    imageAssetSourcePath = rawReal.sourcePath;
  }

  const productTitle = product?.nombreComercial ?? productId;
  const renderArgs = {
    hookText, productTitle, productBody: imageAssetSourcePath ? null : productBody, ctaText, whatsappLabel: 'WhatsApp',
    voiceoverLines: dividirEnFrases(voiceoverText),
  };
  const projectDir = join(DASHBOARD_OUTPUT_ROOT, `campaign-pilot-${randomUUID()}`, 'master-project');

  return {
    generationInputs: {
      renderArgs, productId, audioSourcePath, audioDurationSeconds, imageAssetSourcePath,
      outputProfileNames, projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
    },
  };
}

/**
 * POST /api/content-plans/generate
 * body: { userIntent, executionMode ('PREPARE_ONLY'|'HUMAN_REVIEW'), campaign?: object,
 *   -- opcional, solo si se quiere un AssetPackage real renderizado (Parte 15/16):
 *   productId?, hookText?, ctaText?, voiceoverText?, productBody?, audioSource?, audioAssetPath?, imageAssetPath?, outputProfileNames? }
 *
 * Sin los campos de render: se detiene en READY_FOR_REVIEW/PROPOSAL real
 * (StrategyContext + Creative Proposal reales, sin AssetPackage) -- mismo
 * comportamiento real y documentado de planContent(). Con ellos: llama al
 * ÚNICO renderer real (generateContent(), vía planContent()) y pasa por el
 * Quality Gate real.
 */
export async function handleGenerateContentPlan(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }

  const { userIntent, executionMode = 'PREPARE_ONLY', caption = null, requireHumanReview = false, assetPackage = null } = body;
  if (!userIntent?.trim()) { badRequest(res, 'CAMPAIGN PILOT: "userIntent" es obligatorio.'); return; }
  if (!ALLOWED_EXECUTION_MODES.includes(executionMode)) {
    badRequest(res, `CAMPAIGN PILOT: "executionMode" debe ser uno de ${ALLOWED_EXECUTION_MODES.join(', ')} -- esta fase es human-in-the-loop, AUTO_PUBLISH no se activa desde este endpoint.`);
    return;
  }

  // `assetPackage`: registra un Final Asset Package YA renderizado (ej. el
  // resultado real de Crear/Carrusel/Adaptar) como ContentPlan real, sin
  // volver a renderizar -- mismo parámetro real que planContent() ya acepta.
  // Si además se mandan campos de render (productId, hookText, ...), esos
  // se ignoran a favor del asset ya real (evita un segundo render del mismo
  // contenido).
  let generationInputs = null;
  if (!assetPackage && body.productId) {
    const built = await buildGenerationInputs(body);
    if (built.error) { badRequest(res, `CAMPAIGN PILOT: ${built.error}`); return; }
    generationInputs = built.generationInputs;
  }

  try {
    const { plan } = await planContent({ userIntent, executionMode, assetPackage, generationInputs, caption, requireHumanReview });
    sendJson(res, 200, plan);
  } catch (err) {
    serverError(res, err);
  }
}
