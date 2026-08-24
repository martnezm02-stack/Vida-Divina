// campaignPilot.test.js — Fase 16, Parte 13/23. POST /api/content-plans/generate
// es la única vía real para crear un ContentPlan desde el Dashboard
// (hallazgo de esta fase: antes no existía ningún endpoint de escritura).
// Reutiliza planContent() real -- este archivo no vuelve a probar su
// lógica interna (ya cubierta por content-planning/test/, 56 tests reales);
// prueba solo el cableado HTTP real: validación, rechazo explícito de
// AUTO_PUBLISH, y que el ContentPlan real devuelto tiene la forma esperada.
// Un render real completo (con generationInputs) es lento (HyperFrames real)
// -- se valida aparte, manualmente, con el mismo criterio que
// dashboard/test/real-e2e-dashboard-create.mjs (no se ejecuta en cada
// "npm test").

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(() => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }));

async function post(body) {
  const res = await fetch(`${baseUrl}/api/content-plans/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('POST /api/content-plans/generate', () => {
  test('sin userIntent -- 400 real', async () => {
    const { status, body } = await post({});
    assert.equal(status, 400);
    assert.match(body.error, /userIntent/);
  });

  test('executionMode=AUTO_PUBLISH -- 400 real, rechazado explícitamente (Fase 16: esta fase es human-in-the-loop)', async () => {
    const { status, body } = await post({ userIntent: 'Cualquier cosa', executionMode: 'AUTO_PUBLISH' });
    assert.equal(status, 400);
    assert.match(body.error, /AUTO_PUBLISH/);
  });

  test('executionMode inválido/desconocido -- 400 real', async () => {
    const { status } = await post({ userIntent: 'Cualquier cosa', executionMode: 'MAGIC' });
    assert.equal(status, 400);
  });

  test('userIntent real sin producto identificable -- ContentPlan real FAILED_GENERATION (nunca inventa un producto), executionMode PREPARE_ONLY por defecto', async () => {
    const { status, body } = await post({ userIntent: 'Quiero vender algo, no sé qué.' });
    assert.equal(status, 200);
    assert.ok(body.id, 'debe ser un ContentPlan real persistido, con id real');
    assert.equal(body.status, 'FAILED_GENERATION');
    assert.equal(body.executionMode, 'PREPARE_ONLY');
  });

  test('generationInputs incompleto (falta outputProfileNames) -- 400 real, nunca intenta renderizar', async () => {
    const { status, body } = await post({ userIntent: 'Crear un reel de TéDivina', productId: 'te-divina', hookText: 'x', ctaText: 'x', voiceoverText: 'x' });
    assert.equal(status, 400);
    assert.match(body.error, /Output Profile/);
  });

  // "assetPackage" (Fase 16 Parte 13/16) -- registra un Final Asset Package
  // YA renderizado (ej. resultado real de /api/create) sin volver a
  // renderizar. No se asume una identidad exacta del ContentPlan devuelto:
  // planContent() real puede deduplicar contra un ContentPlan ya existente
  // con la misma (strategyDecisionIds, producto, plataforma, executionMode)
  // -- eso es comportamiento real y correcto (Fase 19), no un fallo de
  // este endpoint; se valida solo que la ruta HTTP funciona de punta a
  // punta con este parámetro, sin fabricar un segundo render.
  test('assetPackage ya renderizado -- se acepta y produce un ContentPlan real (sin re-renderizar)', async () => {
    const assetPackage = { requestId: `pilot-test-${Date.now()}`, mode: 'CREATE', status: 'COMPLETED', outputAssets: [{ assetId: 'a1', path: 'C:\\fake\\a1.mp4' }], sourceAssets: [], derivedAssets: [], audioAssets: [], outputProfiles: ['INSTAGRAM_REEL'], lineage: [], errors: [], warnings: [] };
    const { status, body } = await post({ userIntent: 'Necesito contenido de Instagram para TéDivina', executionMode: 'PREPARE_ONLY', assetPackage });
    assert.equal(status, 200);
    assert.ok(body.id);
    assert.equal(typeof body.status, 'string');
  });
});
