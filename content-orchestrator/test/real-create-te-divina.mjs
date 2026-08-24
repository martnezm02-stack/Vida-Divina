// real-create-te-divina.mjs — PRUEBA REAL de CREATE (Content Generation
// Engine). Reutiliza exactamente los mismos assets reales ya usados en
// fases anteriores (audio real de Voice Engine ya generado, fotografía
// real de TéDivina) para no repetir ~5 min de TTS innecesariamente --
// Campaign Mode SÍ se ejecuta real y en vivo (resuelve el CreativeCell
// automáticamente contra los ciclos reales persistidos).
//
// No modifica whatsapp-adapter/, CRM/, Meta/, tokens ni .env.

import { existsSync, mkdirSync } from 'node:fs';
import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent } from '../src/contentGenerationEngine.js';
import { resolveCampaignCreativeCell } from '../src/campaignMode.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const REAL_AUDIO_WAV = '\\\\wsl.localhost\\Ubuntu\\home\\manuel1974\\vida-divina-voice-engine-data\\experiments\\te-divina-creative-intelligence-e57b9205d9d4-seg1-2026-08-17T20-59-05-357Z.wav';
const REAL_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';
const OUTPUT_DIR = 'C:\\Users\\manue\\Vida Divina\\video-production\\content-generation-engine-real-create';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

paso(1, 'CONTENT GENERATION REQUEST (mode CREATE)');
const request = parseContentGenerationRequest({
  rawText: 'Crear un Reel de Té Divina para Instagram que genere conversaciones por WhatsApp.',
  productId: 'te-divina',
});
console.log('mode:', request.mode, '| productId:', request.productId, '| missingFields:', request.missingFields);
if (request.mode !== 'CREATE' || request.missingFields.length > 0) { console.error('BLOQUEO real. Abortando.'); process.exit(1); }

paso(2, 'CAMPAIGN MODE — resolución real automática');
const resolved = resolveCampaignCreativeCell({ productId: 'te-divina' });
console.log('creativeCellId real:', resolved.creativeCell.creativeCellId, '| matchScore:', resolved.matchScore);
console.log('persona real:', resolved.persona.name);

paso(3, 'COPY REAL (provisto explícitamente, grounded en el mismo texto ya aprobado/grabado)');
const VOICEOVER_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal. TéDivina es un té elaborado con hojas de malva, mirra, cardo bendito, malvavisco, papaya, chaga, arándano rojo, cardo santo, manzanilla, hojas de caqui, fibra soluble, hongos de ganoderma y jengibre, entre otros ingredientes reales del catálogo. Promueve la desintoxicación natural y ayuda a mejorar el tránsito intestinal, como parte de un hábito diario. No es un tratamiento médico. Si quieres conocer más, escríbenos por WhatsApp.';
const AUDIO_DURATION_SECONDS = 28.12;
const CTA_TEXT = 'Si quieres conocer más, escríbenos por WhatsApp.';
const HOOK_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal.';

if (!existsSync(REAL_AUDIO_WAV)) { console.error('BLOQUEO: no existe el Audio Asset real. Abortando.'); process.exit(1); }
if (!existsSync(REAL_PHOTO)) { console.error('BLOQUEO: no existe la fotografía real. Abortando.'); process.exit(1); }
console.log('Audio Asset real:', REAL_AUDIO_WAV);
console.log('Fotografía real:', REAL_PHOTO);

paso(4, 'CONTENT GENERATION ENGINE — generateContent(CREATE)');
mkdirSync(OUTPUT_DIR, { recursive: true });
const renderArgs = {
  hookText: HOOK_TEXT, productTitle: resolved.productFacts.nombreComercial, productBody: null,
  ctaText: CTA_TEXT, whatsappLabel: 'WhatsApp',
  voiceoverLines: VOICEOVER_TEXT.match(/[^.!?]+[.!?]+/g).map((s) => s.trim()),
};

const result = generateContent(request, {
  renderArgs, productId: 'te-divina',
  audioSourcePath: REAL_AUDIO_WAV, audioDurationSeconds: AUDIO_DURATION_SECONDS,
  imageAssetSourcePath: REAL_PHOTO,
  outputProfileNames: ['INSTAGRAM_REEL', 'WHATSAPP_VIDEO'],
  postProductionOperations: ['LOUDNESS_NORMALIZATION'],
  projectDir: `${OUTPUT_DIR}\\master-project`,
  ffmpegBinDir: FFMPEG_BIN_DIR,
});

paso(5, 'RESULTADO FINAL (Final Asset Package real)');
console.log(JSON.stringify(result, null, 2));
console.log('\n=== FIN ===');
process.exit(result.status === 'COMPLETED' || result.status === 'PARTIAL' ? 0 : 1);
