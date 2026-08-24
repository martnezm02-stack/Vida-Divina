// videoWorkspace.test.js — Auditoría "Video Workspace + Voice Engine"
// (2026-08-23): cobertura real de POST /api/video-script (Video Script,
// separado de Creative Copy) y de las correcciones reales sobre POST
// /api/create -- contrato "errors" (nunca "error") y el nuevo guard de
// Claim Safety sobre voiceoverText (generado O editado por el usuario,
// antes de llamar a Voice Engine). Servidor real, puerto efímero, mismo
// patrón que systemStatus.test.js -- nunca mockea el Content Generation
// Engine.

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

describe('POST /api/video-script', () => {
  test('formato con voiceover real (no estático): Video Script completo, applicable:true, con target de duración', async () => {
    const { status, body } = await post('/api/video-script', {
      hook: 'Olvida lo que has probado antes — esto parte de otro lugar. ⚡',
      bodyLines: ['Divina Ripped Capsules — aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro.'],
      sectionsUsed: [{ section: 'productReveal', sourceField: 'beneficios' }],
      cta: 'Conoce más sobre Divina Ripped Capsules por WhatsApp.',
      format: 'POV personal story',
      copyStyle: 'LIFESTYLE',
    });
    assert.equal(status, 200);
    assert.equal(body.applicable, true);
    assert.equal(body.styleCategory, 'POV');
    assert.ok(body.targetDurationRange.max > body.targetDurationRange.min);
    assert.ok(body.sections.length >= 2);
    assert.equal(body.sections[0].type, 'HOOK');
    assert.equal(body.sections.at(-1).type, 'CTA');
    assert.ok(['TOO_SHORT', 'WITHIN_TARGET', 'TOO_LONG'].includes(body.durationStatus));
  });

  test('formato estático ("Static comparison frames"): applicable:false, nunca inventa un voiceover', async () => {
    const { status, body } = await post('/api/video-script', {
      hook: 'x', bodyLines: ['y'], cta: 'z', format: 'Static comparison frames', copyStyle: 'DIRECT_RESPONSE',
    });
    assert.equal(status, 200);
    assert.equal(body.applicable, false);
    assert.equal(body.voiceoverText, null);
  });

  test('un claim prohibido real en bodyLines es rechazado -- 400 real, nunca 200 con un Video Script inseguro', async () => {
    const { status } = await post('/api/video-script', {
      hook: 'Hook seguro', bodyLines: ['cura el envejecimiento por completo'], cta: 'Escríbenos por WhatsApp.',
      format: 'POV personal story', copyStyle: 'POV',
    });
    assert.equal(status, 400);
  });
});

