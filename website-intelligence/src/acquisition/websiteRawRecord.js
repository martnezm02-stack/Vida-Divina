// websiteRawRecord.js — Contrato normalizado de la capa de adquisición de
// Website Intelligence (Fase 8). Equivalente a contract.js en
// marketing-intelligence, pero para sitios web: la identidad primaria es la
// URL (una página puede cambiar con el tiempo), no un post inmutable.
//
// "Leer una página" (este archivo) es distinto de "observar una página"
// (websitePatternObservation.js, Fase 7). Un WebsiteRawRecord es el HECHO
// crudo de qué se recibió al pedir una URL en un momento dado — nunca
// contiene una interpretación, un patrón ni una evidencia estructurada. Toda
// WebsitePatternObservation debe poder señalar un raw_id real de este
// contrato (ver Fase 7, campo `raw_id`, "no implementado todavía" — deja de
// serlo a partir de esta fase).

import { createHash, randomUUID } from 'node:crypto';
import { VIEWPORTS } from '../taxonomy.js';

export const ACQUISITION_METHODS = Object.freeze([
  'http_direct', // fetch() directo al servidor: solo HTML servido, sin ejecutar JS. Backend por defecto (Fase 8).
  'browser_render', // navegador real (ej. claude-in-chrome, Playwright): ve el DOM post-JS, puede interactuar. No disponible en este entorno hoy — ver informe §1-3.
  'specialized_tool', // una herramienta de terceros (ej. Agent Reach) usada como motor, normalizada a este mismo contrato.
]);

export const FETCH_STATUS = Object.freeze([
  'ok',
  'partial', // se obtuvo contenido pero incompleto (ej. timeout parcial, render interrumpido)
  'blocked', // anti-bot / WAF / CAPTCHA detectado — nunca se intenta evadir (ver §11 de la arquitectura general)
  'error', // error de red/HTTP no clasificable en las anteriores
  'authentication_required', // la página exige login/sesión — la adquisición se DETIENE aquí, nunca se simula ni se fuerza
]);

export function hashContent(content) {
  return createHash('sha256').update(content ?? '', 'utf8').digest('hex');
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`WebsiteRawRecord: "url" no es una URL válida: "${url}"`);
  }
}

const SCREENSHOT_FORBIDDEN_KEYS = ['image_data', 'base64', 'binary', 'buffer'];

function assertScreenshotIsMetadataOnly(screenshotReference) {
  for (const key of SCREENSHOT_FORBIDDEN_KEYS) {
    if (key in screenshotReference) {
      throw new Error(
        `WebsiteRawRecord: screenshot_reference no puede contener "${key}" — el RawStore guarda únicamente ` +
        'METADATOS de la captura (referencia/hash), nunca los bytes de la imagen embebidos en el registro JSONL. ' +
        'Ver §9 del informe (REFERENCE ANALYSIS, no almacenamiento binario dentro del store de texto).'
      );
    }
  }
}

/**
 * Construye un WebsiteRawRecord. Lanza si faltan campos obligatorios, si los
 * enums no son válidos, o si la combinación fetch_status/contenido es
 * inconsistente (ej. "ok" sin contenido, o "authentication_required" con
 * contenido — nunca se persiste contenido detrás de un login).
 */
