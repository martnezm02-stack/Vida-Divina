import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MetaAdapter } from '../../src/publishing/metaAdapter.js';

const CAROUSEL_PACKAGE_REAL_SHAPE = Object.freeze({
  status: 'COMPLETED', assetPackageType: 'CAROUSEL',
  assetPackage: { type: 'CAROUSEL', assets: [{ assetId: 'a'.repeat(64), path: 'C:/tmp/slide-01.png' }, { assetId: 'b'.repeat(64), path: 'C:/tmp/slide-02.png' }] },
  outputAssets: [],
});

describe('MetaAdapter — Instagram Graph API real (fetch simulado)', () => {
  test('sin credenciales: CONFIGURATION_REQUIRED, ninguna llamada de red', async () => {
    let llamado = false;
    const adapter = new MetaAdapter({ accessToken: null, igUserId: null, fetchImpl: async () => { llamado = true; } });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, null, {});
    assert.equal(r.status, 'CONFIGURATION_REQUIRED');
    assert.equal(llamado, false);
  });

  test('con credenciales pero sin mediaUrl https: CONFIGURATION_REQUIRED, ninguna llamada de red', async () => {
    let llamado = false;
    const adapter = new MetaAdapter({ accessToken: 'tok', igUserId: 'user', fetchImpl: async () => { llamado = true; } });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, null, {});
    assert.equal(r.status, 'CONFIGURATION_REQUIRED');
    assert.equal(llamado, false);
  });

  test('video (.mp4): usa media_type REELS', async () => {
    const cuerpos = [];
    const fetchImpl = async (url, opts) => {
      cuerpos.push(JSON.parse(opts.body));
      if (String(url).endsWith('/media')) return { ok: true, json: async () => ({ id: 'container-1' }) };
      return { ok: true, json: async () => ({ id: 'published-1' }) };
    };
    const adapter = new MetaAdapter({ accessToken: 'tok', igUserId: 'user', fetchImpl });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, null, { mediaUrl: 'https://example.com/a.mp4' });
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(cuerpos[0].media_type, 'REELS');
    assert.equal(cuerpos[0].video_url, 'https://example.com/a.mp4');
  });

  test('CAROUSEL real: crea un contenedor por item + contenedor padre + publica, con mediaUrls alineadas', async () => {
    const llamadas = [];
    const fetchImpl = async (url, opts) => {
      llamadas.push({ url: String(url), body: JSON.parse(opts.body) });
      if (llamadas.length <= 2) return { ok: true, json: async () => ({ id: `item-${llamadas.length}` }) };
      if (String(url).endsWith('/media')) return { ok: true, json: async () => ({ id: 'parent-container' }) };
      return { ok: true, json: async () => ({ id: 'published-carousel' }) };
    };
    const adapter = new MetaAdapter({ accessToken: 'tok', igUserId: 'user', fetchImpl });
    const r = await adapter.publish(CAROUSEL_PACKAGE_REAL_SHAPE, null, { mediaUrls: ['https://example.com/1.png', 'https://example.com/2.png'], caption: 'TéDivina' });
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.externalId, 'published-carousel');
    assert.equal(llamadas[0].body.is_carousel_item, true);
    assert.equal(llamadas[2].body.media_type, 'CAROUSEL');
    assert.deepEqual(llamadas[2].body.children, ['item-1', 'item-2']);
  });

  test('CAROUSEL sin mediaUrls alineadas: CONFIGURATION_REQUIRED, ninguna llamada de red', async () => {
    let llamado = false;
    const adapter = new MetaAdapter({ accessToken: 'tok', igUserId: 'user', fetchImpl: async () => { llamado = true; } });
    const r = await adapter.publish(CAROUSEL_PACKAGE_REAL_SHAPE, null, { mediaUrls: ['https://example.com/1.png'] });
    assert.equal(r.status, 'CONFIGURATION_REQUIRED');
    assert.equal(llamado, false);
  });

  test('Graph API responde error: FAILED con el mensaje real (nunca expone el token)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid parameter' } }) });
    const adapter = new MetaAdapter({ accessToken: 'secreto-123', igUserId: 'user', fetchImpl });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.jpg' }] }, null, { mediaUrl: 'https://example.com/a.jpg' });
    assert.equal(r.status, 'FAILED');
    assert.match(r.error, /Invalid parameter/);
    assert.doesNotMatch(r.error, /secreto-123/);
  });
});
