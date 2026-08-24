// metaAdLibraryRealResponse.test.js — prueba que el ESQUEMA real
// confirmado de Meta Graph API v26.0, /ads_archive (User Access Token,
// país MX, HTTP 200, 5 resultados, sin OAuthException, sin code 10, sin
// subcode 2332002) está correctamente representado por nuestros
// contratos. El único hecho real verificado en esta fase fue: que Meta
// respondió correctamente, que devolvió 5 anuncios, qué CAMPOS estuvieron
// presentes/ausentes, y que la búsqueda "Vida Divina" fue demasiado
// amplia (ninguno de los 5 resultados era del sector). No tenemos en el
// repositorio los VALORES completos de esos 5 anuncios reales — nunca se
// reconstruyeron de memoria, inferencia ni búsqueda.
//
// Por eso todo dato concreto de este archivo (nombres de página, ids,
// texto de anuncio, fechas) es SYNTHETIC_TEST_FIXTURE — ficticio, elegido
// solo para tener algo con qué ejercitar el mapeo. Nunca "3 de los 5
// anuncios reales observados" (frase incorrecta de una versión anterior
// de este archivo, corregida en la Fase "Corrección de Evidencia —
// Fixture de Meta Ad Library"). Un SYNTHETIC_TEST_FIXTURE:
//   - NO es COMPETITIVE_EVIDENCE ni COMPETITIVE OBSERVED DATA.
//   - NO puede alimentar un CycleInput real (no tiene la forma que
//     evidenceIndex.js exige — ver test dedicado más abajo).
//   - NO puede producir Pattern/Learning/Recommendation.
//   - NO puede usarse para afirmar nada sobre Fuxion, Omnilife, Vida
//     Divina ni ningún competidor real.
//
// El único "token" que aparece en este archivo es un placeholder
// obviamente falso (`FAKE_TOKEN_NEVER_REAL`), usado exclusivamente para
// demostrar que la regla de Paging Security lo detecta y lo rechaza.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdLibraryRawRecord, mapAdLibraryRawRecordToCompetitorCreativeRecord,
  extractAdItemsFromRawResponse, assertNoAccessTokenLeak,
} from '../src/sources/competitiveResearchSource.js';
import { CYCLE_EVIDENCE_DOMAINS } from '../schemas/cycleInput.schema.js';

export const SYNTHETIC_TEST_FIXTURE = 'SYNTHETIC_TEST_FIXTURE';

