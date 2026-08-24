// server.test.js — suite real del backend del dashboard: arranca el
// servidor HTTP REAL (puerto efímero, nunca mockeado) y golpea los
// endpoints reales, que a su vez llaman a los módulos reales
// (content-orchestrator/, creative-intelligence/). Cubre: carga,
// listados reales, protección de RAW, errores, estados de fallo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0'; // puerto efímero real asignado por el SO -- nunca choca con una instancia ya corriendo.
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
  server.closeAllConnections?.(); // fetch() mantiene keep-alive -- sin esto, close() puede quedarse esperando sockets abiertos.
}));

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}
async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('Dashboard carga (health + estáticos)', () => {
  test('GET /api/health responde ok', async () => {
    const { status, body } = await get('/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  test('GET / sirve el HTML real del dashboard', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /VIDA DIVINA/);
    assert.match(html, /Creative Studio/);
  });

  test('GET /styles.css y /app.js reales existen', async () => {
    const css = await fetch(`${baseUrl}/styles.css`);
    const js = await fetch(`${baseUrl}/app.js`);
    assert.equal(css.status, 200);
    assert.equal(js.status, 200);
  });

  test('ruta estática desconocida responde 404, nunca sirve fuera de public/', async () => {
    const res = await fetch(`${baseUrl}/../../voice-engine/app/config.py`);
    assert.notEqual(res.status, 200);
  });
});

describe('Navegación de API real (listados, sin inventar datos)', () => {
  test('GET /api/products refleja los productos reales de assets/products/', async () => {
    const { status, body } = await get('/api/products');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.some((p) => p.productSlug === 'te-divina'));
    const teDivina = body.find((p) => p.productSlug === 'te-divina');
    assert.equal(teDivina.factsAvailable, true);
    assert.equal(teDivina.nombreComercial, 'TéDivina');
  });

  test('GET /api/products/te-divina incluye integridad real verificada', async () => {
    const { status, body } = await get('/api/products/te-divina');
    assert.equal(status, 200);
    assert.ok(body.rawAssets.every((a) => a.integrityStatus === 'OK'));
  });

  test('GET /api/products/producto-inexistente responde 404 real, nunca inventa un producto', async () => {
    const { status, body } = await get('/api/products/producto-que-no-existe');
    assert.equal(status, 404);
    assert.match(body.error, /No existe el producto real/);
  });

  test('GET /api/assets lista RAW reales y outputs finales reales', async () => {
    const { status, body } = await get('/api/assets');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.rawAssets));
    assert.ok(body.rawAssets.every((a) => a.category === 'RAW'));
  });

  test('GET /api/campaigns refleja el store real (vacío o con ProductionArtifacts reales, nunca inventado)', async () => {
    const { status, body } = await get('/api/campaigns');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('GET /api/output-profiles expone los 13 perfiles reales de outputProfiles.js, sin duplicar la lista en el frontend', async () => {
    const { status, body } = await get('/api/output-profiles');
    assert.equal(status, 200);
    assert.equal(body.length, 13);
    assert.ok(body.some((p) => p.name === 'INSTAGRAM_REEL' && p.width === 1080));
  });

  test('GET /api/operations distingue soportadas de no soportadas -- ninguna operación falsa se presenta como funcional', async () => {
    const { status, body } = await get('/api/operations');
    assert.equal(status, 200);
    assert.ok(body.supported.includes('TEXT_OVERLAY'));
    assert.ok(body.unsupported.some((u) => u.operation === 'SCENE_TIMING_CHANGE'));
  });

  test('GET /api/audio-assets refleja los Audio Assets reales ya generados', async () => {
    const { status, body } = await get('/api/audio-assets');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.existingAudioAssets));
    assert.equal(typeof body.voiceEngineReachable, 'boolean');
  });
});

