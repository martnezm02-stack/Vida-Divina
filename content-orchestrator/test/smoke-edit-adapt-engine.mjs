// smoke-edit-adapt-engine.mjs — demo/smoke real (no node:test) para
// verificar runEdit()/runAdapt() del Content Generation Engine contra un
// MP4 real antes de escribir la suite formal.

import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent } from '../src/contentGenerationEngine.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const REAL_MP4 = 'C:\\Users\\manue\\Vida Divina\\video-production\\real-e2e-content-orchestrator\\a5c39a79-582e-4e9e-a9e5-90aeb4bb2654-INSTAGRAM_REEL.mp4';
const OUT_DIR = 'C:\\Users\\manue\\Vida Divina\\content-orchestrator\\test\\_smoke-outputs';

console.log('=== EDIT ===');
const editReq = parseContentGenerationRequest({
  rawText: 'Mejora este video: normaliza el audio y agrega un CTA.',
  sourceAsset: { type: 'VIDEO', path: REAL_MP4 },
});
console.log('mode:', editReq.mode);
const editResult = generateContent(editReq, {
  operations: ['LOUDNESS_NORMALIZATION', 'TEXT_OVERLAY'],
  operationParams: { TEXT_OVERLAY: { text: 'Escribenos por WhatsApp', position: 'bottom' } },
  outputDir: OUT_DIR, ffmpegBinDir: FFMPEG_BIN_DIR,
});
console.log(JSON.stringify(editResult, null, 2));

console.log('\n=== ADAPT ===');
const adaptReq = parseContentGenerationRequest({
  rawText: 'Convierte este Reel para Facebook Reel, YouTube Short y WhatsApp.',
  sourceAsset: { type: 'VIDEO', path: REAL_MP4 },
  outputProfiles: ['FACEBOOK_REEL', 'YOUTUBE_SHORT', 'WHATSAPP_VIDEO'],
});
console.log('mode:', adaptReq.mode, 'outputProfiles:', adaptReq.outputProfiles);
const adaptResult = generateContent(adaptReq, { outputDir: OUT_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
console.log(JSON.stringify(adaptResult, null, 2));