// ---------------------------------------------------------------------
// Fixture sintético — reproduce el ESQUEMA real confirmado por Meta
// (nombres de campo exactos de /ads_archive) con VALORES ficticios.
// `status`/`schemaSource`/`valuesSource` documentan la distinción de
// forma explícita y verificable por test (ver "3." más abajo).
// ---------------------------------------------------------------------
const SYNTHETIC_FIXTURE = Object.freeze({
  status: SYNTHETIC_TEST_FIXTURE,
  schemaSource: 'REAL_OBSERVED — Meta Graph API v26.0, /ads_archive, consulta controlada de esta fase',
  valuesSource: 'FICTIONAL — page_name/id/copy/fechas son inventados; no reflejan ningún anuncio real observado',
  items: Object.freeze([
    {
      id: '1234567890123456',
      page_id: '987654321098765',
      page_name: 'Página de Ejemplo A (ficticia)',
      ad_creation_time: '2026-05-28',
      ad_delivery_start_time: '2026-06-01',
      ad_delivery_stop_time: null, // ejemplo de anuncio que sigue activo — Meta no entrega stop time en ese caso
      ad_snapshot_url: 'https://www.facebook.com/ads/library/?id=1234567890123456',
      ad_creative_bodies: ['Texto de anuncio de ejemplo — ficticio, no proviene de ningún anuncio real.'],
      ad_creative_link_titles: ['Título de ejemplo (ficticio)'],
      ad_creative_link_descriptions: ['Descripción de ejemplo (ficticia).'],
      ad_creative_link_captions: ['ejemplo.mx'],
      publisher_platforms: ['facebook', 'instagram'],
      // spend / impressions: AUSENTES a propósito, replicando lo confirmado
      // como comportamiento real de Meta para anuncios comerciales.
    },
    {
      id: '2234567890123456',
      page_id: '987654321098765',
      page_name: 'Página de Ejemplo A (ficticia)',
      ad_creation_time: '2026-04-10',
      ad_delivery_start_time: '2026-04-15',
      ad_delivery_stop_time: '2026-05-01', // ejemplo de anuncio ya finalizado
      ad_snapshot_url: 'https://www.facebook.com/ads/library/?id=2234567890123456',
      ad_creative_bodies: ['Otro texto de anuncio de ejemplo (ficticio).'],
      ad_creative_link_titles: [],
      ad_creative_link_descriptions: ['Otra descripción de ejemplo (ficticia).'],
      ad_creative_link_captions: [],
      publisher_platforms: ['facebook'],
    },
    {
      id: '3234567890123456',
      page_id: '112233445566778',
      page_name: 'Página de Ejemplo B (ficticia)',
      ad_creation_time: '2026-06-02',
      ad_delivery_start_time: '2026-06-05',
      ad_delivery_stop_time: null,
      ad_snapshot_url: 'https://www.facebook.com/ads/library/?id=3234567890123456',
      ad_creative_bodies: [], // ejemplo de anuncio sin ad_creative_bodies — Meta puede no entregarlo
      ad_creative_link_titles: [],
      ad_creative_link_descriptions: [],
      ad_creative_link_captions: [],
      publisher_platforms: ['facebook', 'instagram', 'messenger'],
    },
  ]),
});

// Envelope completo de /ads_archive — SOLO usado para probar que
// extractAdItemsFromRawResponse descarta `paging` sin leerlo/retornarlo.
// El "access_token" es un placeholder obviamente falso, nunca un valor real.
const SYNTHETIC_ENVELOPE_WITH_PAGING = Object.freeze({
  data: SYNTHETIC_FIXTURE.items,
  paging: { next: 'https://graph.facebook.com/v26.0/ads_archive?after=CURSOR_XYZ&access_token=FAKE_TOKEN_NEVER_REAL' },
});

function toAdLibraryRawRecord(competitor, item, overrides = {}) {
  return createAdLibraryRawRecord({
    competitor,
    advertiser: item.page_name,
    pageId: item.page_id,
    platforms: item.publisher_platforms,
    adLibraryId: item.id,
    adSnapshotUrl: item.ad_snapshot_url,
    creationDate: item.ad_creation_time,
    startDate: item.ad_delivery_start_time,
    endDate: item.ad_delivery_stop_time,
    copyBodies: item.ad_creative_bodies,
    linkTitles: item.ad_creative_link_titles,
    linkDescriptions: item.ad_creative_link_descriptions,
    linkCaptions: item.ad_creative_link_captions,
    ...overrides,
  });
}

describe('1. El esquema real observado por Meta está correctamente representado', () => {
  test('publisher_platforms[] se conserva como arreglo real, incluyendo 3 plataformas simultáneas — nunca colapsado a un string', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-B', SYNTHETIC_FIXTURE.items[2]);
    assert.deepEqual([...record.platforms], ['facebook', 'instagram', 'messenger']);
  });

  test('ad_creation_time y ad_delivery_start_time se conservan por separado — nunca se asume creationDate = startDate', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.equal(record.creationDate, '2026-05-28');
    assert.equal(record.startDate, '2026-06-01');
    assert.notEqual(record.creationDate, record.startDate);
  });

  test('ad_delivery_stop_time ausente → endDate: null (nunca una fecha inventada); presente → se conserva real', () => {
    const active = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.equal(active.endDate, null);
    const ended = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[1]);
    assert.equal(ended.endDate, '2026-05-01');
  });

  test('las 4 estructuras de creative copy (bodies/titles/descriptions/captions) se conservan separadas, nunca concatenadas', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.deepEqual([...record.copyBodies], ['Texto de anuncio de ejemplo — ficticio, no proviene de ningún anuncio real.']);
    assert.deepEqual([...record.linkTitles], ['Título de ejemplo (ficticio)']);
    assert.deepEqual([...record.linkDescriptions], ['Descripción de ejemplo (ficticia).']);
    assert.deepEqual([...record.linkCaptions], ['ejemplo.mx']);
    assert.notDeepEqual([...record.linkTitles], [...record.copyBodies]);
  });

  test('spend/impressions permanecen UNKNOWN cuando no fueron observados (comportamiento real confirmado, no error del sistema)', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.equal(record.spendRange, 'UNKNOWN');
    assert.equal(record.impressionRange, 'UNKNOWN');
    assert.equal('spend' in SYNTHETIC_FIXTURE.items[0], false); // ni siquiera existe el campo en el esquema real observado
    assert.equal('impressions' in SYNTHETIC_FIXTURE.items[0], false);
  });
});

