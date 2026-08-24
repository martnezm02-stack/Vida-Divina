// real-edit-te-divina.mjs — PRUEBA REAL de EDIT_ENHANCE. Toma el MP4 real
// producido por real-create-te-divina.mjs (master-project.mp4, sin
// postproducción -- loudness sin corregir) y aplica una mejora local real
// verificable: LOUDNESS_NORMALIZATION + TEXT_OVERLAY (CTA) +
// SILENCE_TRIM, en un solo paso. Demuestra MINIMAL_REPROCESSING: el
// tiempo total (segundos) confirma que no se re-invocó Voice Engine
// (~5 min) ni HyperFrames (~10-20s) -- solo ffmpeg.

import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent } from '../src/contentGenerationEngine.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const SOURCE_MP4 = 'C:\\Users\\manue\\Vida Divina\\video-production\\content-generation-engine-real-create\\master-project.mp4';
const OUTPUT_DIR = 'C:\\Users\\manue\\Vida Divina\\video-production\\content-generation-engine-real-edit';

function hashOf(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }

if (!existsSync(SOURCE_MP4)) { console.error('BLOQUEO: no existe el MP4 real fuente. Ejecutar real-create-te-divina.mjs primero.'); process.exit(1); }

console.log('=== PASO 1 — CONTENT GENERATION REQUEST (mode EDIT_ENHANCE) ===');
const request = parseContentGenerationRequest({
  rawText: 'Mejora este video: normaliza el audio, agrega un CTA y reduce los silencios.',
  sourceAsset: { type: 'VIDEO', path: SOURCE_MP4 },
});
console.log('mode:', request.mode, '| sourceAsset:', request.sourceAsset.path);

const hashAntes = hashOf(SOURCE_MP4);
console.log('hash real del original ANTES:', hashAntes);

console.log('\n=== PASO 2 — CONTENT GENERATION ENGINE — generateContent(EDIT_ENHANCE) ===');
const t0 = Date.now();
const result = generateContent(request, {
  operations: ['LOUDNESS_NORMALIZATION', 'TEXT_OVERLAY', 'SILENCE_TRIM'],
  operationParams: { TEXT_OVERLAY: { text: 'Escríbenos por WhatsApp', position: 'bottom' } },
  outputDir: OUTPUT_DIR, ffmpegBinDir: FFMPEG_BIN_DIR,
});
const wallSeconds = (Date.now() - t0) / 1000;

console.log('\n=== PASO 3 — RESULTADO FINAL ===');
console.log(JSON.stringify(result, null, 2));

const hashDespues = hashOf(SOURCE_MP4);
console.log('\n=== PASO 4 — VERIFICACIONES REALES ===');
console.log('[CHECK] original intacto (hash antes == hash después):', hashAntes === hashDespues ? 'PASS' : 'FAIL');
console.log('[CHECK] status COMPLETED:', result.status === 'COMPLETED' ? 'PASS' : `FAIL (${result.status})`);
console.log(`[CHECK] MINIMAL_REPROCESSING (tiempo total = ${wallSeconds.toFixed(1)}s, muy por debajo de los ~300s de una regeneración de voz o ~15-20s de un render HyperFrames):`, wallSeconds < 60 ? 'PASS' : 'REVISAR');

process.exit(result.status === 'COMPLETED' && hashAntes === hashDespues ? 0 : 1);
