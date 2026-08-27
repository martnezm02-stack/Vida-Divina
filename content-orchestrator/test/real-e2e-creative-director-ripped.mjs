// real-e2e-creative-director-ripped.mjs — PRUEBA REAL de extremo a extremo
// del Creative Director (Paso 28/29 del encargo Creative Director / Visual
// Generation Provider Router), no un test unitario. Ejecuta el pipeline
// COMPLETO real para "Cápsulas Ripped" (Divina Ripped Capsules):
//
//   CampaignIntent real -> buildHypothesisExperiment (5 Creative Variants
//   reales) -> Creative Director (visualStrategy con tratamiento real
//   distinto por variante) -> produceCreative (2 videos reales completos:
//   guion, escenas, Voice Engine real, captions, composición ffmpeg real,
//   QA, Editable Video Project) -> verificación real de product grounding
//   (texto usa "Cápsulas Ripped", visual usa la fotografía real registrada
//   de "Divina Ripped Capsules", nunca un empaque inventado).
//
// Requiere: Voice Engine real corriendo (VOICE_ENGINE_URL, default
// localhost:8000) y ffmpeg real disponible en FFMPEG_BIN_DIR. Sin eso,
// falla explícitamente -- nunca simula un resultado.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildCampaignIntent, computeCampaignId } from '../src/campaignIntent.js';
import { buildHypothesisExperiment } from '../src/hypothesisCreativeEngine.js';
import { buildVideoScript, assertVoiceoverTextSafe } from '../src/videoScriptGenerator.js';
import { produceCreative } from '../src/creativeProductionOrchestrator.js';
import { saveProductionJob } from '../src/productionJobStore.js';
import { assignVisualTreatment } from '../src/visualTreatments.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const VOICE_ENGINE_BASE_URL = process.env.VOICE_ENGINE_URL ?? 'http://localhost:8000';
const OUTPUT_DIR = join(PROJECT_ROOT, 'video-production', 'real-e2e-creative-director-ripped');

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
console.log('nombreComercial (técnico):', evidence.nombreComercial);
console.log('nombreVisible (texto/voz):', evidence.nombreVisible);
if (evidence.nombreVisible !== 'Cápsulas Ripped') { console.error(`BLOQUEO real: nombreVisible esperado "Cápsulas Ripped", obtuvo "${evidence.nombreVisible}".`); process.exit(1); }

paso(2, 'PRODUCT VISUAL ASSET real — fotografía registrada de Divina Ripped Capsules');
const { getProduct } = await import('../../dashboard/server/lib/productCatalog.js');
const product = getProduct('ripped-capsules');
if (!product || product.rawAssets.length === 0) { console.error('BLOQUEO real: sin fotografías reales registradas para "ripped-capsules".'); process.exit(1); }
console.log('assets reales encontrados:', product.rawAssets.map((a) => a.originalFilename ?? a.sourcePath));
const productRawAssets = product.rawAssets.filter((a) => !a.error);

paso(3, 'CAMPAIGN INTENT real — mujeres adultas que entrenan en gimnasio, energía y fuerza');
const campaignIntent = buildCampaignIntent({
  productId: 'ripped-capsules',
  targetAudience: 'mujeres adultas que entrenan en el gimnasio',
  problemOrNeed: 'baja masa muscular y envejecimiento prematuro',
  campaignTerritory: 'energía y fuerza reales para entrenar en el gimnasio',
  campaignObjective: 'engagement',
  awarenessStage: 'Problem Aware',
});
const campaignId = computeCampaignId(campaignIntent);
console.log('campaignId real:', campaignId);

paso(4, 'CREATIVE FACTORY real — 5 Creative Variants reales (Hypothesis Experiment)');
const experiment = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 5, campaignIntent });
if (experiment.status !== 'HYPOTHESIS_EXPERIMENT_READY') { console.error(`BLOQUEO real: ${experiment.reason}`); process.exit(1); }
console.log(`${experiment.variantsDetail.length} Creative Variants reales generadas.`);

paso(5, 'CREATIVE DIRECTOR real — tratamiento visual asignado por variante (diversidad real, Paso 3)');
const tratamientos = experiment.variantsDetail.map((v, i) => {
  const t = assignVisualTreatment({ variantIndex: i, campaignIntent, campaignId });
  console.log(`  Variante #${i} (${v.blueprintId ?? v.conceptId}) -> ${t.label}`);
  return t.id;
});
const distintos = new Set(tratamientos).size;
console.log(`Tratamientos distintos: ${distintos}/${tratamientos.length}`);
if (distintos !== tratamientos.length) { console.error('BLOQUEO real: dos variantes del mismo batch comparten tratamiento visual.'); process.exit(1); }

