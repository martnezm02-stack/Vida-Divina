// real-e2e-dashboard-create-generate-voice.mjs — PRUEBA REAL: CREATE con
// "Generar voz nueva" (Voice Engine real, en vivo) a través de la API HTTP
// real del dashboard. Texto corto para mantener la generación real rápida.

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4310';

const body = {
  mode: 'DIRECT',
  productId: 'te-divina',
  rawText: 'Prueba real de generación de voz nueva.',
  hookText: 'Prueba real.',
  voiceoverText: 'Esta es una prueba real y corta de generación de voz nueva.',
  ctaText: 'Escríbenos por WhatsApp.',
  productBody: 'Té Divina: bienestar natural en cada taza.',
  imageAssetPath: null,
  audioSource: 'generate',
  outputProfileNames: ['GENERIC_VERTICAL'],
};

console.log('Enviando solicitud real con audioSource="generate" (Voice Engine en vivo)...');
const t0 = Date.now();
const res = await fetch(`${BASE_URL}/api/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const result = await res.json();
const wallSeconds = (Date.now() - t0) / 1000;

console.log('HTTP status:', res.status);
console.log(JSON.stringify(result, null, 2));
console.log('status real:', result.status);
console.log('outputAssets:', result.outputAssets?.map((o) => ({ profile: o.outputProfileName, mediaUrl: o.mediaUrl, probe: o.probe })));
console.log('sourceAssets (debe incluir el WAV real generado por Voice Engine):', result.sourceAssets);
console.log(`tiempo real total: ${wallSeconds.toFixed(1)}s`);

const ok = res.status === 200 && result.status === 'COMPLETED';
console.log('\n[CHECK] CREATE con Voice Engine real de punta a punta:', ok ? 'PASS' : `FAIL (${result.status}: ${result.error ?? ''})`);
process.exitCode = ok ? 0 : 1;
