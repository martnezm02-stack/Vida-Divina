// competitiveResearchSource.js — contrato para una futura fuente de
// evidencia competitiva (Meta Ad Library, cuando se autorice). Mismo
// patrón arquitectónico ya establecido en el proyecto (PerformanceSource
// en performance-learning-intelligence, PublicationAdapter en
// content-strategy): interfaz abstracta + motor intercambiable.
//
// NO CONECTA CON META. No genera credenciales, no crea tokens, no importa
// `fetch` hacia ninguna API. El único motor concreto de esta fase es
// NullCompetitiveResearchSource, que siempre devuelve que no hay datos
// disponibles — nunca inventa un registro.
//
// Cuando se autorice conectar Meta Ad Library, el motor real implementará
// esta misma interfaz (ej. AdLibraryCompetitiveResearchSource) sin que
// creativeCell.js, competitiveAbstraction.js ni ningún otro archivo de
// esta capa necesiten cambiar — mismo criterio de aislamiento ya usado en
// el resto del proyecto.

import { createCompetitorCreativeRecord } from '../competitiveAbstraction.js';

export class CompetitiveResearchSource {
  get name() {
    throw new Error('CompetitiveResearchSource: la propiedad "name" debe implementarse en la subclase');
  }

  /**
   * @param {{ competitorId: string, accountId?: string }} query
   * @returns {Promise<import('../competitiveAbstraction.js').CompetitorCreativeRecord[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchCreativeRecords(query) {
    throw new Error('CompetitiveResearchSource.fetchCreativeRecords() debe implementarse en la subclase');
  }
}

/**
 * Forma de registro que un motor real (Meta Ad Library API) debería poder
 * entregar — todos los campos aceptan null cuando Meta no los provee.
 * Documentado aquí como contrato, no como implementación.
 * @typedef {{
 *   competitor: string,
 *   adId: string | null,
 *   page: string | null,
 *   platforms: string[],
 *   creativeType: string | null,
 *   copy: string | null,
 *   startDate: string | null,
 *   endDate: string | null,
 *   observedLongevity: string | null,
 *   spendRange: string | null,
 *   impressionRange: string | null,
 *   abstraction: object | null,
 *   evidenceStrength: string | null,
 *   source: string,
 * }} CompetitiveResearchRawRecord
 */

/** Único motor real de esta fase: nunca hay conexión a Meta, siempre responde que no hay datos — nunca inventa un registro. */
export class NullCompetitiveResearchSource extends CompetitiveResearchSource {
  get name() {
    return 'null_competitive_research_source';
  }

