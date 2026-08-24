// backfillPublishedContent.test.js — Performance Intelligence, Fase 9.
// Store real de prueba (directorio temporal). Ningún test hace red real.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { backfillPublishedContentFromExternalId, findExistingByExternalPostId } from '../src/backfillPublishedContent.js';

describe('backfillPublishedContentFromExternalId', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'perf-backfill-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('platform inválido -- lanza explícito, nunca intenta red', async () => {
    await assert.rejects(
      () => backfillPublishedContentFromExternalId({ platform: 'tiktok', externalPostId: 'x', store }),
      /no soportado/
    );
  });

  test('instagram: crea un PublishedContent real a partir SOLO de datos reales de Graph API', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ id: '18376003507235391', media_type: 'IMAGE', timestamp: '2026-08-20T09:32:50+0000', permalink: 'https://www.instagram.com/p/DcQcvvFlhUE/' }),
    });
    const result = await backfillPublishedContentFromExternalId({
      platform: 'instagram', externalPostId: '18376003507235391', store, overrides: { accessToken: 'fake', fetchImpl },
    });
    assert.equal(result.status, 'BACKFILLED');
    assert.equal(result.publishedContent.platform, 'instagram');
    assert.equal(result.publishedContent.external_post_id, '18376003507235391');
    assert.equal(result.publishedContent.format, 'image');
    assert.equal(result.publishedContent.published_at, '2026-08-20T09:32:50+0000');
    assert.equal(result.publishedContent.metadata.backfill, true);
  });

  test('idempotencia: un external_post_id ya backfilleado no crea un segundo PublishedContent', async () => {
    const before = store.loadAll('published_content').length;
    const fetchImpl = async () => { throw new Error('no debería llamarse -- ya existe'); };
    const result = await backfillPublishedContentFromExternalId({
      platform: 'instagram', externalPostId: '18376003507235391', store, overrides: { accessToken: 'fake', fetchImpl },
    });
    assert.equal(result.status, 'ALREADY_BACKFILLED');
    assert.equal(store.loadAll('published_content').length, before);
  });

  test('facebook: crea un PublishedContent real, format "unknown" (media_type no disponible con este token)', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ id: '122109854133422530', created_time: '2026-08-20T10:58:01+0000' }) });
    const result = await backfillPublishedContentFromExternalId({
      platform: 'facebook', externalPostId: '122109854133422530', store, overrides: { pageAccessToken: 'fake', fetchImpl },
    });
    assert.equal(result.status, 'BACKFILLED');
    assert.equal(result.publishedContent.platform, 'facebook');
    assert.equal(result.publishedContent.format, 'unknown');
    assert.equal(result.publishedContent.published_at, '2026-08-20T10:58:01+0000');
  });

  test('findExistingByExternalPostId no encuentra un id real que nunca se backfilleó', () => {
    assert.equal(findExistingByExternalPostId(store, { platform: 'instagram', externalPostId: 'nunca-existio' }), null);
  });

  test('Graph API sin fecha real de publicación -- ERROR explícito, nunca inventa una fecha', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'ig_sin_fecha', media_type: 'IMAGE', timestamp: null }) });
    const result = await backfillPublishedContentFromExternalId({
      platform: 'instagram', externalPostId: 'ig_sin_fecha', store, overrides: { accessToken: 'fake', fetchImpl },
    });
    assert.equal(result.status, 'ERROR');
  });
});
