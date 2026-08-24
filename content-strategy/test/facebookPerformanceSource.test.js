// facebookPerformanceSource.test.js — Performance Intelligence, Fase 9.
// Ninguna prueba hace una llamada HTTP real; se inyecta un fetchImpl de
// prueba (mismo mecanismo que instagramPerformanceSource.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FacebookPerformanceSource, collectFacebookPerformanceObservations, METRIC_AVAILABILITY } from '../src/facebookPerformanceSource.js';
import { PerformanceSource } from '../../performance-learning-intelligence/src/performanceSource.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { NOT_AVAILABLE, ALLOWED_METRICS } from '../../performance-learning-intelligence/src/performanceObservation.js';

function fetchImplFor({ fieldsBody, fieldsOk = true, insightsBody, insightsOk = true }) {
  return async (url) => {
    if (url.includes('/insights?')) {
      return { ok: insightsOk, json: async () => insightsBody };
    }
    return { ok: fieldsOk, json: async () => fieldsBody };
  };
}

describe('FacebookPerformanceSource — es una instancia intercambiable de PerformanceSource', () => {
  test('extiende PerformanceSource', () => {
    assert.ok(new FacebookPerformanceSource({ pageAccessToken: 'x' }) instanceof PerformanceSource);
  });
});

describe('FacebookPerformanceSource — sin credenciales, nunca intenta red', () => {
  test('fetch() lanza "REQUIERE CREDENCIAL" si falta FACEBOOK_PAGE_ACCESS_TOKEN, sin llamar fetchImpl', async () => {
    // '' en vez de null: resolveFacebookConfig usa "??" (solo cae al env en
    // null/undefined) -- en un entorno donde FACEBOOK_PAGE_ACCESS_TOKEN SÍ
    // está configurado de verdad (este repositorio), pasar null se
    // resolvería igual al token real vía process.env. '' es falsy pero no
    // nullish: fuerza el override sin depender del entorno ambiente.
    let called = false;
    const source = new FacebookPerformanceSource({ pageAccessToken: '', fetchImpl: async () => { called = true; } });
    await assert.rejects(() => source.fetch({ externalPostId: 'fb_post_123' }), /REQUIERE CREDENCIAL/);
    assert.equal(called, false);
  });

  test('fetch() exige externalPostId real — nunca inventa un id', async () => {
    const source = new FacebookPerformanceSource({ pageAccessToken: 'fake-token-for-structural-test' });
    await assert.rejects(() => source.fetch({}), /externalPostId/);
  });
});

describe('METRIC_AVAILABILITY — refleja la auditoría en vivo de Performance Intelligence Fase 1', () => {
  test('likes/comments/clicks/views/watch_time_seconds están AVAILABLE; shares/saves/completion_rate/retention_rate no', () => {
    assert.equal(METRIC_AVAILABILITY.likes, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.comments, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.clicks, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.views, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.watch_time_seconds, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.shares, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.saves, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.completion_rate, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.retention_rate, 'NOT_AVAILABLE');
  });

  test('toda métrica de ALLOWED_METRICS tiene una clasificación explícita', () => {
    for (const metric of ALLOWED_METRICS) {
      assert.ok(metric in METRIC_AVAILABILITY, `falta clasificación de disponibilidad para "${metric}"`);
    }
  });
});

