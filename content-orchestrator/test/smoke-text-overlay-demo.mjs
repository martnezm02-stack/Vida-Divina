// smoke-text-overlay-demo.mjs — demo real, no un test node:test. Prueba
// manual que confirmó por primera vez que TEXT_OVERLAY (drawtext) funciona
// en Windows real, incluyendo el fix del escape de ":" en la ruta de
// fuente ("C:/Windows/Fonts/arial.ttf" -> "C\\:/Windows/Fonts/arial.ttf").
// Se conserva como demo reproducible, no se borra.

import { runPostProduction } from '../src/postProduction.js';
import { getOutputProfile } from '../src/outputProfiles.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const REAL_MP4 = 'C:\\Users\\manue\\Vida Divina\\video-production\\real-e2e-content-orchestrator\\a5c39a79-582e-4e9e-a9e5-90aeb4bb2654-INSTAGRAM_REEL.mp4';

const r = runPostProduction({
  inputPath: REAL_MP4,
  outputPath: 'C:\\Users\\manue\\Vida Divina\\content-orchestrator\\test\\_smoke-text-overlay-demo-output.mp4',
  outputProfile: getOutputProfile('GENERIC_VERTICAL'),
  operations: ['LOUDNESS_NORMALIZATION', 'AUDIO_CLEANUP', 'TEXT_OVERLAY'],
  operationParams: { TEXT_OVERLAY: { text: 'Escribenos por WhatsApp', position: 'bottom' } },
  ffmpegBinDir: FFMPEG_BIN_DIR,
});
console.log(JSON.stringify(r, null, 2));