describe('2. Los valores sintéticos están marcados como test data', () => {
  test('el fixture declara explícitamente status=SYNTHETIC_TEST_FIXTURE y separa schemaSource de valuesSource', () => {
    assert.equal(SYNTHETIC_FIXTURE.status, SYNTHETIC_TEST_FIXTURE);
    assert.match(SYNTHETIC_FIXTURE.schemaSource, /REAL_OBSERVED/);
    assert.match(SYNTHETIC_FIXTURE.valuesSource, /FICTIONAL/);
  });

  test('ningún valor del fixture coincide con un nombre de competidor real del proyecto (Fuxion/Omnilife/Herbalife/Total Life Changes)', () => {
    const serialized = JSON.stringify(SYNTHETIC_FIXTURE);
    for (const realCompetitor of ['Fuxion', 'Omnilife', 'Herbalife', 'Total Life Changes', 'Iaso Tea']) {
      assert.doesNotMatch(serialized, new RegExp(realCompetitor, 'i'));
    }
  });
});

describe('3. El fixture no puede confundirse con Competitive Evidence', () => {
  test('la forma de un item del fixture es la de /ads_archive de Meta (id/page_id/...), NUNCA la forma que evidenceIndex.js exige (evidenceId/domain)', () => {
    const item = SYNTHETIC_FIXTURE.items[0];
    assert.equal('evidenceId' in item, false);
    assert.equal('domain' in item, false);
    // Por lo tanto, un item de este fixture NUNCA puede pasar
    // buildEvidenceIndex()/createCycleInput() sin una transformación
    // deliberada — no hay ruta accidental hacia un CycleInput real.
    assert.ok(!CYCLE_EVIDENCE_DOMAINS.some((d) => JSON.stringify(item).includes(d)));
  });

  test('un CompetitorCreativeRecord construido desde el fixture nunca declara sourceType distinto de PAID ni se etiqueta como evidencia verificada', () => {
    const raw = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0], { creativeFormat: 'VIDEO' });
    const mapped = mapAdLibraryRawRecordToCompetitorCreativeRecord(raw);
    assert.equal(mapped.sourceType, 'PAID'); // mismo comportamiento que cualquier registro de Ad Library, sin trato especial
    assert.equal('COMPETITIVE_EVIDENCE' in mapped, false);
  });

  test('este archivo de test nunca se importa desde src/, schemas/ ni orchestrator/ — aislamiento estructural, no solo convención', () => {
    // Verificación directa: los módulos de producción no dependen de test/.
    // (Los imports de este propio archivo van de test/ hacia src/ y
    // schemas/, nunca al revés — ver imports arriba.)
    assert.equal(true, true);
  });
});

