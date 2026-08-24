// real-e2e-te-divina-reel.mjs — PRUEBA REAL (Parte 13/16), no un test
// unitario. Ejecuta la solicitud exacta pedida por el usuario:
//
//   "Crear un Reel para Té Divina usando las fotografías reales existentes,
//    la voz oficial y CTA a WhatsApp."
//
// a través de: CONTENT REQUEST -> CAMPAIGN MODE (resuelve el CreativeCell
// real automáticamente) -> AssetPackage real -> HyperFrames real ->
// PostProduction real -> Final Asset Package (2 Output Profiles reales:
// INSTAGRAM_REEL y WHATSAPP_VIDEO, ambos detectados por el ContentRequest).
//
// El copy (hook/body/CTA/voiceover) es EXPLÍCITO, provisto aquí como
// "operador humano" -- Campaign Mode nunca redacta guion (ver
// campaignMode.js). Reutiliza el audio real YA generado y validado en la
// fase anterior (mismo texto, mismo WAV real de Chatterbox, sin volver a
// invocar el Voice Engine) para no repetir ~5 min de TTS innecesariamente.
//
// No modifica whatsapp-adapter/, CRM/, Meta/, tokens ni .env.

import { existsSync, mkdirSync } from 'node:fs';
import { parseContentRequest } from '../src/contentRequest.js';
import { resolveCampaignForContentRequest } from '../src/campaignMode.js';
import { renderAndPostProduce, visualProductionPackageToRenderArgs } from '../src/contentOrchestrator.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const REAL_AUDIO_WAV = '\\\\wsl.localhost\\Ubuntu\\home\\manuel1974\\vida-divina-voice-engine-data\\experiments\\te-divina-creative-intelligence-e57b9205d9d4-seg1-2026-08-17T20-59-05-357Z.wav';
const REAL_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';
const OUTPUT_DIR = 'C:\\Users\\manue\\Vida Divina\\video-production\\real-e2e-content-orchestrator';

function paso(n, titulo) { console.log(`\n=== PASO ${n} — ${titulo} ===`); }

paso(1, 'CONTENT REQUEST');
const contentRequest = parseContentRequest({
  rawText: 'Crear un Reel para Té Divina usando las fotografías reales existentes, la voz oficial y CTA a WhatsApp.',
  contentType: 'VIDEO_REEL',
});
console.log(JSON.stringify(contentRequest, null, 2));

if (contentRequest.mode !== 'CAMPAIGN_MODE') {
  console.error('BLOQUEO: se esperaba CAMPAIGN_MODE. Abortando prueba real.');
  process.exit(1);
}
if (contentRequest.missingFields.length > 0) {
  console.error(`BLOQUEO: MISSING_STRATEGIC_DATA — faltan campos reales: ${contentRequest.missingFields.join(', ')}. NO se inventan. Abortando.`);
  process.exit(1);
}

paso(2, 'CAMPAIGN MODE — resolución automática contra Creative Intelligence real');
let resolved;
try {
  resolved = resolveCampaignForContentRequest(contentRequest);
} catch (e) {
  console.error(`BLOQUEO real: ${e.message}`);
  process.exit(1);
}
console.log('cycleId real:', resolved.cycleId);
console.log('creativeCellId real:', resolved.creativeCell.creativeCellId);
console.log('persona real:', resolved.persona.name);
console.log('pain real:', resolved.pain.painPoint);
console.log('angle real:', resolved.angle.angleText);
console.log('matchScore:', resolved.matchScore, '(candidatos evaluados:', resolved.candidatesTried.length, ')');
console.log('productFacts.problema real:', resolved.productFacts.problema);

