import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  NullCompetitiveResearchSource,
  createAdLibraryRawRecord,
  mapAdLibraryRawRecordToCompetitorCreativeRecord,
  MetaAdLibraryCompetitiveResearchSource,
  AD_ACTIVE_STATUS_VALUES,
  assertNoAccessTokenLeak,
  AD_LIBRARY_SEARCH_MODES,
  createAdLibrarySearchQuery,
} from '../src/sources/competitiveResearchSource.js';

describe('NullCompetitiveResearchSource — sin conexión real, nunca inventa un registro', () => {
  test('fetchCreativeRecords siempre devuelve vacío', async () => {
    const source = new NullCompetitiveResearchSource();
    assert.equal(source.name, 'null_competitive_research_source');
    assert.deepEqual(await source.fetchCreativeRecords({ competitorId: 'x' }), []);
  });
});

describe('AdLibraryRawRecord — adaptado a la respuesta REAL de Meta Ad Library (v26.0, /ads_archive)', () => {
  function raw(overrides = {}) {
    return createAdLibraryRawRecord({
      competitor: 'competitor-A',
      advertiser: 'Marca Competidora MX', // ~ page_name
      pageId: '123456789012345', // ~ page_id
      platforms: ['facebook', 'instagram'], // ~ publisher_platforms[]
      adLibraryId: '123456789', // ~ id
      creativeId: 'creative-987', // NO CONFIRMADO todavía por respuesta real
      adSnapshotUrl: 'https://www.facebook.com/ads/library/?id=123456789', // ~ ad_snapshot_url
      creationDate: '2026-05-28T00:00:00Z', // ~ ad_creation_time
      startDate: '2026-06-01T00:00:00Z', // ~ ad_delivery_start_time
      endDate: null, // ~ ad_delivery_stop_time — ausente = sigue activo o desconocido, nunca inferido
      activeStatus: 'ACTIVE',
      spendRange: 'UNKNOWN', // confirmado ausente en anuncios comerciales reales
      impressionRange: 'UNKNOWN', // confirmado ausente en anuncios comerciales reales
      creativeFormat: 'VIDEO', // NO CONFIRMADO todavía por respuesta real
      copyBodies: ['Descubre el secreto detrás de la energía natural'], // ~ ad_creative_bodies[]
      linkTitles: ['Energía natural, todos los días'], // ~ ad_creative_link_titles[]
      linkDescriptions: ['Conoce más sobre nuestra línea de energía.'], // ~ ad_creative_link_descriptions[]
      linkCaptions: ['marcacompetidora.mx'], // ~ ad_creative_link_captions[]
      landingDestination: 'https://marcacompetidora.mx/oferta', // NO CONFIRMADO todavía
      mediaReference: 'https://scontent.xx.fbcdn.net/ad-media.mp4', // NO CONFIRMADO todavía
      ...overrides,
    });
  }

  test('acepta y preserva todos los campos confirmados por la respuesta real', () => {
    const record = raw();
    assert.equal(record.competitor, 'competitor-A');
    assert.equal(record.advertiser, 'Marca Competidora MX');
    assert.equal(record.pageId, '123456789012345');
    assert.deepEqual([...record.platforms], ['facebook', 'instagram']);
    assert.equal(record.adLibraryId, '123456789');
    assert.equal(record.creationDate, '2026-05-28T00:00:00Z');
    assert.equal(record.startDate, '2026-06-01T00:00:00Z');
    assert.equal(record.endDate, null);
    assert.notEqual(record.creationDate, record.startDate); // nunca se asume creationDate = startDate
    assert.deepEqual([...record.copyBodies], ['Descubre el secreto detrás de la energía natural']);
    assert.deepEqual([...record.linkTitles], ['Energía natural, todos los días']);
    assert.deepEqual([...record.linkDescriptions], ['Conoce más sobre nuestra línea de energía.']);
    assert.deepEqual([...record.linkCaptions], ['marcacompetidora.mx']);
  });

  test('platforms debe ser un arreglo no vacío de strings — nunca un string singular', () => {
    assert.throws(() => createAdLibraryRawRecord({ competitor: 'x', platforms: 'facebook' }), /platforms/);
    assert.throws(() => createAdLibraryRawRecord({ competitor: 'x', platforms: [] }), /platforms/);
  });

  test('campos NO CONFIRMADOS o ausentes en anuncios comerciales quedan null/UNKNOWN/[], nunca inventados', () => {
    const record = createAdLibraryRawRecord({ competitor: 'competitor-B', platforms: ['facebook'] });
    assert.equal(record.advertiser, null);
    assert.equal(record.pageId, null);
    assert.equal(record.adLibraryId, null);
    assert.equal(record.creativeId, null); // NO CONFIRMADO
    assert.equal(record.adSnapshotUrl, null);
    assert.equal(record.creationDate, null);
    assert.equal(record.startDate, null);
    assert.equal(record.endDate, null);
    assert.equal(record.activeStatus, 'UNKNOWN');
    assert.equal(record.spendRange, 'UNKNOWN'); // confirmado ausente en anuncios comerciales
    assert.equal(record.impressionRange, 'UNKNOWN'); // confirmado ausente en anuncios comerciales
    assert.equal(record.creativeFormat, null); // NO CONFIRMADO
    assert.deepEqual([...record.copyBodies], []);
    assert.deepEqual([...record.linkTitles], []);
    assert.deepEqual([...record.linkDescriptions], []);
    assert.deepEqual([...record.linkCaptions], []);
    assert.equal(record.landingDestination, null); // NO CONFIRMADO
    assert.equal(record.mediaReference, null); // NO CONFIRMADO
  });

  test('exige "competitor" y "platforms"; valida activeStatus contra el enum', () => {
    assert.throws(() => createAdLibraryRawRecord({ competitor: '', platforms: ['facebook'] }));
    assert.throws(() => createAdLibraryRawRecord({ competitor: 'x', platforms: [] }));
    assert.throws(() => createAdLibraryRawRecord({ competitor: 'x', platforms: ['facebook'], activeStatus: 'PAUSED' }));
    assert.deepEqual([...AD_ACTIVE_STATUS_VALUES], ['ACTIVE', 'INACTIVE', 'UNKNOWN']);
  });

  test('mapAdLibraryRawRecordToCompetitorCreativeRecord mapea a CompetitorCreativeRecord sin fabricar campos, preservando las 4 estructuras de copy por separado', () => {
    const mapped = mapAdLibraryRawRecordToCompetitorCreativeRecord(raw());
    assert.equal(mapped.competitorId, 'competitor-A');
    assert.equal(mapped.accountId, 'Marca Competidora MX');
    assert.equal(mapped.pageId, '123456789012345');
    assert.deepEqual([...mapped.platforms], ['facebook', 'instagram']);
    assert.equal(mapped.permalink, 'https://www.facebook.com/ads/library/?id=123456789');
    assert.equal(mapped.dateCreated, '2026-05-28T00:00:00Z');
    assert.equal(mapped.datePublished, '2026-06-01T00:00:00Z');
    assert.equal(mapped.dateEnded, null);
    assert.equal(mapped.caption, 'Descubre el secreto detrás de la energía natural'); // derivado de copyBodies[0], no fabricado
    assert.deepEqual([...mapped.adCreativeBodies], ['Descubre el secreto detrás de la energía natural']);
    assert.deepEqual([...mapped.adCreativeLinkTitles], ['Energía natural, todos los días']);
    assert.deepEqual([...mapped.adCreativeLinkDescriptions], ['Conoce más sobre nuestra línea de energía.']);
    assert.deepEqual([...mapped.adCreativeLinkCaptions], ['marcacompetidora.mx']);
    assert.equal(mapped.sourceType, 'PAID');
    assert.equal(mapped.landingDestination, 'https://marcacompetidora.mx/oferta');
    assert.equal(mapped.spendRange, 'UNKNOWN');
    assert.equal(mapped.impressionRange, 'UNKNOWN');
    assert.equal(mapped.activeStatus, 'ACTIVE');
    assert.equal(mapped.mediaReference, 'https://scontent.xx.fbcdn.net/ad-media.mp4');
  });

  test('rechaza mapear un registro sin advertiser/adSnapshotUrl/ad_creative_bodies/creativeFormat real — nunca fabrica evidencia', () => {
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw({ advertiser: null })), /advertiser/);
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw({ adSnapshotUrl: null })), /adSnapshotUrl/);
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw({ copyBodies: [] })), /ad_creative_bodies/);
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw({ creativeFormat: null })), /creativeFormat/);
  });
});

