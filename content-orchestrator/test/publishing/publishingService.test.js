// publishingService.test.js — Bloque 3. Contrato del adapter, plataforma
// no soportada, CONFIGURATION_REQUIRED real (sin credenciales), y un
// camino PUBLISHED con fetch simulado (ninguna petición sale a Internet)
// -- mismo criterio que graphApiSender.test.js/instagramPublicationAdapter
// (no existe todavía en este repo, pero mismo espíritu de Fase 19).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { publish, listPublishTargets, getAdapterForPlatform } from '../../src/publishing/publishingService.js';
import { PUBLISH_PLATFORMS, PUBLISH_STATUSES } from '../../src/publishing/publishingContract.js';

const SINGLE_PACKAGE_REAL_SHAPE = Object.freeze({
  status: 'COMPLETED', assetPackageType: 'SINGLE',
  outputAssets: [{ assetId: 'a'.repeat(64), path: 'C:/tmp/output.mp4' }],
});

describe('publishingContract', () => {
  test('expone exactamente los 3 platforms y 5 statuses requeridos', () => {
    assert.deepEqual([...PUBLISH_PLATFORMS].sort(), ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP']);
    assert.deepEqual([...PUBLISH_STATUSES].sort(), ['CONFIGURATION_REQUIRED', 'FAILED', 'PENDING', 'PUBLISHED', 'READY']);
  });
});

describe('publish() — dispatcher', () => {
  test('platform desconocido -> FAILED estructurado, nunca lanza', async () => {
    const r = await publish(SINGLE_PACKAGE_REAL_SHAPE, 'TIKTOK', null, {});
    assert.equal(r.status, 'FAILED');
    assert.match(r.error, /no soportado/);
  });

  test('assetPackage con status no publicable -> FAILED, nunca intenta publicar', async () => {
    const r = await publish({ status: 'RENDER_FAILED' }, 'WHATSAPP', 'x', {});
    assert.equal(r.status, 'FAILED');
  });

  test('assetPackage null -> FAILED, nunca lanza', async () => {
    const r = await publish(null, 'WHATSAPP', 'x', {});
    assert.equal(r.status, 'FAILED');
  });

  test('sin credenciales configuradas en este entorno: los 3 platforms devuelven CONFIGURATION_REQUIRED, sin tocar la red', async () => {
    for (const platform of PUBLISH_PLATFORMS) {
      const r = await publish(SINGLE_PACKAGE_REAL_SHAPE, platform, 'destino-test', {});
      assert.equal(r.status, 'CONFIGURATION_REQUIRED', `${platform} debería requerir configuración en este entorno`);
    }
  });

  test('listPublishTargets() refleja isConfigured() de cada adapter real, sin red', () => {
    const targets = listPublishTargets();
    assert.equal(targets.length, 3);
    assert.ok(targets.every((t) => t.configured === false)); // ninguna credencial real configurada en este repo
  });

  test('getAdapterForPlatform() devuelve null para un platform inválido', () => {
    assert.equal(getAdapterForPlatform('SNAPCHAT'), null);
  });
});

describe('publish() — camino PUBLISHED con fetch simulado (Instagram, imagen)', () => {
  test('con credenciales + mediaUrl real https + fetch simulado: PUBLISHED', async () => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-123' }) };
      return { ok: true, json: async () => ({ id: 'published-456' }) };
    };
    const r = await publish(
      { status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x'.repeat(64), path: 'C:/tmp/slide.png' }] },
      'INSTAGRAM', null,
      { mediaUrl: 'https://example.com/slide.png', caption: 'TéDivina', adapterOverrides: { accessToken: 'tok', igUserId: 'user123', fetchImpl } },
    );
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.externalId, 'published-456');
  });

  test('una imagen NUNCA consulta status_code (solo el video/REELS lo necesita)', async () => {
    let statusPolls = 0;
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes('fields=status_code')) { statusPolls++; return { ok: true, json: async () => ({ status_code: 'FINISHED' }) }; }
      if (s.endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-123' }) };
      return { ok: true, json: async () => ({ id: 'published-456' }) };
    };
    const r = await publish(
      { status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x'.repeat(64), path: 'C:/tmp/slide.png' }] },
      'INSTAGRAM', null,
      { mediaUrl: 'https://example.com/slide.png', caption: 'TéDivina', adapterOverrides: { accessToken: 'tok', igUserId: 'user123', fetchImpl } },
    );
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(statusPolls, 0);
  });
});