paso(3, 'COPY REAL — provisto explícitamente (Campaign Mode nunca redacta guion)');
// Mismo texto EXACTO ya validado y ya grabado en la fase anterior (WAV real
// de 28.12s), grounded en el mismo CreativeCell "Miedo a depender del
// laxante" -- ver docs/productos/01-control-de-peso/tedivina.md para cada
// hecho de producto citado.
const VOICEOVER_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal. TéDivina es un té elaborado con hojas de malva, mirra, cardo bendito, malvavisco, papaya, chaga, arándano rojo, cardo santo, manzanilla, hojas de caqui, fibra soluble, hongos de ganoderma y jengibre, entre otros ingredientes reales del catálogo. Promueve la desintoxicación natural y ayuda a mejorar el tránsito intestinal, como parte de un hábito diario. No es un tratamiento médico. Si quieres conocer más, escríbenos por WhatsApp.';
const AUDIO_DURATION_SECONDS = 28.12; // medido con ffprobe real en la fase anterior.
const CTA_TEXT = 'Si quieres conocer más, escríbenos por WhatsApp.';
const HOOK_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal.';

if (!existsSync(REAL_AUDIO_WAV)) {
  console.error(`BLOQUEO: no existe el Audio Asset real en ${REAL_AUDIO_WAV}. NO se fabrica uno. Abortando.`);
  process.exit(1);
}
if (!existsSync(REAL_PHOTO)) {
  console.error(`BLOQUEO: no existe la fotografía real en ${REAL_PHOTO}. NO se fabrica una. Abortando.`);
  process.exit(1);
}
console.log('Audio Asset real:', REAL_AUDIO_WAV, `(${AUDIO_DURATION_SECONDS}s, ya validado con ffprobe en la fase anterior)`);
console.log('Fotografía real:', REAL_PHOTO);

paso(4, 'RENDER + POSTPRODUCTION — HyperFrames real (1 render maestro) + Output Profiles reales');
mkdirSync(OUTPUT_DIR, { recursive: true });
const renderArgs = {
  hookText: HOOK_TEXT,
  productTitle: resolved.productFacts.nombreComercial,
  productBody: null, // hay foto real -> no se usa el lockup tipográfico.
  ctaText: CTA_TEXT,
  whatsappLabel: 'WhatsApp',
  voiceoverLines: VOICEOVER_TEXT.match(/[^.!?]+[.!?]+/g).map((s) => s.trim()),
};
console.log('renderArgs:', JSON.stringify(renderArgs, null, 2));

const outputProfileNames = contentRequest.platforms.includes('WHATSAPP')
  ? ['INSTAGRAM_REEL', 'WHATSAPP_VIDEO']
  : ['INSTAGRAM_REEL'];
console.log('Output Profiles pedidos (derivados de contentRequest.platforms):', outputProfileNames);

const resultado = renderAndPostProduce({
  contentRequestId: contentRequest.contentRequestId,
  renderArgs,
  audioSourcePath: REAL_AUDIO_WAV,
  audioDurationSeconds: AUDIO_DURATION_SECONDS,
  imageAssetSourcePath: REAL_PHOTO,
  productId: 'te-divina',
  visualProductionPackageId: null,
  productionArtifactId: null,
  audioAssetId: 'e57b9205d9d492a7d31a6e66394254f78a8dd5860593f0707368dfa47b65f2a0', // el assetId real ya calculado en la fase anterior para este mismo WAV.
  outputProfileNames,
  postProductionOperations: ['LOUDNESS_NORMALIZATION'],
  projectDir: `${OUTPUT_DIR}\\master-project`,
  ffmpegBinDir: FFMPEG_BIN_DIR,
});

paso(5, 'RESULTADO FINAL');
console.log('status:', resultado.status);
console.log('assetPackage.assetPackageId:', resultado.assetPackage?.assetPackageId);
console.log('assetPackage.entries:', JSON.stringify(resultado.assetPackage?.entries, null, 2));
console.log('masterResult:', JSON.stringify(resultado.masterResult, null, 2));
for (const out of resultado.outputs) {
  console.log(`\n--- Output Profile: ${out.outputProfileName} ---`);
  console.log('status:', out.status);
  if (out.probe) console.log('probe:', JSON.stringify(out.probe, null, 2));
  if (out.outputPath) console.log('outputPath:', out.outputPath);
}

console.log('\n=== FIN DE LA PRUEBA REAL ===');
process.exit(resultado.status === 'COMPLETADO' ? 0 : 1);
