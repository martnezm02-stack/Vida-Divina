// real-e2e-creative-structure-ripped.mjs — PRUEBA REAL de extremo a extremo
// del Creative Structure Engine (VIDEO), Paso 24 del encargo. Mismo
// pipeline real ya validado por real-e2e-creative-director-ripped.mjs
// (CampaignIntent -> Creative Variant -> Creative Director -> produceCreative
// real, Voice Engine real, ffmpeg real), AHORA con una instrucción real
// explícita del usuario que debe cambiar la estructura narrativa
// recomendada -- confirma que la pieza NO queda forzada a
// Hook -> Producto -> CTA.
//
// Requiere: Voice Engine real corriendo (VOICE_ENGINE_URL, default
// localhost:8000) y ffmpeg real disponible en FFMPEG_BIN_DIR.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildCampaignIntent, computeCampaignId } from '../src/campaignIntent.js';
import { buildHypothesisExperiment } from '../src/hypothesisCreativeEngine.js';
import { buildVideoScript, assertVoiceoverTextSafe } from '../src/videoScriptGenerator.js';
import { produceCreative } from '../src/creativeProductionOrchestrator.js';
import { saveProductionJob } from '../src/productionJobStore.js';
import { previewStructureOptions } from '../src/creativeStructureEngine.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const VOICE_ENGINE_BASE_URL = process.env.VOICE_ENGINE_URL ?? 'http://localhost:8000';
const OUTPUT_DIR = join(PROJECT_ROOT, 'video-production', 'real-e2e-creative-structure-ripped');

const USER_INSTRUCTION = 'Quiero una mujer adulta entrenando en un gimnasio moderno, usando el producto de forma natural.';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

async function requireVoiceEngine() {
  try {
    const res = await fetch(`${VOICE_ENGINE_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error(`BLOQUEO real: Voice Engine no disponible en ${VOICE_ENGINE_BASE_URL} (${err.message}). Inícialo con "uvicorn app.main:app" dentro de voice-engine/.`);
    process.exit(1);
  }
}

async function generarVoiceoverReal(text) {
  const res = await fetch(`${VOICE_ENGINE_BASE_URL}/v1/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.VOICE_ENGINE_API_KEY ?? 'dev-local-only-change-me' },
    body: JSON.stringify({ text, language: 'es', voice_profile_id: 'manuel_es_mx' }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`Voice Engine respondió ${res.status}: ${await res.text().catch(() => '')}`);
  const body = await res.json();
  const { wslPathToWindowsUNC, leerInfoWav } = await import('../../tts-text-preprocessor/src/audioAssetAdapter.js');
  const wslUser = process.env.VOICE_ENGINE_WSL_USER ?? 'manuel1974';
  const windowsPath = wslPathToWindowsUNC(`/home/${wslUser}/vida-divina-voice-engine-data/output/${body.output_filename}`);
  if (!existsSync(windowsPath)) throw new Error(`Voice Engine generó "${body.output_filename}" pero no se encontró en ${windowsPath}.`);
  const info = leerInfoWav(windowsPath);
  return { resolvedPath: windowsPath, durationSeconds: info.duracionSegundos ?? info.durationSeconds };
}

await requireVoiceEngine();

paso(1, 'PRODUCT GROUNDED EVIDENCE real — Cápsulas Ripped (Divina Ripped Capsules)');
const evidence = buildProductGroundedEvidence('ripped-capsules');
if (!evidence) { console.error('BLOQUEO real: sin Product Facts reales para "ripped-capsules".'); process.exit(1); }

paso(2, 'PRODUCT VISUAL ASSET real — fotografía registrada de Divina Ripped Capsules');
const { getProduct } = await import('../../dashboard/server/lib/productCatalog.js');
const product = getProduct('ripped-capsules');
if (!product || product.rawAssets.length === 0) { console.error('BLOQUEO real: sin fotografías reales registradas para "ripped-capsules".'); process.exit(1); }
const productRawAssets = product.rawAssets.filter((a) => !a.error);

paso(3, 'CAMPAIGN INTENT real — mujeres adultas que entrenan en gimnasio');
const campaignIntent = buildCampaignIntent({
  productId: 'ripped-capsules',
  targetAudience: 'mujeres adultas que entrenan en el gimnasio',
  problemOrNeed: 'baja masa muscular y envejecimiento prematuro',
  campaignTerritory: 'energía y fuerza reales para entrenar en el gimnasio',
  campaignObjective: 'engagement',
  awarenessStage: 'Problem Aware',
});
const campaignId = computeCampaignId(campaignIntent);

paso(4, 'CREATIVE FACTORY real — 1 Creative Variant real (Hypothesis Experiment)');
const experiment = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 3, campaignIntent });
if (experiment.status !== 'HYPOTHESIS_EXPERIMENT_READY') { console.error(`BLOQUEO real: ${experiment.reason}`); process.exit(1); }
const creativeVariant = experiment.variantsDetail[0];