export function createWebsiteRawRecord(fields) {
  const {
    url,
    canonical_url = null,
    page_title = null,
    acquisition_method,
    fetch_status,
    html = null,
    text = null,
    viewport = null,
    page_state = 'default',
    metadata = {},
    screenshot_reference = null,
    interaction_context = null,
    authentication_required = false,
    content_flags = [],
    version_of = null,
    raw_reference = null,
  } = fields;

  if (!url) throw new Error('WebsiteRawRecord: "url" es obligatorio');
  if (!/^https?:\/\//i.test(url)) throw new Error(`WebsiteRawRecord: "url" debe ser http(s): "${url}"`);
  const site = hostnameOf(url);

  if (!ACQUISITION_METHODS.includes(acquisition_method)) {
    throw new Error(`WebsiteRawRecord: acquisition_method inválido "${acquisition_method}"`);
  }
  if (!FETCH_STATUS.includes(fetch_status)) {
    throw new Error(`WebsiteRawRecord: fetch_status inválido "${fetch_status}"`);
  }
  if (viewport !== null && !VIEWPORTS.includes(viewport)) {
    throw new Error(`WebsiteRawRecord: viewport inválido "${viewport}"`);
  }

  const hasContent = Boolean((html && html.length > 0) || (text && text.length > 0));

  if (fetch_status === 'ok' && !hasContent) {
    throw new Error('WebsiteRawRecord: fetch_status "ok" requiere contenido en "html" o "text" — nunca se declara éxito sin contenido.');
  }
  if (fetch_status === 'authentication_required') {
    if (hasContent) {
      throw new Error(
        'WebsiteRawRecord: fetch_status "authentication_required" NUNCA puede llevar contenido — ' +
        'si el servidor devolvió una página de login, esa página en sí no se persiste como si fuera la página real.'
      );
    }
    if (!authentication_required) {
      throw new Error('WebsiteRawRecord: fetch_status "authentication_required" requiere authentication_required=true (consistencia obligatoria).');
    }
  } else if (authentication_required) {
    throw new Error('WebsiteRawRecord: authentication_required=true solo es válido junto con fetch_status "authentication_required".');
  }

  if (screenshot_reference !== null) {
    if (typeof screenshot_reference !== 'object') {
      throw new Error('WebsiteRawRecord: screenshot_reference debe ser un objeto de metadatos.');
    }
    const { screenshot_id, viewport: shotViewport, content_hash: shotHash } = screenshot_reference;
    if (!screenshot_id) throw new Error('WebsiteRawRecord: screenshot_reference.screenshot_id es obligatorio.');
    if (!VIEWPORTS.includes(shotViewport)) throw new Error(`WebsiteRawRecord: screenshot_reference.viewport inválido "${shotViewport}"`);
    if (!shotHash) throw new Error('WebsiteRawRecord: screenshot_reference.content_hash es obligatorio (identifica la captura sin guardar bytes).');
    assertScreenshotIsMetadataOnly(screenshot_reference);
  }

  if (interaction_context !== null) {
    if (!interaction_context.trigger) {
      throw new Error('WebsiteRawRecord: interaction_context.trigger es obligatorio (¿qué acción produjo este estado?).');
    }
  }

  const content = html ?? text ?? '';

  const record = {
    raw_id: randomUUID(),
    url,
    canonical_url,
    site,
    page_title,
    retrieved_at: new Date().toISOString(),
    acquisition_method,
    fetch_status,
    viewport,
    page_state,
    html,
    text,
    content_hash: hashContent(content),
    metadata,
    screenshot_reference,
    interaction_context,
    authentication_required,
    content_flags,
    version_of,
    raw_reference,
  };

  return Object.freeze(record);
}

/**
 * Normaliza el payload crudo devuelto por un AcquisitionBackend.fetch() a un
 * WebsiteRawRecord. Este es el único lugar donde el shape de un backend
 * concreto ({ ok, blocked, authRequired, httpStatus, html, text, headers })
 * se traduce al contrato — igual que webAdapter.js hace con createRecord() en
 * marketing-intelligence. Ningún backend debe llamar a createWebsiteRawRecord
 * directamente con su propio shape.
 */
export function createWebsiteRawRecordFromBackendResult(backendResult, { url, acquisitionMethod, viewport = null, contentFlags = [] }) {
  const { ok, blocked, authRequired, httpStatus, html = null, text = null, title = null } = backendResult;

  let fetch_status;
  if (authRequired) fetch_status = 'authentication_required';
  else if (blocked) fetch_status = 'blocked';
  else if (ok) fetch_status = 'ok';
  else fetch_status = 'error';

  return createWebsiteRawRecord({
    url,
    page_title: title,
    acquisition_method: acquisitionMethod,
    fetch_status,
    html: fetch_status === 'ok' ? html : null,
    text: fetch_status === 'ok' ? text : null,
    viewport,
    metadata: { http_status: httpStatus ?? null },
    authentication_required: fetch_status === 'authentication_required',
    content_flags: contentFlags,
  });
}
