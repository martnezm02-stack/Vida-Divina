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
});