// Corrección real "Media ID is not available" (2026-09-11): Meta procesa un
// video_url de forma asíncrona -- confirmado con una llamada real al
// Graph API (un contenedor REELS recién creado reporta status_code
// "IN_PROGRESS" durante 25s+). Publicar contra un creation_id que sigue
// IN_PROGRESS es justo lo que produce ese error real de Meta. Estos tests
// cubren el fix: esperar "FINISHED" (con fetch simulado, sin esperar
// tiempo real vía sleepImpl) antes de intentar media_publish.
describe('publish() — video/REELS: espera real de status_code antes de media_publish', () => {
  const VIDEO_PACKAGE = Object.freeze({
    status: 'COMPLETED', assetPackageType: 'SINGLE',
    outputAssets: [{ assetId: 'v'.repeat(64), path: 'C:/tmp/reel.mp4' }],
  });

  test('IN_PROGRESS -> IN_PROGRESS -> FINISHED: espera y luego publica (PUBLISHED)', async () => {
    let statusPolls = 0;
    let publishCalled = false;
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes('fields=status_code')) {
        statusPolls++;
        const status_code = statusPolls < 3 ? 'IN_PROGRESS' : 'FINISHED';
        return { ok: true, json: async () => ({ status_code }) };
      }
      if (s.endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-reel-1' }) };
      publishCalled = true;
      return { ok: true, json: async () => ({ id: 'published-reel-1' }) };
    };
    const r = await publish(VIDEO_PACKAGE, 'INSTAGRAM', null, {
      mediaUrl: 'https://example.com/reel.mp4', caption: 'Reel real',
      adapterOverrides: { accessToken: 'tok', igUserId: 'user123', fetchImpl, sleepImpl: async () => {}, pollIntervalMs: 0 },
    });
    assert.equal(statusPolls, 3);
    assert.equal(publishCalled, true);
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.externalId, 'published-reel-1');
  });

  test('status_code ERROR real de Meta -> FAILED explícito, media_publish NUNCA se llama', async () => {
    let publishCalled = false;
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes('fields=status_code')) return { ok: true, json: async () => ({ status_code: 'ERROR', status: 'Error al procesar el video.' }) };
      if (s.endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-reel-2' }) };
      publishCalled = true;
      return { ok: true, json: async () => ({ id: 'no-deberia-llegar-aqui' }) };
    };
    const r = await publish(VIDEO_PACKAGE, 'INSTAGRAM', null, {
      mediaUrl: 'https://example.com/reel.mp4', caption: 'Reel real',
      adapterOverrides: { accessToken: 'tok', igUserId: 'user123', fetchImpl, sleepImpl: async () => {}, pollIntervalMs: 0 },
    });
    assert.equal(publishCalled, false);
    assert.equal(r.status, 'FAILED');
    assert.match(r.error, /ERROR/);
  });

  test('el contenedor nunca termina de procesarse (agota maxPollAttempts) -> FAILED explícito, nunca PUBLISHED falso', async () => {
    let publishCalled = false;
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes('fields=status_code')) return { ok: true, json: async () => ({ status_code: 'IN_PROGRESS' }) };
      if (s.endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-reel-3' }) };
      publishCalled = true;
      return { ok: true, json: async () => ({ id: 'no-deberia-llegar-aqui' }) };
    };
    const r = await publish(VIDEO_PACKAGE, 'INSTAGRAM', null, {
      mediaUrl: 'https://example.com/reel.mp4', caption: 'Reel real',
      adapterOverrides: { accessToken: 'tok', igUserId: 'user123', fetchImpl, sleepImpl: async () => {}, pollIntervalMs: 0, maxPollAttempts: 3 },
    });
    assert.equal(publishCalled, false);
    assert.equal(r.status, 'FAILED');
    assert.match(r.error, /3 intentos/);
  });
});