describe('fetch() con fetchImpl inyectado — nunca inventa un valor para una métrica no disponible', () => {
  test('combina fields (likes/comments) + insights (clicks/views/watch_time_seconds) en un solo resultado', async () => {
    const fetchImpl = fetchImplFor({
      fieldsBody: { likes: { summary: { total_count: 12 } }, comments: { summary: { total_count: 4 } } },
      insightsBody: { data: [
        { name: 'post_clicks', values: [{ value: 7 }] },
        { name: 'post_video_views', values: [{ value: 200 }] },
        { name: 'post_video_avg_time_watched', values: [{ value: 15 }] },
      ] },
    });
    const source = new FacebookPerformanceSource({ pageAccessToken: 'fake-token-for-structural-test', fetchImpl });
    const metrics = await source.fetch({ externalPostId: 'fb_post_real_999' });

    assert.equal(metrics.likes, 12);
    assert.equal(metrics.comments, 4);
    assert.equal(metrics.clicks, 7);
    assert.equal(metrics.views, 200);
    assert.equal(metrics.watch_time_seconds, 15);
    assert.equal(metrics.shares, NOT_AVAILABLE);
    assert.equal(metrics.saves, NOT_AVAILABLE);
    assert.equal(metrics.completion_rate, NOT_AVAILABLE);
    assert.equal(metrics.retention_rate, NOT_AVAILABLE);
  });

  test('si Meta omite el campo "likes" (post con 0 reacciones, mismo comportamiento que "shares"), el valor es NOT_AVAILABLE, nunca 0', async () => {
    const fetchImpl = fetchImplFor({
      fieldsOk: false, fieldsBody: { error: { message: 'Tried accessing nonexisting field (likes)' } },
      insightsBody: { data: [] },
    });
    const source = new FacebookPerformanceSource({ pageAccessToken: 'fake-token-for-structural-test', fetchImpl });
    const metrics = await source.fetch({ externalPostId: 'fb_post_real_999' });
    assert.equal(metrics.likes, NOT_AVAILABLE);
    assert.equal(metrics.comments, NOT_AVAILABLE);
    assert.notEqual(metrics.likes, 0);
  });

  test('insights vacío (data:[]) nunca se convierte en 0 para clicks/views/watch_time_seconds', async () => {
    const fetchImpl = fetchImplFor({
      fieldsBody: { likes: { summary: { total_count: 0 } }, comments: { summary: { total_count: 0 } } },
      insightsBody: { data: [] },
    });
    const source = new FacebookPerformanceSource({ pageAccessToken: 'fake-token-for-structural-test', fetchImpl });
    const metrics = await source.fetch({ externalPostId: 'fb_post_real_999' });
    assert.equal(metrics.likes, 0); // 0 real confirmado por Graph (total_count presente) -- distinto de ausencia
    assert.equal(metrics.comments, 0);
    assert.equal(metrics.clicks, NOT_AVAILABLE);
    assert.equal(metrics.views, NOT_AVAILABLE);
    assert.equal(metrics.watch_time_seconds, NOT_AVAILABLE);
  });
});

describe('collectFacebookPerformanceObservations — trazabilidad, nunca mezclado con datos sintéticos', () => {
  test('produce PerformanceObservation con source="platform_observed", nunca "synthetic_fixture"', async () => {
    const publishedContent = createPublishedContent({ platform: 'facebook', published_at: new Date().toISOString(), content_type: 'social_post', format: 'image', topic: 'prueba', external_post_id: 'fb_post_real_999' });
    const fetchImpl = fetchImplFor({
      fieldsBody: { likes: { summary: { total_count: 3 } }, comments: { summary: { total_count: 0 } } },
      insightsBody: { data: [{ name: 'post_clicks', values: [{ value: 1 }] }] },
    });
    const source = new FacebookPerformanceSource({ pageAccessToken: 'fake-token-for-structural-test', fetchImpl });
    const observations = await collectFacebookPerformanceObservations({ publishedContent, source });

    for (const obs of observations) {
      assert.equal(obs.source, 'platform_observed');
      assert.equal(obs.content_id, publishedContent.content_id);
    }
    const likesObs = observations.find((o) => o.metric === 'likes');
    assert.equal(likesObs.value, 3);
    assert.equal(likesObs.confidence, 0.9);

    const sharesObs = observations.find((o) => o.metric === 'shares');
    assert.equal(sharesObs.value, NOT_AVAILABLE);
    assert.equal(sharesObs.confidence, 0);
  });
});