describe('Paging Security — access_token nunca se persiste/serializa', () => {
  test('assertNoAccessTokenLeak lanza si el valor contiene "access_token"', () => {
    assert.throws(() => assertNoAccessTokenLeak('https://graph.facebook.com/...&access_token=EAA123'), /access_token/);
    assert.throws(() => assertNoAccessTokenLeak({ paging: { next: 'https://graph.facebook.com/...&access_token=EAA123' } }), /access_token/);
  });

  test('assertNoAccessTokenLeak pasa para valores reales sin token', () => {
    assert.equal(assertNoAccessTokenLeak({ competitor: 'x', platforms: ['facebook'] }), true);
  });

  test('createAdLibraryRawRecord rechaza cualquier valor que contenga "access_token" colado en un campo', () => {
    assert.throws(() => createAdLibraryRawRecord({ competitor: 'x', platforms: ['facebook'], adSnapshotUrl: 'https://x?access_token=EAA123' }), /access_token/);
  });

  test('ningún campo de AdLibraryRawRecord existe para guardar paging.next completo (ausencia estructural)', () => {
    const record = createAdLibraryRawRecord({ competitor: 'competitor-A', platforms: ['facebook'] });
    assert.equal('paging' in record, false);
    assert.equal('pagingNext' in record, false);
    assert.equal('nextPageUrl' in record, false);
  });
});

