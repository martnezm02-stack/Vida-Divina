// productIdResolution.test.js — Corrección raíz (Fase 17): "Crear
// Autónomo" (/api/create/propose, /api/carousel/propose) ahora puede
// resolver un producto real por identidad estructurada (productId real,
// el mismo que ya expone /api/products), no solo por texto libre. Este
// archivo prueba el cableado HTTP real -- la lógica de resolución en sí ya
// está cubierta en content-orchestrator/test/productMatcher.test.js y
// autonomousCreate.test.js (56+ tests reales).

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

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Corrección de identidad (Fase 18): assets/products/"Tongkat ali"/ (3
// fotos reales) se renombró a assets/products/tongkat-ali-cafe/ -- las
// mismas 3 fotos, sin modificar contenido, ahora vinculadas al productId
// real que ya existe en docs/productos/ (Café Divina Tongkat Ali).
// "Tongkat Ali" a secas nunca fue ni es un producto independiente.
describe('GET /api/products — Café Divina Tongkat Ali (Fase 18, corrección de identidad)', () => {
  test('tongkat-ali-cafe aparece con hechos reales y sus 3 assets reales, ya no como "Tongkat ali" sin catálogo', async () => {
    const { status, body } = await get('/api/products/tongkat-ali-cafe');
    assert.equal(status, 200);
    assert.equal(body.factsAvailable, true);
    assert.equal(body.nombreComercial, 'Café Divina Tongkat Ali');
    assert.equal(body.rawAssetCount, 3);
    assert.equal(body.rawAssets.length, 3);
  });

  test('"Tongkat ali" (nombre de carpeta anterior) ya no existe como producto -- 404 real', async () => {
    const { status } = await get('/api/products/Tongkat ali');
    assert.equal(status, 404);
  });

  test('la lista completa de productos incluye tongkat-ali-cafe y no incluye ningún "Tongkat Ali" independiente', async () => {
    const { body } = await get('/api/products');
    const slugs = body.map((p) => p.productSlug);
    assert.ok(slugs.includes('tongkat-ali-cafe'));
    assert.ok(!slugs.includes('Tongkat ali'));
    assert.ok(!slugs.includes('tongkat-ali'), 'no debe existir un slug "tongkat-ali" genérico -- solo el real "tongkat-ali-cafe"');
  });
});

describe('POST /api/create/propose — productId real estructurado (Fase 17/18)', () => {
  // Fase 4B (Creative Gate Enforcement): el ciclo real que contiene el
  // CreativeCell de TéDivina tiene gateStatus.strategyAndBriefApproval=
  // 'PENDING' -- ya no llega a PROPOSAL_READY (correcto, ver
  // content-orchestrator/test/campaignMode.test.js).
  //
  // Fase 16 (Marketing Creative Playbook + Hypothesis Testing Integration):
  // TéDivina SÍ tiene Product Facts reales -- cuando EVIDENCE_BASED no
  // encuentra match, el endpoint ya no se detiene en MISSING_CREATIVE_MATCH,
  // construye un Experiment de hipótesis real. Este test sigue demostrando
  // identidad estructurada real (productId/nombreComercial correctos).
  test('productId real (slug real de /api/products, "te-divina") resuelve TéDivina real, aunque el texto libre no lo mencione — HYPOTHESIS_EXPERIMENT_READY (Fase 16)', async () => {
    const { status, body } = await post('/api/create/propose', { userIntent: 'Crear una campaña para generar conversaciones por WhatsApp', productId: 'te-divina' });
    assert.equal(status, 200);
    assert.equal(body.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(body.product.productId, 'te-divina');
    assert.equal(body.product.nombreComercial, 'TéDivina');
    assert.ok(body.variantsDetail.length >= 3);
  });

  test('productId real "tongkat-ali-cafe" (Café Divina Tongkat Ali, ya vinculado a sus 3 assets reales) -- el producto se identifica correctamente, ya no MISSING_PRODUCT', async () => {
    const { status, body } = await post('/api/create/propose', { userIntent: 'Crear una campaña para generar interés', productId: 'tongkat-ali-cafe' });
    assert.equal(status, 200);
    assert.equal(body.product.productId, 'tongkat-ali-cafe');
    assert.equal(body.product.nombreComercial, 'Café Divina Tongkat Ali');
    assert.notEqual(body.status, 'MISSING_PRODUCT');
  });

  test('"Tongkat Ali" a secas (productId) -- MISSING_PRODUCT explícito y accionable, nunca inventa ni sustituye otro producto', async () => {
    const { status, body } = await post('/api/create/propose', { userIntent: 'Crear una campaña para el producto Tongkat Ali', productId: 'Tongkat Ali' });
    assert.equal(status, 200);
    assert.equal(body.status, 'MISSING_PRODUCT');
    assert.match(body.errors[0], /docs\/productos/);
  });

  test('sin productId -- compatibilidad intacta con el flujo de texto libre preexistente — HYPOTHESIS_EXPERIMENT_READY (Fase 16)', async () => {
    const { status, body } = await post('/api/create/propose', { userIntent: 'Campaña de TéDivina' });
    assert.equal(status, 200);
    assert.equal(body.status, 'HYPOTHESIS_EXPERIMENT_READY');
  });
});

describe('POST /api/carousel/propose — productId real estructurado (Fase 17)', () => {
  // Fase 16: el carrusel también recibe el status HYPOTHESIS_EXPERIMENT_READY
  // (mismo buildCreativeProposal real) -- handleProposeCarousel solo arma
  // el contenido de slides cuando status==='PROPOSAL_READY' (sin cambios en
  // esta fase), así que para una hipótesis simplemente reenvía la propuesta
  // tal cual, sin generar slides -- comportamiento honesto, no un error.
  test('productId real resuelve TéDivina real para el carrusel — HYPOTHESIS_EXPERIMENT_READY, sin generar slides todavía (requiere revisión humana primero)', async () => {
    const { status, body } = await post('/api/carousel/propose', { userIntent: 'Carrusel para generar interés', productId: 'te-divina', slideCount: 3 });
    assert.equal(status, 200);
    assert.equal(body.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(body.product.productId, 'te-divina');
    assert.equal(body.carousel, undefined);
  });
});
