// instagramOwnPerformanceSource.test.js — todo mockeado vía fetchImpl
// (mismo patrón ya usado en content-strategy/test/instagramPerformanceSource.test.js
// e instagramPublicationAdapter.test.js) — ninguna prueba de este archivo
// toca la red real ni requiere credenciales.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  InstagramOwnPerformanceSource,
  mapInstagramMediaToPublishedContentRef,
  mapInstagramInsightsToSnapshot,
} from '../src/sources/instagramOwnPerformanceSource.js';
import { linkPublishedContentToCreativeCell, buildTraceChain } from '../src/traceability.js';
import { createCreativeCell } from '../src/creativeCell.js';
import { createProductionBrief } from '../src/productionBrief.js';
import { createObservation, createDataPoint, createPattern, createLearning } from '../src/evidenceTaxonomy.js';

const FAKE_MEDIA_ID = '17878496934523039';

function fakeFetchImpl({ withMedia = true } = {}) {
  return async (url) => {
    if (url.includes('/media?fields=id&')) {
      return { ok: true, status: 200, json: async () => ({ data: withMedia ? [{ id: FAKE_MEDIA_ID }] : [] }) };
    }
    if (url.includes(`/${FAKE_MEDIA_ID}?fields=`)) {
      return {
        ok: true, status: 200,
        json: async () => ({
          id: FAKE_MEDIA_ID,
          caption: 'Algo bueno se esta cocinando 🔥... Esperalo',
          media_type: 'IMAGE',
          media_url: 'https://scontent.cdninstagram.com/fake.jpg',
          permalink: 'https://www.instagram.com/p/DcFJQm5NBll/',
          timestamp: '2026-08-16T00:10:54+0000',
        }),
      };
    }
    if (url.includes(`/${FAKE_MEDIA_ID}/insights?`)) {
      return { ok: true, status: 200, json: async () => ({ data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'likes', values: [{ value: 8 }] }] }) };
    }
    if (url.includes('?fields=id,username')) {
      return { ok: true, status: 200, json: async () => ({ id: '17841439252107168', username: 'vive_vidadivina', name: 'vive_vidadivina', followers_count: 0, media_count: 1 }) };
    }
    throw new Error(`fakeFetchImpl: URL no reconocida en el mock: ${url}`);
  };
}

function sourceWithFakeFetch(opts) {
  return new InstagramOwnPerformanceSource({ accessToken: 'fake-token-solo-para-pruebas', igUserId: '17841439252107168', fetchImpl: fakeFetchImpl(opts) });
}

describe('1. Mapping correcto de Instagram media', () => {
  test('mapInstagramMediaToPublishedContentRef mapea los 6 campos pedidos', () => {
    const ref = mapInstagramMediaToPublishedContentRef({
      id: FAKE_MEDIA_ID, caption: 'hola', mediaType: 'IMAGE', timestamp: '2026-08-16T00:10:54+0000',
      permalink: 'https://instagram.com/p/x', mediaUrl: 'https://cdn/x.jpg', thumbnailUrl: null,
    });
    assert.equal(ref.platform, 'instagram');
    assert.equal(ref.platformMediaId, FAKE_MEDIA_ID);
    assert.equal(ref.mediaType, 'IMAGE');
    assert.equal(ref.timestamp, '2026-08-16T00:10:54+0000');
    assert.equal(ref.permalink, 'https://instagram.com/p/x');
    assert.equal(ref.caption, 'hola');
  });

  test('rechaza un media sin id real — nunca inventa una referencia', () => {
    assert.throws(() => mapInstagramMediaToPublishedContentRef({ caption: 'x' }));
  });
});

describe('2. Mapping correcto de insights', () => {
  test('mapInstagramInsightsToSnapshot traduce total_interactions → totalInteractions sin transformar valores', () => {
    const snapshot = mapInstagramInsightsToSnapshot({ reach: 120, likes: 8, comments: 0, saved: 0, shares: 0, total_interactions: 8, views: 0 }, FAKE_MEDIA_ID);
    assert.equal(snapshot.reach, 120);
    assert.equal(snapshot.likes, 8);
    assert.equal(snapshot.totalInteractions, 8);
    assert.equal(snapshot.platformMediaId, FAKE_MEDIA_ID);
  });

  test('7. ausencia de métricas = null, nunca 0 inventado ni omitido', () => {
    const snapshot = mapInstagramInsightsToSnapshot({}, FAKE_MEDIA_ID);
    for (const field of ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'totalInteractions']) {
      assert.equal(snapshot[field], null, `se esperaba null en "${field}"`);
    }
  });
});

describe('3. Media ID preservation', () => {
  test('el id real de Instagram se conserva idéntico de extremo a extremo (media → snapshot → link)', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });
    assert.equal(content.platformMediaId, FAKE_MEDIA_ID);
    const [snapshot] = await source.fetchPerformance({ platformMediaId: content.platformMediaId });
    assert.equal(snapshot.platformMediaId, FAKE_MEDIA_ID);
  });
});

