import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FacebookAdapter } from '../../src/publishing/facebookAdapter.js';

describe('FacebookAdapter — Facebook Page Graph API real (fetch simulado)', () => {
  test('sin FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN: CONFIGURATION_REQUIRED, ninguna llamada de red', async () => {
    let llamado = false;
    const adapter = new FacebookAdapter({ pageId: null, pageAccessToken: null, fetchImpl: async () => { llamado = true; } });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.jpg' }] }, null, {});
    assert.equal(r.status, 'CONFIGURATION_REQUIRED');
    assert.equal(llamado, false);
  });

  test('CAROUSEL: DEFERRED explícito (FAILED con motivo), nunca finge soporte', async () => {
    const adapter = new FacebookAdapter({ pageId: 'page1', pageAccessToken: 'tok', fetchImpl: async () => { throw new Error('no debería llamarse'); } });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'CAROUSEL', assetPackage: { type: 'CAROUSEL', assets: [] }, outputAssets: [] }, null, {});
    assert.equal(r.status, 'FAILED');
    assert.match(r.error, /DEFERRED|no está implementada/i);
  });

  test('imagen real, con credenciales + fetch simulado: PUBLISHED', async () => {
    const fetchImpl = async (url, opts) => {
      assert.match(String(url), /\/page1\/photos$/);
      const body = JSON.parse(opts.body);
      assert.equal(body.url, 'https://example.com/a.jpg');
      return { ok: true, json: async () => ({ id: 'fb-post-1' }) };
    };
    const adapter = new FacebookAdapter({ pageId: 'page1', pageAccessToken: 'tok', fetchImpl });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.jpg' }] }, null, { mediaUrl: 'https://example.com/a.jpg' });
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.externalId, 'fb-post-1');
  });

  test('video real: usa /videos con file_url', async () => {
    const fetchImpl = async (url, opts) => {
      assert.match(String(url), /\/page1\/videos$/);
      const body = JSON.parse(opts.body);
      assert.equal(body.file_url, 'https://example.com/a.mp4');
      return { ok: true, json: async () => ({ id: 'fb-video-1' }) };
    };
    const adapter = new FacebookAdapter({ pageId: 'page1', pageAccessToken: 'tok', fetchImpl });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, null, { mediaUrl: 'https://example.com/a.mp4' });
    assert.equal(r.status, 'PUBLISHED');
  });
});
