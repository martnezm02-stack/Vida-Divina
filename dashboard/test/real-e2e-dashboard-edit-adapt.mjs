// real-e2e-dashboard-edit-adapt.mjs — PRUEBA REAL de EDIT y ADAPT vía la
// API HTTP real del dashboard, sobre el master.mp4 real producido por
// real-e2e-dashboard-create.mjs. Verifica además que el original
// permanece intacto (hash sha256 idéntico antes/después de cada llamada).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4310';
const SOURCE_MP4 = process.argv[2];
if (!SOURCE_MP4) { console.error('Uso: node real-e2e-dashboard-edit-adapt.mjs <ruta-real-al-master.mp4>'); process.exit(1); }

function hashOf(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }

console.log('=== EDIT vía dashboard API ===');
const hashAntesEdit = hashOf(SOURCE_MP4);
const editRes = await fetch(`${BASE_URL}/api/edit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourceAssetPath: SOURCE_MP4, operations: ['LOUDNESS_NORMALIZATION', 'TEXT_OVERLAY'], operationParams: { TEXT_OVERLAY: { text: 'Escríbenos por WhatsApp', position: 'bottom' } } }),
});
const editResult = await editRes.json();
const hashDespuesEdit = hashOf(SOURCE_MP4);
console.log('HTTP status:', editRes.status, '| status real:', editResult.status);
console.log('mediaUrl real:', editResult.outputAssets?.[0]?.mediaUrl);
console.log('[CHECK] original intacto tras EDIT:', hashAntesEdit === hashDespuesEdit ? 'PASS' : 'FAIL');
console.log('[CHECK] EDIT status COMPLETED:', editResult.status === 'COMPLETED' ? 'PASS' : `FAIL (${editResult.status})`);

let editPreviewOk = false;
if (editResult.outputAssets?.[0]?.mediaUrl) {
  const r = await fetch(`${BASE_URL}${editResult.outputAssets[0].mediaUrl}`);
  editPreviewOk = r.status === 200 && r.headers.get('content-type') === 'video/mp4';
  console.log('[CHECK] preview real del EDIT accesible:', editPreviewOk ? 'PASS' : 'FAIL');
}

console.log('\n=== ADAPT vía dashboard API ===');
const hashAntesAdapt = hashOf(SOURCE_MP4);
const adaptRes = await fetch(`${BASE_URL}/api/adapt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourceAssetPath: SOURCE_MP4, outputProfileNames: ['FACEBOOK_REEL', 'WHATSAPP_VIDEO'] }),
});
const adaptResult = await adaptRes.json();
const hashDespuesAdapt = hashOf(SOURCE_MP4);
console.log('HTTP status:', adaptRes.status, '| status real:', adaptResult.status);
console.log('outputAssets reales:', adaptResult.outputAssets?.map((o) => o.outputProfileName));
console.log('[CHECK] original intacto tras ADAPT:', hashAntesAdapt === hashDespuesAdapt ? 'PASS' : 'FAIL');
console.log('[CHECK] ADAPT status COMPLETED:', adaptResult.status === 'COMPLETED' ? 'PASS' : `FAIL (${adaptResult.status})`);
console.log('[CHECK] 2 outputs reales generados:', adaptResult.outputAssets?.length === 2 ? 'PASS' : `FAIL (${adaptResult.outputAssets?.length})`);

const allPass = editResult.status === 'COMPLETED' && hashAntesEdit === hashDespuesEdit && editPreviewOk
  && adaptResult.status === 'COMPLETED' && hashAntesAdapt === hashDespuesAdapt && adaptResult.outputAssets?.length === 2;
console.log('\nRESULTADO GLOBAL:', allPass ? 'PASS' : 'FAIL');
process.exitCode = allPass ? 0 : 1;
