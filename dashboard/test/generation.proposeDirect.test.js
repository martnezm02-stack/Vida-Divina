// generation.proposeDirect.test.js — Corrección integral "Crear
// contenido" (2026-08-28): cobertura real de POST /api/create/propose-direct
// -- Media Type (Paso 1/2: A/B/C/D del encargo) y coherencia de
// hook/cta/instrucción (Paso 3/4: E/G del encargo). Servidor real, puerto
// efímero, mismo patrón que videoWorkspace.test.js -- nunca mockea
// hypothesisCreativeEngine.js.

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
after(() => new Promise((resolve) => {
  server.close(() => resolve());
  server.closeAllConnections?.();
}));

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

const STATIC_FORMAT = 'Static comparison frames';

describe('POST /api/create/propose-direct — Media Type (Paso 1/2 del encargo)', () => {
  test('A/D: instrucción real con intención de video -> mediaType "VIDEO" en la respuesta', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Quiero un video corto de una persona entrenando en el gimnasio.',
    });
    assert.equal(status, 200);
    assert.ok(body.batchId, `se esperaba un batchId real, recibido: ${JSON.stringify(body)}`);
    assert.equal(body.mediaType, 'VIDEO');
  });

  test('B: la variante propuesta NUNCA cae en un formato estático real (incompatible con Video Script) -- repetido varias veces, nunca un solo acierto por azar', async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { status, body } = await post('/api/create/propose-direct', {
        productId: 'ripped-capsules', rawText: `Instrucción de prueba real número ${i} sobre rutina diaria.`,
      });
      assert.equal(status, 200);
      assert.ok(body.batchId, `intento ${i}: se esperaba batchId real, recibido: ${JSON.stringify(body)}`);
      assert.notEqual(body.creativeVariant.creativeVariant.format, STATIC_FORMAT, `intento ${i}: la variante propuesta cayó en formato estático real`);
    }
  });

  test('C: el formato real de la variante propuesta sigue siendo aplicable a Video Script (nunca aplicable:false por formato estático)', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Video real mostrando el uso diario del producto.',
    });
    assert.ok(proposal.batchId);
    const { status, body: script } = await post('/api/video-script', {
      hook: proposal.creativeVariant.copy.hook,
      bodyLines: proposal.creativeVariant.copy.bodyLines,
      sectionsUsed: proposal.creativeVariant.copy.sectionsUsed,
      cta: proposal.creativeVariant.copy.cta,
      format: proposal.creativeVariant.creativeVariant.format,
      copyStyle: proposal.creativeVariant.copyStyle,
    });
    assert.equal(status, 200);
    assert.equal(script.applicable, true, `Video Script no aplicable para el formato real propuesto: ${JSON.stringify(script)}`);
  });
});

describe('POST /api/create/propose-direct — coherencia con la instrucción (Paso 3/4 del encargo)', () => {
  test('E/G: hookText/ctaText literales del usuario sobrescriben el copy generado (fuente de verdad real, nunca ignorados en silencio)', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules',
      rawText: 'Mujer adulta entrenando en un gimnasio moderno.',
      hookText: 'Hook literal real de prueba, único y reconocible.',
      ctaText: 'CTA literal real de prueba, único y reconocible.',
    });
    assert.equal(status, 200);
    assert.equal(body.creativeVariant.copy.hook, 'Hook literal real de prueba, único y reconocible.');
    assert.equal(body.creativeVariant.copy.cta, 'CTA literal real de prueba, único y reconocible.');
  });

  test('cada llamada real genera una propuesta NUEVA (nunca memoiza/reutiliza un batch anterior entre llamadas distintas)', async () => {
    const first = await post('/api/create/propose-direct', { productId: 'ripped-capsules', rawText: 'Primera instrucción real de prueba.' });
    const second = await post('/api/create/propose-direct', { productId: 'ripped-capsules', rawText: 'Segunda instrucción real de prueba, distinta.' });
    assert.notEqual(first.body.batchId, second.body.batchId);
  });
});

describe('GET /api/create/structure-recommendation + /api/create/model-recommendation -- Visual Continuity Context (Paso 8 del encargo)', () => {
  test('I: la vista previa de modelo/calidad expone visualContinuityContext real cuando la instrucción trae sujeto/entorno', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Mujer adulta entrenando en un gimnasio moderno, usando el producto.',
    });
    assert.ok(proposal.batchId);
    const { status, body } = await get(`/api/create/model-recommendation?batchId=${proposal.batchId}&variantIndex=0&userInstruction=${encodeURIComponent('Mujer adulta entrenando en un gimnasio moderno, usando el producto.')}`);
    assert.equal(status, 200);
    assert.equal(body.visualContinuityContext.subjectGender, 'female');
    assert.equal(body.visualContinuityContext.environment, 'gimnasio moderno');
  });

  test('S: sin userInstruction (backward compatibility), model-recommendation sigue funcionando igual que antes -- visualContinuityContext vacío, nunca rompe', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Instrucción neutra sin sujeto ni entorno mencionado.',
    });
    assert.ok(proposal.batchId);
    const { status, body } = await get(`/api/create/model-recommendation?batchId=${proposal.batchId}&variantIndex=0`);
    assert.equal(status, 200);
    assert.equal(body.visualContinuityContext.subjectGender, null);
    assert.ok(body.recommendedModel !== undefined);
  });
});