describe('Protección de RAW', () => {
  test('el dashboard nunca expone un endpoint de escritura/edición sobre assets/products/**/raw/', async () => {
    // No existe ninguna ruta POST/PUT/DELETE bajo /api/products o /media -- se confirma negativamente.
    const res = await fetch(`${baseUrl}/api/products/te-divina`, { method: 'DELETE' });
    assert.notEqual(res.status, 200);
  });

  test('GET /media/assets-products/te-divina/raw/<foto real> sirve el archivo real sin alterarlo', async () => {
    const res = await fetch(`${baseUrl}/media/assets-products/te-divina/raw/${encodeURIComponent('te divina c tasa.jpeg')}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
  });

  test('un intento de traversal sobre /media/ nunca sale de las raíces permitidas', async () => {
    const res = await fetch(`${baseUrl}/media/video-production/../../voice-engine/app/config.py`);
    assert.notEqual(res.status, 200);
  });
});

describe('CREATE — validación real y estados de fallo explícitos', () => {
  test('sin productId responde 400 real, nunca inventa un producto', async () => {
    const { status, body } = await post('/api/create', { hookText: 'x', voiceoverText: 'x', ctaText: 'x', outputProfileNames: ['INSTAGRAM_REEL'] });
    assert.equal(status, 400);
    assert.match(body.error, /productId/);
  });

  test('sin copy real (hookText/voiceoverText/ctaText) responde 400, nunca redacta el guion', async () => {
    const { status, body } = await post('/api/create', { productId: 'te-divina', outputProfileNames: ['INSTAGRAM_REEL'] });
    assert.equal(status, 400);
    assert.match(body.error, /nunca redacta/);
  });

  test('un audioAssetPath que no está en la lista real de Audio Assets se rechaza (nunca acepta una ruta arbitraria del cliente)', async () => {
    const { status, body } = await post('/api/create', {
      // mode distinto de 'CAMPAIGN' (Fase 4B, Creative Gate Enforcement):
      // este test valida audioAssetPath, no Creative Intelligence -- con
      // mode='CAMPAIGN' (default) el request se detendría antes, en
      // resolveCampaignCreativeCell(), porque el ciclo real de te-divina
      // tiene gateStatus.strategyAndBriefApproval='PENDING' (correcto tras
      // la corrección, ver campaignMode.test.js). Cualquier valor que no
      // sea 'CAMPAIGN' salta ese paso y deja llegar la validación real de
      // audioAssetPath, que es lo que esta prueba mide.
      mode: 'DIRECT_INSTRUCTION_MODE',
      productId: 'te-divina', hookText: 'h', voiceoverText: 'v', ctaText: 'c', productBody: 'b',
      audioSource: 'existing', audioAssetPath: 'C:/ruta/inventada/no-real.wav',
      outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 400);
    assert.match(body.error, /Audio Assets reales/);
  });

  test('un Output Profile desconocido se rechaza antes de intentar producir nada', async () => {
    const { status, body } = await post('/api/create', {
      productId: 'te-divina', hookText: 'h', voiceoverText: 'v', ctaText: 'c', productBody: 'b', outputProfileNames: ['TIKTOK_VIDEO'],
    });
    assert.equal(status, 400);
    assert.match(body.error, /perfil desconocido/);
  });

  test('sin "imageAssetPath" real y sin "productBody" se rechaza -- el motor nunca inventa el texto de la escena de producto', async () => {
    const { status, body } = await post('/api/create', {
      productId: 'te-divina', hookText: 'h', voiceoverText: 'v', ctaText: 'c', outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 400);
    assert.match(body.error, /productBody/);
  });

  // Fase 16, Parte 10: corrección del bloqueo real de "Crear Contenido"
  // cuando el usuario ya proveyó copy manual pero no existe CreativeCell
  // aprobada. Antes de esta fase, mode='CAMPAIGN' (default) detenía la
  // solicitud aquí con status MISSING_PRODUCT_FACTS -- ahora debe degradar
  // campaignResolution a null y CONTINUAR hasta la siguiente validación
  // real (audioAssetPath inventado, en este caso), nunca bloquear solo por
  // el gate de Campaign Mode cuando el copy ya es real y manual.
  test('mode CAMPAIGN + copy manual completo + sin CreativeCell aprobada -> YA NO bloquea (Fase 16): continúa hasta la siguiente validación real (audioAssetPath), nunca MISSING_PRODUCT_FACTS', async () => {
    const { status, body } = await post('/api/create', {
      mode: 'CAMPAIGN',
      productId: 'te-divina', hookText: 'h', voiceoverText: 'v', ctaText: 'c', productBody: 'b',
      audioSource: 'existing', audioAssetPath: 'C:/ruta/inventada/no-real.wav',
      outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 400);
    assert.notEqual(body.status, 'MISSING_PRODUCT_FACTS');
    assert.match(body.error, /Audio Assets reales/); // prueba de que SÍ pasó el gate de campaignResolution y llegó a la siguiente validación real.
  });
});

describe('CREATE — Sugerir variantes (hipótesis), Fase 16 Parte 11', () => {
  test('sin productId responde 400, nunca inventa un producto', async () => {
    const { status, body } = await post('/api/create/suggest-hypothesis', {});
    assert.equal(status, 400);
    assert.match(body.error, /productId/);
  });

  test('producto real CON Product Facts (te-divina) -> HYPOTHESIS_EXPERIMENT_READY con 3+ variantes reales', async () => {
    const { status, body } = await post('/api/create/suggest-hypothesis', { productId: 'te-divina' });
    assert.equal(status, 200);
    assert.equal(body.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(body.productId, 'te-divina');
    assert.ok(body.variantsDetail.length >= 3);
    for (const v of body.variantsDetail) {
      assert.equal(v.creativeVariant.status, 'HYPOTHESIS');
      assert.ok(v.copy.hook.length > 0);
      assert.ok(v.visualDirection.sceneDescription.length > 0);
    }
  });

  test('producto sin catálogo real vinculado -> MISSING_CREATIVE_MATCH explícito, nunca fabrica hipótesis de la nada', async () => {
    const { status, body } = await post('/api/create/suggest-hypothesis', { productId: 'producto-de-prueba-sin-catalogo-vinculado' });
    assert.equal(status, 200);
    assert.equal(body.status, 'MISSING_CREATIVE_MATCH');
  });
});

describe('EDIT — validación real', () => {
  test('un sourceAssetPath fuera de las raíces permitidas se rechaza', async () => {
    const { status, body } = await post('/api/edit', { sourceAssetPath: 'C:/no/existe.mp4', operations: ['LOUDNESS_NORMALIZATION'] });
    assert.equal(status, 400);
    assert.match(body.error, /archivo real dentro de las raíces permitidas/);
  });

  test('sin operations responde 400', async () => {
    const { status } = await post('/api/edit', { sourceAssetPath: 'C:/no/existe.mp4' });
    assert.equal(status, 400);
  });
});

describe('ADAPT — validación real', () => {
  test('sin outputProfileNames responde 400', async () => {
    const { status } = await post('/api/adapt', { sourceAssetPath: 'C:/no/existe.mp4' });
    assert.equal(status, 400);
  });

  test('un sourceAssetPath fuera de las raíces permitidas se rechaza', async () => {
    const { status, body } = await post('/api/adapt', { sourceAssetPath: 'C:/no/existe.mp4', outputProfileNames: ['INSTAGRAM_REEL'] });
    assert.equal(status, 400);
    assert.match(body.error, /archivo real dentro de las raíces permitidas/);
  });
});