  async fetchCreativeRecords() {
    return [];
  }
}

// ---------------------------------------------------------------------
// Meta Ad Library — PREPARADO, NO CONECTADO. Fase: "Preparar Competitive
// Intelligence para activación". Ningún código de este archivo llama a
// `fetch` hacia una URL real, ninguno construye un endpoint por defecto,
// ninguno lee ni genera credenciales. Cuando la autorización de Meta Ad
// Library quede lista, lo único que falta es inyectar un `fetchImpl` real
// (mismo patrón de inyección de dependencias ya usado en
// InstagramOwnPerformanceSource) — ningún otro archivo de esta capa
// necesita cambiar.
// ---------------------------------------------------------------------

export const AD_ACTIVE_STATUS_VALUES = Object.freeze(['ACTIVE', 'INACTIVE', 'UNKNOWN']);

// ---------------------------------------------------------------------
// Paging Security — CRÍTICO. Fase "Adaptar Competitive Intelligence a
// Response Real de Meta": la respuesta real de /ads_archive incluye
// `paging.next`, una URL que puede contener el access_token en texto
// plano. Ningún contrato de este archivo tiene (ni tendrá) un campo para
// guardar paging.next completo — ausencia estructural, mismo criterio que
// "síntesis ciega" en competitiveAbstraction.js (no se puede filtrar lo
// que no existe dónde poner). Este guard es la segunda capa: si algún día
// código futuro intenta pasar un valor que contenga "access_token" hacia
// cualquier constructor de este archivo, se rechaza explícitamente en vez
// de persistirlo/registrarlo/serializarlo por accidente.
// ---------------------------------------------------------------------

const ACCESS_TOKEN_PATTERN = /access_token/i;

/**
 * Extrae SOLO `data[]` de una respuesta cruda de /ads_archive —
 * `paging` (que puede contener `next` con el access_token en texto plano)
 * nunca se lee más allá de esta línea, nunca se retorna, nunca se
 * persiste. Preparado para cuando exista un `fetchImpl` real; hoy no se
 * llama desde ningún código de conexión (ninguno existe todavía).
 */
export function extractAdItemsFromRawResponse(response) {
  if (!response || !Array.isArray(response.data)) {
    throw new Error('extractAdItemsFromRawResponse: se requiere una respuesta real con "data" como arreglo (forma de /ads_archive).');
  }
  return Object.freeze([...response.data]);
  // Nota deliberada: `response.paging` (incluido `paging.next`, que puede
  // contener access_token) nunca se lee ni se referencia arriba — ausencia
  // de acceso, no solo de retorno.
}

export function assertNoAccessTokenLeak(value, context = 'valor') {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (serialized && ACCESS_TOKEN_PATTERN.test(serialized)) {
    throw new Error(
      `assertNoAccessTokenLeak: "${context}" contiene el patrón "access_token" — nunca se persiste, registra ni serializa un access_token real, ni siquiera como parte de una URL de paginación (paging.next). Ver regla de Paging Security de esta fase.`
    );
  }
  return true;
}

/**
 * Construye la URL pública y determinística que Meta usa para mostrar
 * cualquier anuncio de Ad Library por id (`facebook.com/ads/library/?id=`)
 * — un formateo mecánico de un id real, NO un dato nuevo inventado (mismo
 * criterio que un permalink de Instagram construido desde un media id ya
 * conocido). Útil cuando la investigación original documentó el
 * Ad Library ID pero no copió la URL completa.
 */
export function buildAdLibrarySnapshotUrl(adLibraryId) {
  if (!adLibraryId?.trim()) throw new Error('buildAdLibrarySnapshotUrl: se requiere un "adLibraryId" real.');
  return `https://www.facebook.com/ads/library/?id=${adLibraryId}`;
}

/**
 * Forma real observada de un registro crudo de Meta Ad Library — adaptada
 * a la respuesta REAL confirmada en esta fase (User Access Token, país MX,
 * Graph API v26.0, /ads_archive, HTTP 200, sin errores). Todo campo que
 * Meta no entregue para un anuncio en particular queda null/UNKNOWN/[]
 * — nunca se inventa.
 *
 * CONFIRMADOS por respuesta real: page_id, page_name (→ advertiser),
 * ad_creation_time, ad_delivery_start_time, ad_delivery_stop_time,
 * ad_snapshot_url, ad_creative_bodies[], ad_creative_link_titles[],
 * ad_creative_link_descriptions[], ad_creative_link_captions[],
 * publisher_platforms[].
 *
 * NO CONFIRMADOS todavía (quedan null hasta que una respuesta real los
 * entregue — nunca inferidos): creativeId, creativeFormat, landingDestination,
 * mediaReference.
 *
 * AUSENTES en los anuncios comerciales observados (comportamiento real de
 * Meta, no error de este sistema): spend, impressions — spendRange/
 * impressionRange quedan 'UNKNOWN'.
 */
export function createAdLibraryRawRecord({
  competitor,
  advertiser = null, // ~ page_name
  pageId = null, // ~ page_id — id real de la página del anunciante, distinto del nombre mostrado
  platforms, // ~ publisher_platforms[] — REQUERIDO, arreglo real, nunca un string singular
  adLibraryId = null, // ~ id
  creativeId = null, // NO CONFIRMADO
  adSnapshotUrl = null, // ~ ad_snapshot_url
  creationDate = null, // ~ ad_creation_time — NUEVO, siempre distinto de startDate
  startDate = null, // ~ ad_delivery_start_time (ya existía, reutilizado)
  endDate = null, // ~ ad_delivery_stop_time — null si el anuncio sigue activo o Meta no lo entregó; NUNCA inferido
  activeStatus = 'UNKNOWN',
  spendRange = 'UNKNOWN',
  impressionRange = 'UNKNOWN',
  creativeFormat = null, // NO CONFIRMADO
  copyBodies = [], // ~ ad_creative_bodies[]
  linkTitles = [], // ~ ad_creative_link_titles[]
  linkDescriptions = [], // ~ ad_creative_link_descriptions[]
  linkCaptions = [], // ~ ad_creative_link_captions[]
  landingDestination = null, // NO CONFIRMADO
  mediaReference = null, // NO CONFIRMADO
}) {
  if (!competitor?.trim()) throw new Error('AdLibraryRawRecord: "competitor" es obligatorio (referencia interna al competidor, ver competitorId).');
  if (!Array.isArray(platforms) || platforms.length === 0 || platforms.some((p) => typeof p !== 'string' || !p.trim())) {
    throw new Error('AdLibraryRawRecord: "platforms" es obligatorio y debe ser un arreglo no vacío de strings (publisher_platforms real de Meta) — nunca un string singular.');
  }
  if (!AD_ACTIVE_STATUS_VALUES.includes(activeStatus)) {
    throw new Error(`AdLibraryRawRecord: "activeStatus" inválido "${activeStatus}" (válidos: ${AD_ACTIVE_STATUS_VALUES.join(', ')}).`);
  }
  for (const [field, value] of [['copyBodies', copyBodies], ['linkTitles', linkTitles], ['linkDescriptions', linkDescriptions], ['linkCaptions', linkCaptions]]) {
    if (!Array.isArray(value)) throw new Error(`AdLibraryRawRecord: "${field}" debe ser un arreglo (puede estar vacío) — refleja la estructura real de Meta, nunca un string concatenado.`);
  }

  const record = Object.freeze({
    competitor, advertiser, pageId, platforms: Object.freeze([...platforms]), adLibraryId, creativeId, adSnapshotUrl,
    creationDate, startDate, endDate, activeStatus, spendRange, impressionRange, creativeFormat,
    copyBodies: Object.freeze([...copyBodies]), linkTitles: Object.freeze([...linkTitles]),
    linkDescriptions: Object.freeze([...linkDescriptions]), linkCaptions: Object.freeze([...linkCaptions]),
    landingDestination, mediaReference, capturedAt: new Date().toISOString(),
  });
  assertNoAccessTokenLeak(record, 'AdLibraryRawRecord');
  return record;
}

/**
 * Mapea un AdLibraryRawRecord real a la forma ya existente de
 * CompetitorCreativeRecord (competitiveAbstraction.js) — nunca fabrica un
 * campo ausente; si Meta no entregó lo mínimo indispensable para que exista
 * evidencia cruda real (advertiser, permalink, copy, formato), esta función
 * lanza explícitamente en vez de construir un registro a medias.
 */
export function mapAdLibraryRawRecordToCompetitorCreativeRecord(raw) {
  assertNoAccessTokenLeak(raw, 'AdLibraryRawRecord (mapeo)');
  if (!raw?.advertiser?.trim()) {
    throw new Error('mapAdLibraryRawRecordToCompetitorCreativeRecord: no se puede abstraer sin "advertiser" real (Meta expone el nombre de página del anunciante) — nunca se sustituye por el id interno del competidor.');
  }
  if (!raw?.adSnapshotUrl?.trim()) {
    throw new Error('mapAdLibraryRawRecordToCompetitorCreativeRecord: no se puede abstraer sin "adSnapshotUrl" real — sin un permalink verificable no hay evidencia cruda que registrar.');
  }
  if (!Array.isArray(raw?.copyBodies) || raw.copyBodies.length === 0 || !raw.copyBodies[0]?.trim()) {
    throw new Error('mapAdLibraryRawRecordToCompetitorCreativeRecord: Meta no proveyó "ad_creative_bodies" para este anuncio — no se fabrica un caption; este registro no puede convertirse en evidencia todavía (pero puede seguir contando para spend/impression range agregados si se necesita en el futuro).');
  }
  if (!raw?.creativeFormat?.trim()) {
    throw new Error('mapAdLibraryRawRecordToCompetitorCreativeRecord: se requiere "creativeFormat" real para mapear a mediaType — campo NO CONFIRMADO todavía por ninguna respuesta real de Meta (ver createAdLibraryRawRecord); este registro queda como evidencia cruda (AdLibraryRawRecord) hasta que una respuesta real lo confirme, nunca se infiere.');
  }
  return createCompetitorCreativeRecord({
    competitorId: raw.competitor,
    accountId: raw.advertiser,
    pageId: raw.pageId,
    platforms: raw.platforms,
    contentId: raw.creativeId,
    adId: raw.adLibraryId,
    permalink: raw.adSnapshotUrl,
    dateCreated: raw.creationDate,
    datePublished: raw.startDate,
    dateEnded: raw.endDate,
    mediaType: raw.creativeFormat,
    caption: raw.copyBodies[0], // texto primario de conveniencia — derivado, nunca fabricado; la estructura completa se conserva abajo
    adCreativeBodies: raw.copyBodies,
    adCreativeLinkTitles: raw.linkTitles ?? [],
    adCreativeLinkDescriptions: raw.linkDescriptions ?? [],
    adCreativeLinkCaptions: raw.linkCaptions ?? [],
    landingDestination: raw.landingDestination,
    spendRange: raw.spendRange,
    impressionRange: raw.impressionRange,
    activeStatus: raw.activeStatus,
    mediaReference: raw.mediaReference,
    engagementSignals: 'UNKNOWN', // Ad Library no expone señales orgánicas de un anuncio pagado de terceros
    longevity: 'UNKNOWN', // duración real requiere razonar sobre dateCreated/datePublished/dateEnded juntos, no se infiere aquí
    sourceType: 'PAID', // Ad Library solo contiene anuncios pagados, nunca orgánico
  });
}

/**
 * Adaptador PREPARADO para Meta Ad Library. Requiere que quien lo instancie
 * inyecte `overrides.fetchImpl` explícitamente — sin esa inyección lanza en
 * vez de intentar cualquier conexión real por defecto (Meta Ad Library aún
 * no está autorizada en este proyecto).
 */
export class MetaAdLibraryCompetitiveResearchSource extends CompetitiveResearchSource {
  constructor(overrides = {}) {
    super();
    if (typeof overrides.fetchImpl !== 'function') {
      throw new Error('MetaAdLibraryCompetitiveResearchSource: se requiere "overrides.fetchImpl" — este adaptador nunca se conecta a Meta por defecto (Meta Ad Library aún no está autorizada).');
    }
    this._overrides = overrides;
  }

