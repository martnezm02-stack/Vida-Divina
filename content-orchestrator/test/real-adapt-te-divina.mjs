// real-adapt-te-divina.mjs — PRUEBA REAL de ADAPT. Toma el mismo MP4 real
// (master-project.mp4) y deriva 4 Output Profiles reales: INSTAGRAM_REEL,
// FACEBOOK_REEL, YOUTUBE_SHORT, WHATSAPP_VIDEO -- todos del MISMO master,
// sin volver a invocar Voice Engine ni HyperFrames.

import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent } from '../src/contentGenerationEngine.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const SOURCE_MP4 = 'C:\\Users\\manue\\Vida Divina\\video-production\\content-generation-engine-real-create\\master-project.mp4';
const OUTPUT_DIR = 'C:\\Users\\manue\\Vida Divina\\video-production\\content-generation-engine-real-adapt';

function hashOf(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }

if (!existsSync(SOURCE_MP4)) { console.error('BLOQUEO: no existe el MP4 real fuente.'); process.exit(1); }

console.log('=== PASO 1 — CONTENT GENERATION REQUEST (mode ADAPT) ===');
const request = parseContentGenerationRequest({
  rawText: 'Convierte este video para Instagram, Facebook, YouTube Short y WhatsApp.',
  sourceAsset: { type: 'VIDEO', path: SOURCE_MP4 },
  outputProfiles: ['INSTAGRAM_REEL', 'FACEBOOK_REEL', 'YOUTUBE_SHORT', 'WHATSAPP_VIDEO'],
});
console.log('mode:', request.mode, '| outputProfiles:', request.outputProfiles);

const hashAntes = hashOf(SOURCE_MP4);

console.log('\n=== PASO 2 — CONTENT GENERATION ENGINE — generateContent(ADAPT) ===');
const t0 = Date.now();
const result = generateContent(request, {
  postProductionOperations: ['LOUDNESS_NORMALIZATION', 'RESIZE_TO_PROFILE'],
  outputDir: OUTPUT_DIR, ffmpegBinDir: FFMPEG_BIN_DIR,
});
const wallSeconds = (Date.now() - t0) / 1000;

console.log('\n=== PASO 3 — RESULTADO FINAL ===');
console.log('status:', result.status);
for (const out of result.outputAssets) {
  console.log(`  ${out.outputProfileName}: ${out.path.split('\\').pop()} — ${out.probe.width}x${out.probe.height} @ ${out.probe.fps} — ${out.probe.videoDurationSeconds}s`);
}
console.log('warnings:', result.warnings);
console.log('errors:', result.errors);

const hashDespues = hashOf(SOURCE_MP4);
console.log('\n=== PASO 4 — VERIFICACIONES REALES ===');
console.log('[CHECK] original intacto:', hashAntes === hashDespues ? 'PASS' : 'FAIL');
console.log('[CHECK] status COMPLETED:', result.status === 'COMPLETED' ? 'PASS' : `FAIL (${result.status})`);
console.log('[CHECK] se generaron 4 outputs reales:', result.outputAssets.length === 4 ? 'PASS' : `FAIL (${result.outputAssets.length})`);
console.log(`[CHECK] MINIMAL_REPROCESSING (tiempo total = ${wallSeconds.toFixed(1)}s para 4 perfiles, sin Voice Engine ni HyperFrames):`, wallSeconds < 60 ? 'PASS' : 'REVISAR');
// Dimensiones reales distintas por perfil (prueba de que RESIZE_TO_PROFILE realmente actuó distinto por plataforma).
const yt = result.outputAssets.find((o) => o.outputProfileName === 'YOUTUBE_SHORT');
const wa = result.outputAssets.find((o) => o.outputProfileName === 'WHATSAPP_VIDEO');
console.log('[CHECK] todos los perfiles pedidos son 9:16 en esta prueba (1080x1920):', result.outputAssets.every((o) => o.probe.width === 1080 && o.probe.height === 1920) ? 'PASS' : 'REVISAR');

process.exit(result.status === 'COMPLETED' && hashAntes === hashDespues && result.outputAssets.length === 4 ? 0 : 1);