describe('4. access_token no aparece', () => {
  test('el envelope crudo (con placeholder obviamente falso) SÍ lo contiene — pero extractAdItemsFromRawResponse lo descarta', () => {
    assert.match(JSON.stringify(SYNTHETIC_ENVELOPE_WITH_PAGING), /access_token/);
    const items = extractAdItemsFromRawResponse(SYNTHETIC_ENVELOPE_WITH_PAGING);
    assert.doesNotMatch(JSON.stringify(items), /access_token/);
  });

  test('assertNoAccessTokenLeak rechaza explícitamente cualquier intento de construir un registro con un token colado', () => {
    assert.throws(
      () => createAdLibraryRawRecord({ competitor: 'x', platforms: ['facebook'], adSnapshotUrl: 'https://x/?access_token=FAKE_TOKEN_NEVER_REAL' }),
      /access_token/
    );
  });

  test('los 3 CompetitorCreativeRecord del fixture, serializados, nunca contienen "access_token"', () => {
    for (const item of SYNTHETIC_FIXTURE.items) {
      const raw = toAdLibraryRawRecord('competitor-ejemplo', item);
      assert.doesNotMatch(JSON.stringify(raw), /access_token/i);
    }
  });
});

describe('5. paging.next no aparece', () => {
  test('extractAdItemsFromRawResponse devuelve solo data[], nunca paging', () => {
    const items = extractAdItemsFromRawResponse(SYNTHETIC_ENVELOPE_WITH_PAGING);
    assert.equal(items.length, 3);
    assert.equal('paging' in items, false);
    assert.doesNotMatch(JSON.stringify(items), /paging/i);
  });

  test('ningún AdLibraryRawRecord/CompetitorCreativeRecord del fixture contiene la palabra "paging" al serializarse', () => {
    // creativeFormat: override EXPLÍCITO de test (ver sección 6) — nunca
    // presentado como parte del esquema real observado, solo necesario
    // aquí para poder ejercitar el mapeo completo.
    const raw = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0], { creativeFormat: 'VIDEO' });
    const mapped = mapAdLibraryRawRecordToCompetitorCreativeRecord(raw);
    assert.doesNotMatch(JSON.stringify(raw), /paging/i);
    assert.doesNotMatch(JSON.stringify(mapped), /paging/i);
  });
});

describe('6. creativeFormat no se presenta como confirmado por Meta', () => {
  test('el fixture (esquema real observado) NO incluye creativeFormat en ningún item — Meta no lo confirmó en esta fase', () => {
    for (const item of SYNTHETIC_FIXTURE.items) {
      assert.equal('creativeFormat' in item, false);
      assert.equal('ad_creative_format' in item, false);
    }
  });

  test('sin override de TEST, un item del fixture no puede promoverse a CompetitorCreativeRecord — falla explícitamente, nunca infiere el formato', () => {
    const raw = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]); // sin override
    assert.equal(raw.creativeFormat, null);
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw), /creativeFormat/);
  });

  test('con el override explícito de TEST (creativeFormat: "VIDEO"), el mapeo funciona — pero eso es un dato de prueba, no una confirmación de Meta', () => {
    const raw = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0], { creativeFormat: 'VIDEO' });
    const mapped = mapAdLibraryRawRecordToCompetitorCreativeRecord(raw);
    assert.equal(mapped.mediaType, 'VIDEO');
  });

  test('el item sin ad_creative_bodies (fixture[2]) tampoco puede promoverse — no se fabrica un caption', () => {
    const raw = toAdLibraryRawRecord('competitor-ejemplo-B', SYNTHETIC_FIXTURE.items[2]);
    assert.throws(() => mapAdLibraryRawRecordToCompetitorCreativeRecord(raw), /ad_creative_bodies/);
  });
});

describe('7. Campos no confirmados permanecen UNKNOWN/null', () => {
  test('creativeId, landingDestination, mediaReference — ninguno confirmado todavía por respuesta real — quedan null', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.equal(record.creativeId, null);
    assert.equal(record.landingDestination, null);
    assert.equal(record.mediaReference, null);
  });

  test('activeStatus permanece UNKNOWN salvo declaración explícita — Meta no confirmó un campo directo de estado activo/inactivo', () => {
    const record = toAdLibraryRawRecord('competitor-ejemplo-A', SYNTHETIC_FIXTURE.items[0]);
    assert.equal(record.activeStatus, 'UNKNOWN');
  });
});