describe('POST /api/create -- contrato de error real y Claim Safety sobre voiceoverText (auditoría 2026-08-23)', () => {
  test('voiceoverText con un claim prohibido real: VALIDATION_FAILED con "errors" (arreglo, nunca "error" singular), rechazado ANTES de llamar a Voice Engine', async () => {
    const { status, body } = await post('/api/create', {
      mode: 'DIRECT',
      productId: 'ripped-capsules',
      hookText: 'Un hook cualquiera, real y seguro.',
      ctaText: 'Escríbenos por WhatsApp.',
      voiceoverText: 'Este producto cura el envejecimiento por completo.',
      productBody: 'Texto de producto real, sin claims inventados.',
      audioSource: 'existing',
      audioAssetPath: '',
      outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'VALIDATION_FAILED');
    assert.equal(body.error, undefined);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
    assert.match(body.errors[0], /cura/);
  });

  test('voiceoverText con lenguaje BRAND_AVOID real también se rechaza con el mismo contrato "errors"', async () => {
    const { status, body } = await post('/api/create', {
      mode: 'DIRECT',
      productId: 'ripped-capsules',
      hookText: 'Un hook cualquiera, real y seguro.',
      ctaText: 'Escríbenos por WhatsApp.',
      voiceoverText: 'Un fondo saturado y neón, muy llamativo.',
      productBody: 'Texto de producto real.',
      audioSource: 'existing',
      audioAssetPath: '',
      outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'VALIDATION_FAILED');
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });
});

// Fix "Audio Source / Voiceover Consistency" (2026-08-23): NUEVO
// VOICEOVER -> GENERAR NUEVO AUDIO, nunca reutilizar en silencio un Audio
// Asset existente desactualizado. TEST E/F/G del encargo: cobertura real
// server-side (el estado de UI en sí -- Partes A-D, updateAudioConsistencyUI()
// en app.js -- no tiene harness de DOM en este proyecto zero-dependency;
// se verifica por lectura de código y por la prueba funcional real
// documentada en el reporte de esta fase).
const TE_DIVINA_SAMPLE_HASH = '34c70e1b57927517ea6b5368363eff5a223a428ff6e7fec2a67ec29135ce60b6'; // sha256 real de _audio-cache/te-divina-creative-intelligence.wav

describe('POST /api/create -- warning VOICEOVER_AUDIO_MISMATCH (Parte 5 del encargo, contrato "warnings" existente, nunca bloqueante)', () => {
  async function existingAudioAndPng() {
    const { existingAudioAssets } = await (await fetch(`${baseUrl}/api/audio-assets`)).json();
    const products = await (await fetch(`${baseUrl}/api/products`)).json();
    const ripped = products.find((p) => p.productSlug === 'ripped-capsules');
    const png = ripped.rawAssets.find((a) => a.originalFilename === 'Ripped_01_Producto.png');
    return { audio: existingAudioAssets[0], png };
  }

  test('audioSource:"existing" + audioTextMismatch:true -> warnings incluye VOICEOVER_AUDIO_MISMATCH (nunca bloquea el render)', async () => {
    const { audio, png } = await existingAudioAndPng();
    const { status, body } = await post('/api/create', {
      mode: 'DIRECT', productId: 'ripped-capsules',
      hookText: 'Hook real y seguro.', ctaText: 'Escríbenos por WhatsApp.',
      voiceoverText: 'Un voiceover real distinto del audio existente seleccionado.',
      imageAssetPath: png.sourcePath, audioSource: 'existing', audioAssetPath: audio.path,
      audioTextMismatch: true, outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'COMPLETED');
    assert.ok(body.warnings.some((w) => w.includes('VOICEOVER_AUDIO_MISMATCH')));
  });

  test('audioSource:"existing" + audioTextMismatch:false (elección deliberada, sin edición posterior) -> sin warning', async () => {
    const { audio, png } = await existingAudioAndPng();
    const { body } = await post('/api/create', {
      mode: 'DIRECT', productId: 'ripped-capsules',
      hookText: 'Hook real y seguro.', ctaText: 'Escríbenos por WhatsApp.',
      voiceoverText: 'Un voiceover real, consistente con la elección explícita del usuario.',
      imageAssetPath: png.sourcePath, audioSource: 'existing', audioAssetPath: audio.path,
      audioTextMismatch: false, outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(body.status, 'COMPLETED');
    assert.ok(!body.warnings.some((w) => w.includes('VOICEOVER_AUDIO_MISMATCH')));
  });
});

describe('POST /api/create -- audioSource:"generate" real (TEST E/F/G del encargo, Voice Engine real disponible en este entorno)', () => {
  test('un voiceoverText nuevo y único con audioSource:"generate" para Divina Ripped Capsules produce un Audio Asset real DISTINTO del sample viejo de Té Divina', async (t) => {
    const health = await fetch('http://localhost:8000/health').catch(() => null);
    if (!health?.ok) { t.skip('Voice Engine no está reachable en este entorno -- se omite (ver real-e2e-* para prueba manual).'); return; }

    const products = await (await fetch(`${baseUrl}/api/products`)).json();
    const ripped = products.find((p) => p.productSlug === 'ripped-capsules');
    const png = ripped.rawAssets.find((a) => a.originalFilename === 'Ripped_01_Producto.png');

    // Texto corto a propósito: el Voice Engine real de este entorno tiene su
    // propio timeout interno de generación (~77s, confirmado con un texto
    // largo -- ver reporte de esta fase); un texto corto genera en ~30s de
    // forma confiable y sigue siendo un marcador único y no cacheado.
    const marker = `RIPPED VOICE TEST ${Date.now()}`;
    const { status, body } = await post('/api/create', {
      mode: 'DIRECT', productId: 'ripped-capsules',
      hookText: 'Un hook real y seguro para esta prueba.', ctaText: 'Escríbenos por WhatsApp.',
      voiceoverText: marker,
      voiceoverSource: 'USER_EDITED',
      imageAssetPath: png.sourcePath, audioSource: 'generate', audioTextMismatch: false,
      outputProfileNames: ['INSTAGRAM_REEL'],
    });

    assert.equal(status, 200);
    assert.equal(body.status, 'COMPLETED');
    assert.ok(!body.warnings.some((w) => w.includes('VOICEOVER_AUDIO_MISMATCH')));
    // TEST F: el hash del Audio Asset real usado NUNCA es el del sample viejo de Té Divina.
    assert.notEqual(body.audioAssets[0].hash, TE_DIVINA_SAMPLE_HASH);
    // TEST G: el path real NO viene de _audio-cache/ (el WAV recién generado por Voice Engine vive en otra ruta, ver voiceEngineClient.js).
    assert.doesNotMatch(body.audioAssets[0].path, /_audio-cache/);
  });
});