mkdirSync(OUTPUT_DIR, { recursive: true });

paso(6, 'PRODUCE 2 VIDEOS REALES — voiceover real (Voice Engine), escenas reales, ffmpeg real, QA');
const resultados = [];
for (const variantIndex of [0, 1]) {
  const creativeVariant = experiment.variantsDetail[variantIndex];
  const script = buildVideoScript({
    hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
    sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
    format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
  });
  if (!script.applicable) { console.log(`  Variante #${variantIndex}: formato no producible como video (${script.reason}), se omite.`); continue; }
  assertVoiceoverTextSafe(script.voiceoverText);
  console.log(`  Variante #${variantIndex}: generando voiceover real (Voice Engine)…`);
  // eslint-disable-next-line no-await-in-loop
  const voz = await generarVoiceoverReal(script.voiceoverText);
  console.log(`  audio real: ${voz.resolvedPath} (${voz.durationSeconds}s)`);

  const projectDir = join(OUTPUT_DIR, `variant-${variantIndex}`);
  // eslint-disable-next-line no-await-in-loop
  const job = await produceCreative({
    creativeVariant, campaignIntent, productRawAssets,
    audioSourcePath: voz.resolvedPath, audioDurationSeconds: voz.durationSeconds,
    outputProfileNames: ['INSTAGRAM_REEL'], projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
    campaignId, batchId: `real-e2e-ripped-${campaignId}`, generationId: `gen-${variantIndex}`, creativeId: `creative-${variantIndex}`,
    productFacts: { nombreComercial: evidence.nombreComercial, nombreVisible: evidence.nombreVisible },
    variantIndex,
  });
  console.log(`  status real: ${job.status} | tratamiento: ${job.visualStrategy?.visualTreatmentLabel}`);
  if (job.status !== 'FAILED') {
    const { productionJobId } = saveProductionJob({ job, projectDir });
    console.log(`  productionJobId real: ${productionJobId}`);
  } else {
    console.log(`  error real: ${job.error}`);
  }
  resultados.push({ variantIndex, job });
}

paso(7, 'VERIFICACIÓN — product grounding real (Paso 29 del encargo)');
let ok = true;
for (const { variantIndex, job } of resultados) {
  if (job.status === 'FAILED') { console.log(`  Variante #${variantIndex}: FAILED, sin verificación visual/textual posible.`); ok = false; continue; }
  const voiceoverMentionsNombreVisible = job.script.voiceoverText.includes('Cápsulas Ripped');
  const productScenes = job.scenePlan.scenes.filter((s) => s.visualIntent === 'PRODUCT_REVEAL');
  const productSceneUsesRealAsset = productScenes.length > 0 && productScenes.every((s, i) => {
    const resolution = job.assetPlan[job.scenePlan.scenes.indexOf(s)];
    return resolution.source === 'EXISTING_PRODUCT_ASSET' && resolution.imageSourcePath && existsSync(resolution.imageSourcePath);
  });
  console.log(`  Variante #${variantIndex}: voz usa "Cápsulas Ripped" = ${voiceoverMentionsNombreVisible} | escena(s) de producto usan fotografía real = ${productSceneUsesRealAsset}`);
  console.log(`  outputs reales: ${job.outputs.map((o) => `${o.profileName}:${o.status}${o.outputPath ? ` (${existsSync(o.outputPath) ? 'archivo real existe' : 'FALTA'})` : ''}`).join(', ')}`);
  console.log(`  costo real: estimado $${job.costReport?.estimatedTotal ?? 0} / real $${job.costReport?.actualTotal ?? 0} ${job.costReport?.currency ?? 'USD'}`);
  console.log(`  provider routing real: imagen=${job.providerRouting?.image?.chosenProvider ?? 'null (fallback tipográfico)'} | video=${job.providerRouting?.video?.chosenProvider ?? 'null (fallback tipográfico)'}`);
  if (!voiceoverMentionsNombreVisible || !productSceneUsesRealAsset) ok = false;
}

console.log('\n=== RESULTADO FINAL ===');
console.log(ok ? 'OK — product grounding real confirmado en ambos videos.' : 'FALLÓ una o más verificaciones reales.');
if (!ok) process.exit(1);
