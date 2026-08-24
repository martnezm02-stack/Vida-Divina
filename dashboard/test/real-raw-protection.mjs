// real-raw-protection.mjs — PRUEBA REAL (Fase "Consolidación y Validación
// del Operation Dashboard", sección 5/8). Intenta explícitamente operaciones
// destructivas reales contra la API HTTP real del dashboard y contra las
// funciones reales de integridad (content-orchestrator/src/productIntegrity.js)
// -- nunca simuladas -- y confirma que ninguna logra modificar un RAW real.
//
// Cuatro pruebas reales:
//  1. Intento de "smuggling" de un outputPath/outputDir/overwriteSource
//     arbitrario en el body real de /api/edit y /api/create -- confirma que
//     el servidor los ignora (nunca los destructura) y que el resultado
//     real sigue escribiendo bajo la raíz fija de salida del dashboard.
//  2. Intento real de usar una fotografía RAW real como "sourceAssetPath"
//     de /api/edit (operación de video sobre un archivo que no lo es) --
//     confirma que, gane o pierda la llamada, el RAW real queda con el
//     mismo hash antes/después.
//  3. CREATE real usando una fotografía RAW real como imageAssetPath --
//     confirma que productIntegrity.js#assertProductImageUnchanged corrió
//     de verdad (hash idéntico antes/después de un render real).
//  4. Prueba real (no mockeada) de que assertProductImageUnchanged() SÍ
//     rechaza una alteración real -- opera sobre una COPIA temporal en el
//     scratchpad de la sesión (nunca sobre el RAW real del proyecto), para
//     no arriesgar ningún archivo real del repositorio.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureProductImageState, assertProductImageUnchanged } from '../../content-orchestrator/src/productIntegrity.js';

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4310';
const REAL_RAW_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te desintoxica.jpeg';
const REAL_RAW_AUDIO = 'C:\\Users\\manue\\Vida Divina\\video-production\\_audio-cache\\te-divina-creative-intelligence.wav';

function hashOf(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function paso(n, titulo) { console.log(`\n=== PASO ${n} — ${titulo} ===`); }

let allOk = true;
function check(label, ok) {
  console.log(`[CHECK] ${label}:`, ok ? 'PASS' : 'FAIL');
  if (!ok) allOk = false;
}

paso(1, 'Smuggling de outputPath/outputDir/overwriteSource en /api/edit real -- deben ser ignorados');
const hashPhotoBefore1 = hashOf(REAL_RAW_PHOTO);
const smuggleBody = {
  sourceAssetPath: REAL_RAW_AUDIO, // no es video real -- se espera que falle por formato, no por permisos.
  operations: ['LOUDNESS_NORMALIZATION'],
  outputPath: REAL_RAW_PHOTO, // intento explícito de que el resultado se escriba SOBRE un RAW real.
  outputDir: 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw',
  overwriteSource: true,
};
const res1 = await fetch(`${BASE_URL}/api/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smuggleBody) });
const result1 = await res1.json();
console.log('HTTP status:', res1.status, '-- status real:', result1.status ?? result1.error);
const outputPathsMencionanRaw = JSON.stringify(result1).includes('te desintoxica.jpeg') || JSON.stringify(result1).includes('\\raw\\');
check('la respuesta real nunca menciona una ruta de salida dentro de assets/products/*/raw', !outputPathsMencionanRaw);
check('el RAW real usado como señuelo permanece con el mismo hash tras el intento', hashOf(REAL_RAW_PHOTO) === hashPhotoBefore1);

paso(2, 'Intento real de EDIT usando una fotografía RAW real como "sourceAssetPath" (operación de video sobre un archivo que no lo es)');
const hashPhotoBefore2 = hashOf(REAL_RAW_PHOTO);
const res2 = await fetch(`${BASE_URL}/api/edit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourceAssetPath: REAL_RAW_PHOTO, operations: ['TRIM'], operationParams: { TRIM: { startSeconds: 0, endSeconds: 1 } } }),
});
const result2 = await res2.json();
console.log('HTTP status:', res2.status, '-- status real:', result2.status ?? result2.error);
check('el RAW real no cambió de hash tras el intento de EDIT sobre una fotografía', hashOf(REAL_RAW_PHOTO) === hashPhotoBefore2);

paso(3, 'CREATE real usando la fotografía RAW real como imageAssetPath -- integridad de producto debe correr de verdad');
const hashPhotoBefore3 = hashOf(REAL_RAW_PHOTO);
const res3 = await fetch(`${BASE_URL}/api/create`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'DIRECT', productId: 'te-divina',
    rawText: 'Prueba real de integridad de producto (RAW protection).',
    hookText: 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal.',
    voiceoverText: 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal. Si quieres conocer más, escríbenos por WhatsApp.',
    ctaText: 'Si quieres conocer más, escríbenos por WhatsApp.',
    imageAssetPath: REAL_RAW_PHOTO,
    audioSource: 'existing', audioAssetPath: REAL_RAW_AUDIO,
    outputProfileNames: ['GENERIC_VERTICAL'],
  }),
});
const result3 = await res3.json();
console.log('HTTP status:', res3.status, '-- status real:', result3.status);
check('CREATE real con foto RAW real se completó', res3.status === 200 && result3.status === 'COMPLETED');
check('la fotografía RAW real no cambió de hash tras un render real que la usó', hashOf(REAL_RAW_PHOTO) === hashPhotoBefore3);

paso(4, 'assertProductImageUnchanged() real SÍ rechaza una alteración real -- sobre una COPIA temporal, nunca sobre el RAW del proyecto');
const scratchDir = mkdtempSync(join(tmpdir(), 'vida-divina-raw-protection-'));
const scratchCopy = join(scratchDir, 'copia-no-real-de-producto.jpeg');
copyFileSync(REAL_RAW_PHOTO, scratchCopy);
const capturedState = captureProductImageState(scratchCopy);
writeFileSync(scratchCopy, Buffer.concat([readFileSync(scratchCopy), Buffer.from('TAMPERED')]));
let threw = false;
try {
  assertProductImageUnchanged(capturedState);
} catch (err) {
  threw = true;
  console.log('assertProductImageUnchanged lanzó como se esperaba:', err.message);
}
check('assertProductImageUnchanged() lanza sobre una alteración real detectada', threw);
rmSync(scratchDir, { recursive: true, force: true });
check('el RAW real del proyecto permanece con el mismo hash tras toda la prueba', hashOf(REAL_RAW_PHOTO) === hashPhotoBefore1);

console.log('\n=== RESULTADO FINAL:', allOk ? 'PASS' : 'FAIL', '===');
process.exitCode = allOk ? 0 : 1;