  get name() {
    return 'meta_ad_library_competitive_research_source';
  }

  /**
   * @param {{ competitorId: string, adLibraryQuery?: object }} query -
   *   `adLibraryQuery` puede ser, en el futuro, el resultado de
   *   `createAdLibrarySearchQuery()` (ver más abajo) — hoy simplemente se
   *   reenvía tal cual a `fetchImpl`, sin interpretarlo.
   * @returns {Promise<import('../competitiveAbstraction.js').CompetitorCreativeRecord[]>}
   */
  async fetchCreativeRecords({ competitorId, adLibraryQuery } = {}) {
    if (!competitorId?.trim()) throw new Error('MetaAdLibraryCompetitiveResearchSource.fetchCreativeRecords: se requiere "competitorId" real.');
    const rawItems = await this._overrides.fetchImpl(adLibraryQuery);
    if (!Array.isArray(rawItems)) {
      throw new Error('MetaAdLibraryCompetitiveResearchSource.fetchCreativeRecords: fetchImpl debe devolver un arreglo de registros crudos de Ad Library.');
    }
    const records = [];
    for (const item of rawItems) {
      const raw = createAdLibraryRawRecord({ competitor: competitorId, ...item });
      records.push(mapAdLibraryRawRecordToCompetitorCreativeRecord(raw));
    }
    return records;
  }
}

// ---------------------------------------------------------------------
// search_page_ids — PREPARADO, NO CONECTADO. La investigación real de
// esta fase demostró que `search_terms="Vida Divina"` puede producir
// coincidencias textuales amplias no relacionadas con el competidor
// buscado (falsos positivos por texto libre). Meta Ad Library API expone
// `search_page_ids` como mecanismo alternativo (buscar por page id exacto
// en vez de texto libre) — este export prepara la FORMA de esa consulta
// futura, sin ejecutar ninguna llamada real ni asumir detalles de la
// respuesta que esta fase no confirmó.
// ---------------------------------------------------------------------

export const AD_LIBRARY_SEARCH_MODES = Object.freeze(['SEARCH_TERMS', 'SEARCH_PAGE_IDS']);

/**
 * Construye (sin ejecutar) la forma de una consulta futura a
 * /ads_archive. `status: 'NOT_CONNECTED'` es intencional y permanente
 * hasta que una fase futura autorice la llamada real — esta función nunca
 * llama a `fetch`, nunca lee ni genera credenciales.
 */
export function createAdLibrarySearchQuery({ mode, searchTerms = null, searchPageIds = null, countries }) {
  if (!AD_LIBRARY_SEARCH_MODES.includes(mode)) {
    throw new Error(`createAdLibrarySearchQuery: "mode" inválido "${mode}" (válidos: ${AD_LIBRARY_SEARCH_MODES.join(', ')}).`);
  }
  if (mode === 'SEARCH_TERMS' && !searchTerms?.trim()) {
    throw new Error('createAdLibrarySearchQuery: "searchTerms" es obligatorio cuando mode es SEARCH_TERMS.');
  }
  if (mode === 'SEARCH_PAGE_IDS' && (!Array.isArray(searchPageIds) || searchPageIds.length === 0)) {
    throw new Error('createAdLibrarySearchQuery: "searchPageIds" debe ser un arreglo real no vacío de page ids cuando mode es SEARCH_PAGE_IDS — nunca se inventa un page id.');
  }
  if (!Array.isArray(countries) || countries.length === 0) {
    throw new Error('createAdLibrarySearchQuery: "countries" es obligatorio (ej. ["MX"], mismo país usado en la consulta real de esta fase).');
  }
  const query = Object.freeze({
    mode,
    searchTerms: mode === 'SEARCH_TERMS' ? searchTerms : null,
    searchPageIds: mode === 'SEARCH_PAGE_IDS' ? Object.freeze([...searchPageIds]) : null,
    countries: Object.freeze([...countries]),
    status: 'NOT_CONNECTED',
  });
  assertNoAccessTokenLeak(query, 'AdLibrarySearchQuery');
  return query;
}