paso(5, 'CREATIVE STRUCTURE ENGINE real — recomendación con userInstruction real explícita');
const preview = previewStructureOptions({
  userInstruction: USER_INSTRUCTION, campaignIntent, creativeVariant, contentType: 'VIDEO',
});
console.log(`Estructura recomendada real: ${preview.recommended.structureId} (${preview.recommended.label})`);
console.log(`Razón real: ${preview.recommended.recommendationReason}`);
if (preview.recommended.structureId === 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA') {
  console.error('BLOQUEO real: la instrucción real de lifestyle/gimnasio debería recomendar STORY, no el default Hook→Problema→Solución→Producto→CTA.');
  process.exit(1);
}

const script = buildVideoScript({
  hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
  sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
  format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
});
if (!script.applicable) { console.error(`BLOQUEO real: ${script.reason}`); process.exit(1); }
assertVoiceoverTextSafe(script.voiceoverText);

mkdirSync(OUTPUT_DIR, { recursive: true });

paso(6, 'VOICEOVER REAL (Voice Engine) + PRODUCE VIDEO REAL con userInstruction');
const voz = await generarVoiceoverReal(script.voiceoverText);
console.log(`  audio real: ${voz.resolvedPath} (${voz.durationSeconds}s)`);

const projectDir = join(OUTPUT_DIR, 'variant-0');
const job = await produceCreative({
  creativeVariant, campaignIntent, productRawAssets,
  audioSourcePath: voz.resolvedPath, audioDurationSeconds: voz.durationSeconds,
  outputProfileNames: ['INSTAGRAM_REEL'], projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
  campaignId, batchId: `real-e2e-structure-ripped-${campaignId}`, generationId: 'gen-0', creativeId: 'creative-0',
  productFacts: { nombreComercial: evidence.nombreComercial, nombreVisible: evidence.nombreVisible },
  variantIndex: 0,
  userInstruction: USER_INSTRUCTION,
});
console.log(`  status real: ${job.status}`);
if (job.status !== 'FAILED') {
  const { productionJobId } = saveProductionJob({ job, projectDir });
  console.log(`  productionJobId real: ${productionJobId}`);
} else {
  console.error(`  error real: ${job.error}`);
}

paso(7, 'VERIFICACIÓN — estructura real distinta de Hook→Producto→CTA, tratamiento visual coherente, producto correcto, render real');
let ok = job.status !== 'FAILED';
if (ok) {
  const stages = job.scenePlan.creativeStructure.stages;
  console.log(`  Secuencia narrativa real: ${stages.join(' → ')}`);
  const esHookProductoCta = stages.length === 3 && stages[0] === 'HOOK' && stages[1] === 'PRODUCT' && stages[2] === 'CTA';
  console.log(`  Estructura != Hook→Producto→CTA fijo: ${!esHookProductoCta}`);
  console.log(`  selectionMode real: ${job.scenePlan.creativeStructure.selectionMode}`);
  console.log(`  tratamiento visual real: ${job.visualStrategy?.visualTreatmentLabel}`);
  const voiceoverMentionsNombreVisible = job.script.voiceoverText.includes('Cápsulas Ripped');
  const productScenes = job.scenePlan.scenes.filter((s) => s.visualIntent === 'PRODUCT_REVEAL');
  const productSceneUsesRealAsset = productScenes.length > 0 && productScenes.every((s) => {
    const resolution = job.assetPlan[job.scenePlan.scenes.indexOf(s)];
    return resolution.source === 'EXISTING_PRODUCT_ASSET' && resolution.imageSourcePath && existsSync(resolution.imageSourcePath);
  });
  console.log(`  voz usa "Cápsulas Ripped" = ${voiceoverMentionsNombreVisible} | escena(s) de producto usan fotografía real = ${productSceneUsesRealAsset}`);
  console.log(`  outputs reales: ${job.outputs.map((o) => `${o.profileName}:${o.status}${o.outputPath ? ` (${existsSync(o.outputPath) ? 'archivo real existe' : 'FALTA'})` : ''}`).join(', ')}`);
  ok = !esHookProductoCta && voiceoverMentionsNombreVisible && productSceneUsesRealAsset && job.outputs.every((o) => o.status !== 'RENDER_FAILED');
}

console.log('\n=== RESULTADO FINAL ===');
console.log(ok ? 'OK — Creative Structure Engine real confirmado (video).' : 'FALLÓ una o más verificaciones reales.');
if (!ok) process.exit(1);
