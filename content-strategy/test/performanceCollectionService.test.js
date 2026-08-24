// performanceCollectionService.test.js — Performance Intelligence, Fase 9.
// Store real de prueba (directorio temporal, nunca el store de producción).
// Ningún test hace red real -- se pasan overrides con fetchImpl inyectado.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { selectPerformanceSource, collectPerformanceForPublishedContent, collectPerformanceForAllPublishedContent, COLLECTABLE_PLATFORMS } from '../src/performanceCollectionService.js';
import { InstagramPerformanceSource } from '../src/instagramPerformanceSource.js';
import { FacebookPerformanceSource } from '../src/facebookPerformanceSource.js';

function fetchImplInstagram(views) {
  return async () => ({ ok: true, json: async () => ({ data: [{ name: 'views', values: [{ value: views }] }] }) });
}
function fetchImplFacebook({ likes = 0, clicks } = {}) {
  return async (url) => {
    if (url.includes('/insights?')) {
      return { ok: true, json: async () => ({ data: clicks === undefined ? [] : [{ name: 'post_clicks', values: [{ value: clicks }] }] }) };
    }
    return { ok: true, json: async () => ({ likes: { summary: { total_count: likes } }, comments: { summary: { total_count: 0 } } }) };
  };
}

describe('selectPerformanceSource — WhatsApp nunca conectado aquí', () => {
  test('instagram/facebook devuelven la instancia correcta', () => {
    assert.ok(selectPerformanceSource('instagram', { accessToken: 'x' }) instanceof InstagramPerformanceSource);
    assert.ok(selectPerformanceSource('facebook', { pageAccessToken: 'x' }) instanceof FacebookPerformanceSource);
    assert.deepEqual([...COLLECTABLE_PLATFORMS].sort(), ['facebook', 'instagram']);
  });
  test('whatsapp lanza explícitamente -- nunca se mezcla mensajería con performance de publicación', () => {
    assert.throws(() => selectPerformanceSource('whatsapp'), /no soportado/);
  });
});

describe('collectPerformanceForPublishedContent', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'perf-collect-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('persiste observaciones reales para Instagram', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_1' });
    store.save('published_content', publishedContent);

    const result = await collectPerformanceForPublishedContent({
      publishedContent, store, overrides: { accessToken: 'fake', fetchImpl: fetchImplInstagram(340) },
    });
    assert.equal(result.status, 'COLLECTED');
    assert.ok(result.saved.some((o) => o.metric === 'views' && o.value === 340));

    const stored = store.loadAll('performance_observation').filter((o) => o.content_id === publishedContent.content_id);
    assert.ok(stored.length > 0);
  });

  test('idempotencia: correr dos veces el mismo día no duplica filas', async () => {
    const publishedContent = createPublishedContent({ platform: 'facebook', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'fb_1' });
    store.save('published_content', publishedContent);
    const overrides = { pageAccessToken: 'fake', fetchImpl: fetchImplFacebook({ likes: 5, clicks: 2 }) };

    const first = await collectPerformanceForPublishedContent({ publishedContent, store, overrides });
    assert.equal(first.status, 'COLLECTED');
    assert.ok(first.saved.length > 0);

    const second = await collectPerformanceForPublishedContent({ publishedContent, store, overrides });
    assert.equal(second.status, 'COLLECTED');
    assert.equal(second.saved.length, 0);
    assert.ok(second.skipped.every((s) => s.reason === 'ALREADY_COLLECTED_TODAY'));

    const likesRows = store.loadAll('performance_observation').filter((o) => o.content_id === publishedContent.content_id && o.metric === 'likes');
    assert.equal(likesRows.length, 1);
  });

  test('publication sin external_post_id -- error explícito, nunca intenta red', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x' });
    const result = await collectPerformanceForPublishedContent({ publishedContent, store, overrides: { accessToken: 'fake' } });
    assert.equal(result.status, 'ERROR');
    assert.match(result.error, /external_post_id/);
  });

  test('platform sin PerformanceSource conectado -- UNSUPPORTED_PLATFORM explícito', async () => {
    const publishedContent = createPublishedContent({ platform: 'tiktok', published_at: new Date().toISOString(), content_type: 'social_post', format: 'video', topic: 'x', external_post_id: 'tt_1' });
    const result = await collectPerformanceForPublishedContent({ publishedContent, store });
    assert.equal(result.status, 'UNSUPPORTED_PLATFORM');
  });

  test('token inválido / error de Graph API -- se reporta como ERROR estructurado, nunca lanza sin control', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_bad' });
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"Invalid OAuth access token."}}' });
    const result = await collectPerformanceForPublishedContent({ publishedContent, store, overrides: { accessToken: 'invalid-token', fetchImpl } });
    assert.equal(result.status, 'ERROR');
    assert.match(result.error, /400|Invalid|respondió/i);
  });
});

describe('collectPerformanceForAllPublishedContent — múltiples plataformas, secuencial', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'perf-collect-all-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('recolecta para instagram y facebook en el mismo store, sin cruzar datos', async () => {
    const ig = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'ig_multi' });
    const fb = createPublishedContent({ platform: 'facebook', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'x', external_post_id: 'fb_multi' });
    store.save('published_content', ig);
    store.save('published_content', fb);

    const results = await collectPerformanceForAllPublishedContent({
      store,
      overrides: { accessToken: 'fake', pageAccessToken: 'fake', fetchImpl: async (url) => {
        if (url.includes('ig_multi')) return { ok: true, json: async () => ({ data: [{ name: 'views', values: [{ value: 10 }] }] }) };
        if (url.includes('/insights?')) return { ok: true, json: async () => ({ data: [] }) };
        return { ok: true, json: async () => ({ likes: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } }) };
      } },
    });

    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.status === 'COLLECTED'));
    const igObs = store.loadAll('performance_observation').filter((o) => o.content_id === ig.content_id);
    const fbObs = store.loadAll('performance_observation').filter((o) => o.content_id === fb.content_id);
    assert.ok(igObs.every((o) => o.platform === 'instagram'));
    assert.ok(fbObs.every((o) => o.platform === 'facebook'));
  });
});
