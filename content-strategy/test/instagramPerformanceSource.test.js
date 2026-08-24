// instagramPerformanceSource.test.js — Fase 19, §9/§6. Ninguna prueba hace
// una llamada HTTP real; la única que ejercita la rama de red inyecta un
// fetchImpl de prueba (mismo mecanismo que InstagramPublicationAdapter).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InstagramPerformanceSource, collectPlatformPerformanceObservations, METRIC_AVAILABILITY } from '../src/instagramPerformanceSource.js';
import { PerformanceSource } from '../../performance-learning-intelligence/src/performanceSource.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { NOT_AVAILABLE, ALLOWED_METRICS } from '../../performance-learning-intelligence/src/performanceObservation.js';

describe('InstagramPerformanceSource — es una instancia intercambiable de PerformanceSource', () => {
  test('extiende PerformanceSource', () => {
    assert.ok(new InstagramPerformanceSource() instanceof PerformanceSource);
  });
});

describe('InstagramPerformanceSource — sin credenciales, nunca intenta red (estado real de este repositorio)', () => {
  test('fetch() lanza "REQUIERE CREDENCIAL" si falta INSTAGRAM_ACCESS_TOKEN, sin llamar fetchImpl', async () => {
    let called = false;
    const source = new InstagramPerformanceSource({ accessToken: null, fetchImpl: async () => { called = true; } });
    await assert.rejects(() => source.fetch({ externalPostId: 'ig_media_123' }), /REQUIERE CREDENCIAL/);
    assert.equal(called, false);
  });

  test('fetch() exige externalPostId real — nunca inventa un id', async () => {
    const source = new InstagramPerformanceSource({ accessToken: 'fake-token-for-structural-test' });
    await assert.rejects(() => source.fetch({}), /externalPostId/);
  });
});

describe('METRIC_AVAILABILITY — refleja exactamente la auditoría oficial de Fase 18 §8', () => {
  test('views/likes/comments/saves/shares están AVAILABLE; el resto no', () => {
    assert.equal(METRIC_AVAILABILITY.views, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.likes, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.comments, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.saves, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.shares, 'AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.watch_time_seconds, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.completion_rate, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.retention_rate, 'NOT_AVAILABLE');
    assert.equal(METRIC_AVAILABILITY.clicks, 'UNKNOWN');
  });

  test('toda métrica de ALLOWED_METRICS tiene una clasificación explícita — ninguna queda sin auditar', () => {
    for (const metric of ALLOWED_METRICS) {
      assert.ok(metric in METRIC_AVAILABILITY, `falta clasificación de disponibilidad para "${metric}"`);
    }
  });
});

describe('fetch() con fetchImpl inyectado (nunca red real) — nunca inventa un valor para una métrica no disponible', () => {
  test('métricas NOT_AVAILABLE/UNKNOWN nunca se convierten en 0, incluso con una respuesta real exitosa', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: [
        { name: 'views', values: [{ value: 340 }] },
        { name: 'likes', values: [{ value: 22 }] },
        { name: 'comments', values: [{ value: 3 }] },
        { name: 'saved', values: [{ value: 5 }] },
        { name: 'shares', values: [{ value: 1 }] },
      ] }),
    });
    const source = new InstagramPerformanceSource({ accessToken: 'fake-token-for-structural-test', fetchImpl });
    const metrics = await source.fetch({ externalPostId: 'ig_media_real_999' });

    assert.equal(metrics.views, 340);
    assert.equal(metrics.likes, 22);
    assert.equal(metrics.watch_time_seconds, NOT_AVAILABLE);
    assert.equal(metrics.completion_rate, NOT_AVAILABLE);
    assert.equal(metrics.retention_rate, NOT_AVAILABLE);
    assert.equal(metrics.clicks, NOT_AVAILABLE);
    assert.notEqual(metrics.watch_time_seconds, 0);
  });

  test('si Meta omite un campo AVAILABLE en la respuesta, el valor es NOT_AVAILABLE, nunca 0', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ name: 'views', values: [{ value: 100 }] }] }) });
    const source = new InstagramPerformanceSource({ accessToken: 'fake-token-for-structural-test', fetchImpl });
    const metrics = await source.fetch({ externalPostId: 'ig_media_real_999' });
    assert.equal(metrics.views, 100);
    assert.equal(metrics.likes, NOT_AVAILABLE); // Meta no lo devolvió esta vez — nunca se asume 0
  });
});

describe('collectPlatformPerformanceObservations — §7 trazabilidad, nunca mezclado con datos sintéticos', () => {
  test('produce PerformanceObservation con source="platform_observed", nunca "synthetic_fixture"', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'slideshow', topic: 'prueba', external_post_id: 'ig_media_real_999' });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ name: 'views', values: [{ value: 340 }] }] }) });
    const source = new InstagramPerformanceSource({ accessToken: 'fake-token-for-structural-test', fetchImpl });
    const observations = await collectPlatformPerformanceObservations({ publishedContent, source });

    for (const obs of observations) {
      assert.equal(obs.source, 'platform_observed');
      assert.equal(obs.content_id, publishedContent.content_id);
    }
    const viewsObs = observations.find((o) => o.metric === 'views');
    assert.equal(viewsObs.value, 340);
    assert.equal(viewsObs.confidence, 0.9);

    const watchTimeObs = observations.find((o) => o.metric === 'watch_time_seconds');
    assert.equal(watchTimeObs.value, NOT_AVAILABLE);
    assert.equal(watchTimeObs.confidence, 0);
  });
});