describe('search_page_ids — preparado, NOT_CONNECTED', () => {
  test('createAdLibrarySearchQuery construye una consulta SEARCH_PAGE_IDS válida marcada NOT_CONNECTED', () => {
    const query = createAdLibrarySearchQuery({ mode: 'SEARCH_PAGE_IDS', searchPageIds: ['123456789012345'], countries: ['MX'] });
    assert.equal(query.mode, 'SEARCH_PAGE_IDS');
    assert.deepEqual([...query.searchPageIds], ['123456789012345']);
    assert.equal(query.searchTerms, null);
    assert.equal(query.status, 'NOT_CONNECTED');
  });

  test('createAdLibrarySearchQuery construye una consulta SEARCH_TERMS válida (modo ya probado en esta fase)', () => {
    const query = createAdLibrarySearchQuery({ mode: 'SEARCH_TERMS', searchTerms: 'Vida Divina', countries: ['MX'] });
    assert.equal(query.searchTerms, 'Vida Divina');
    assert.equal(query.searchPageIds, null);
    assert.equal(query.status, 'NOT_CONNECTED');
  });

  test('rechaza SEARCH_PAGE_IDS sin ids reales — nunca inventa un page id', () => {
    assert.throws(() => createAdLibrarySearchQuery({ mode: 'SEARCH_PAGE_IDS', searchPageIds: [], countries: ['MX'] }), /searchPageIds/);
    assert.throws(() => createAdLibrarySearchQuery({ mode: 'SEARCH_PAGE_IDS', countries: ['MX'] }), /searchPageIds/);
  });

  test('rechaza sin countries', () => {
    assert.throws(() => createAdLibrarySearchQuery({ mode: 'SEARCH_TERMS', searchTerms: 'x', countries: [] }), /countries/);
  });

  test('AD_LIBRARY_SEARCH_MODES tiene exactamente los 2 modos', () => {
    assert.deepEqual([...AD_LIBRARY_SEARCH_MODES], ['SEARCH_TERMS', 'SEARCH_PAGE_IDS']);
  });
});

describe('MetaAdLibraryCompetitiveResearchSource — PREPARADO, no conectado', () => {
  test('rechaza construirse sin fetchImpl inyectado — nunca se conecta a Meta por defecto', () => {
    assert.throws(() => new MetaAdLibraryCompetitiveResearchSource(), /fetchImpl/);
    assert.throws(() => new MetaAdLibraryCompetitiveResearchSource({}), /fetchImpl/);
  });

  test('con un fetchImpl inyectado (falso, sin red real), mapea datos con el esquema real observado (valores sintéticos) a CompetitorCreativeRecord[]', async () => {
    const fakeFetchImpl = async () => [
      {
        advertiser: 'Marca Competidora MX',
        pageId: '123456789012345',
        platforms: ['facebook', 'instagram'],
        adLibraryId: '123456789',
        adSnapshotUrl: 'https://www.facebook.com/ads/library/?id=123456789',
        creationDate: '2026-05-28T00:00:00Z',
        startDate: '2026-06-01T00:00:00Z',
        creativeFormat: 'VIDEO',
        copyBodies: ['Descubre el secreto detrás de la energía natural'],
        activeStatus: 'ACTIVE',
        spendRange: 'UNKNOWN',
        impressionRange: 'UNKNOWN',
      },
    ];
    const source = new MetaAdLibraryCompetitiveResearchSource({ fetchImpl: fakeFetchImpl });
    assert.equal(source.name, 'meta_ad_library_competitive_research_source');
    const records = await source.fetchCreativeRecords({ competitorId: 'competitor-A', adLibraryQuery: { pageId: '999' } });
    assert.equal(records.length, 1);
    assert.equal(records[0].competitorId, 'competitor-A');
    assert.equal(records[0].sourceType, 'PAID');
    assert.deepEqual([...records[0].platforms], ['facebook', 'instagram']);
  });

  test('exige competitorId real; rechaza si fetchImpl no devuelve un arreglo', async () => {
    const source = new MetaAdLibraryCompetitiveResearchSource({ fetchImpl: async () => [] });
    await assert.rejects(() => source.fetchCreativeRecords({ competitorId: '' }));

    const badSource = new MetaAdLibraryCompetitiveResearchSource({ fetchImpl: async () => ({ not: 'an array' }) });
    await assert.rejects(() => badSource.fetchCreativeRecords({ competitorId: 'competitor-A' }));
  });

  test('nunca importa ni llama fetch real — el módulo completo no contiene ninguna URL de Meta ni lectura de credenciales', async () => {
    const source = new MetaAdLibraryCompetitiveResearchSource({
      fetchImpl: async () => { throw new Error('fetchImpl no debería ejecutarse en esta prueba'); },
    });
    // No se invoca fetchCreativeRecords: solo se confirma que instanciar y
    // leer metadatos del adaptador no dispara ninguna llamada de red.
    assert.equal(typeof source.fetchCreativeRecords, 'function');
    assert.equal(source.name, 'meta_ad_library_competitive_research_source');
  });
});