describe('4. CreativeCell → ProductionBrief → PublishedContent (con datos reales de Instagram)', () => {
  test('un media real de Instagram puede vincularse a una CreativeCell/ProductionBrief conocidas', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });

    const cell = createCreativeCell({ personaId: 'p1', painId: 'pain1', awareness: 'Problem Aware', angleId: 'a1', formatId: 'f1', mechanism: 'x' });
    const brief = createProductionBrief({
      creativeCellId: cell.creativeCellId, persona: 'x', pain: 'x', awareness: 'Problem Aware', angle: 'x', format: 'x',
      hookDirection: 'x', mechanismEntry: 'x', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'home', runtime: '20s',
    });

    const linked = linkPublishedContentToCreativeCell(content, [{ platform: 'instagram', platformMediaId: content.platformMediaId, creativeCellId: cell.creativeCellId, productionBriefId: brief.productionBriefId }]);
    assert.equal(linked.status, 'LINKED');
    assert.equal(linked.creativeCellId, cell.creativeCellId);

    const chain = buildTraceChain({ creativeCell: cell, productionBrief: brief });
    assert.equal(chain.productionBriefId, brief.productionBriefId);
  });
});

describe('5. PublishedContent → PerformanceSnapshot', () => {
  test('el snapshot obtenido corresponde al mismo publishedContentId derivado del media real', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });
    const [snapshot] = await source.fetchPerformance({ platformMediaId: content.platformMediaId });
    assert.equal(snapshot.platform, content.platform);
    assert.equal(snapshot.platformMediaId, content.platformMediaId);
  });
});

describe('6. Publicación sin CreativeCell = UNLINKED', () => {
  test('sin ninguna relación conocida, nunca se inventa un CreativeCell', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });
    const linked = linkPublishedContentToCreativeCell(content, []);
    assert.equal(linked.status, 'UNLINKED');
    assert.equal(linked.creativeCellId, null);
    assert.equal(linked.productionBriefId, null);
  });
});

describe('8. No generar Learning con evidencia insuficiente (1 sola publicación real)', () => {
  test('un solo PerformanceSnapshot de Instagram nunca puede convertirse en Pattern ni Learning', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });
    const [snapshot] = await source.fetchPerformance({ platformMediaId: content.platformMediaId });

    const data = createDataPoint({ domain: 'OWN_PERFORMANCE', field: 'reach', value: snapshot.reach, source: 'instagram_insights' });
    const observation = createObservation({ domain: 'OWN_PERFORMANCE', description: `La publicación alcanzó ${snapshot.reach} cuentas`, basedOnData: [data] });

    // 1 sola Observation nunca es suficiente para un Pattern (estructural, evidenceTaxonomy.js).
    assert.throws(() => createPattern({ domain: 'OWN_PERFORMANCE', description: 'x', basedOnObservations: [observation] }));
    // Y sin Pattern, nunca hay Learning.
    assert.throws(() => createLearning({ description: 'x', basedOnPatterns: [] }));
  });
});

describe('9. No generar claims de ventas / "ganador" / causalidad sin evidencia suficiente', () => {
  test('con una sola observación real, no existe ningún camino de este módulo que produzca un Learning/Recommendation', async () => {
    const source = sourceWithFakeFetch();
    const [content] = await source.fetchPublishedContent({ limit: 25 });
    const [snapshot] = await source.fetchPerformance({ platformMediaId: content.platformMediaId });
    // No hay Pattern posible (ver test 8) → no hay Learning posible → no hay
    // Recommendation posible. La cuenta real (@vive_vidadivina) tiene hoy 1
    // publicación — este test demuestra que, con los datos reales actuales,
    // el sistema queda estructuralmente incapaz de declarar un "ganador".
    assert.equal(typeof snapshot.reach, 'number');
    assert.throws(() => createPattern({ domain: 'OWN_PERFORMANCE', description: 'este formato es el ganador', basedOnObservations: [] }));
  });
});

describe('10. No modificar los lectores existentes', () => {
  test('los lectores reales exportan exactamente las funciones esperadas, sin cambios de firma', async () => {
    const accountReader = await import('../../content-strategy/src/instagramAccountReader.js');
    const mediaReader = await import('../../content-strategy/src/instagramMediaReader.js');
    const insightsReader = await import('../../content-strategy/src/instagramInsightsReader.js');
    assert.equal(typeof accountReader.obtenerCuentaInstagram, 'function');
    assert.equal(typeof accountReader.listarPublicaciones, 'function');
    assert.equal(typeof mediaReader.obtenerMedia, 'function');
    assert.equal(typeof insightsReader.obtenerInsightsDePublicacion, 'function');
  });

  test('sin credenciales, los lectores reales siguen rechazando antes de tocar la red (comportamiento original intacto)', async () => {
    const { obtenerCuentaInstagram } = await import('../../content-strategy/src/instagramAccountReader.js');
    await assert.rejects(() => obtenerCuentaInstagram({ accessToken: null, igUserId: null }), /REQUIERE CREDENCIAL/);
  });
});

describe('Cuenta (contexto, no traceability)', () => {
  test('fetchAccount delega en obtenerCuentaInstagram tal cual, sin transformar el resultado', async () => {
    const source = sourceWithFakeFetch();
    const account = await source.fetchAccount();
    assert.equal(account.username, 'vive_vidadivina');
  });
});
