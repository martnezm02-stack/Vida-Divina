// real-e2e-dashboard-create.mjs — PRUEBA REAL de extremo a extremo:
// Dashboard (HTTP real, mismo servidor que corre en producción local) →
// CREATE → Content Generation Engine real → HyperFrames real → MP4 real →
// preview real vía /media. Ningún mock. Requiere el servidor real
// corriendo en BASE_URL (por defecto http://localhost:4310).

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4310';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

paso(1, 'GET /api/products (real)');
const products = await fetch(`${BASE_URL}/api/products`).then((r) => r.json());
const teDivina = products.find((p) => p.productSlug === 'te-divina');
if (!teDivina) { console.error('BLOQUEO: no se encontró el producto real te-divina.'); process.exit(1); }
console.log('producto real:', teDivina.nombreComercial);

paso(2, 'GET /api/audio-assets (real)');
const { existingAudioAssets } = await fetch(`${BASE_URL}/api/audio-assets`).then((r) => r.json());
const audio = existingAudioAssets.find((a) => a.filename === 'te-divina-creative-intelligence.wav');
if (!audio) { console.error('BLOQUEO: no existe el Audio Asset real esperado.'); process.exit(1); }
console.log('audio real:', audio.filename, audio.durationSeconds, 's');

const image = teDivina.rawAssets.find((a) => a.originalFilename === 'te divina c tasa.jpeg');
console.log('fotografía real:', image?.originalFilename);

paso(3, 'POST /api/create (real, vía el servidor HTTP del dashboard)');
const body = {
  mode: 'CAMPAIGN',
  productId: 'te-divina',
  rawText: 'Crear un Reel de TéDivina para generar conversaciones por WhatsApp.',
  hookText: 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal.',
  voiceoverText: 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal. TéDivina es un té elaborado con hojas de malva, mirra, cardo bendito, malvavisco, papaya, chaga, arándano rojo, cardo santo, manzanilla, hojas de caqui, fibra soluble, hongos de ganoderma y jengibre, entre otros ingredientes reales del catálogo. Promueve la desintoxicación natural y ayuda a mejorar el tránsito intestinal, como parte de un hábito diario. No es un tratamiento médico. Si quieres conocer más, escríbenos por WhatsApp.',
  ctaText: 'Si quieres conocer más, escríbenos por WhatsApp.',
  imageAssetPath: image?.sourcePath ?? null,
  audioSource: 'existing',
  audioAssetPath: audio.path,
  outputProfileNames: ['INSTAGRAM_REEL'],
};
const t0 = Date.now();
const createRes = await fetch(`${BASE_URL}/api/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const result = await createRes.json();
const wallSeconds = (Date.now() - t0) / 1000;

console.log('HTTP status:', createRes.status);
console.log('status real:', result.status);
console.log('campaignResolution:', result.campaignResolution);
console.log('outputAssets:', result.outputAssets?.map((o) => ({ profile: o.outputProfileName, mediaUrl: o.mediaUrl, probe: o.probe })));
console.log(`tiempo real: ${wallSeconds.toFixed(1)}s`);

paso(4, 'GET del mediaUrl real devuelto (simula la vista previa del navegador)');
const mediaUrl = result.outputAssets?.[0]?.mediaUrl;
let previewOk = false;
if (mediaUrl) {
  const mediaRes = await fetch(`${BASE_URL}${mediaUrl}`);
  const buf = await mediaRes.arrayBuffer();
  console.log('preview HTTP status:', mediaRes.status, '| content-type:', mediaRes.headers.get('content-type'), '| bytes:', buf.byteLength);
  previewOk = mediaRes.status === 200 && buf.byteLength > 100_000 && mediaRes.headers.get('content-type') === 'video/mp4';
}

console.log('\n=== VERIFICACIONES ===');
console.log('[CHECK] HTTP 200 real:', createRes.status === 200 ? 'PASS' : 'FAIL');
console.log('[CHECK] status COMPLETED real:', result.status === 'COMPLETED' ? 'PASS' : `FAIL (${result.status})`);
console.log('[CHECK] mediaUrl real presente:', mediaUrl ? 'PASS' : 'FAIL');
console.log('[CHECK] preview real accesible (MP4 real servido):', previewOk ? 'PASS' : 'FAIL');

process.exit(createRes.status === 200 && result.status === 'COMPLETED' && previewOk ? 0 : 1);
