// contract.js — Contrato normalizado de datos de la Internet Access Layer.
//
// Todo adapter debe producir únicamente objetos con esta forma. Un adapter
// adquiere, normaliza y valida — nunca interpreta el contenido como estrategia
// de marketing (eso es responsabilidad exclusiva del pipeline en src/pipeline/).
//
// Mapeo con los términos usados en el documento de arquitectura:
//   - "public_web" (doc) → "public_web_direct" (aquí): fuente pública consultada
//     directamente (RSS, HTML crudo), sin intermediario.
//   - "agent_reach_adapter" (doc) → "specialized_tool" (aquí): mismo backend
//     público que usaría Agent Reach (ej. Jina Reader), llamado directamente sin
//     instalar Agent Reach — intercambiable por Agent Reach real más adelante
//     sin cambiar el contrato.

import { createHash, randomUUID } from 'node:crypto';

export const ACCESS_METHODS = Object.freeze([
  'official_api',
  'public_web_direct',
  'specialized_tool',
  'research_account_session',
]);

export const FETCH_STATUS = Object.freeze(['ok', 'partial', 'blocked_by_platform', 'error']);

export function hashContent(content) {
  return createHash('sha256').update(content ?? '', 'utf8').digest('hex');
}

/**
 * Construye un registro normalizado. Lanza si faltan campos obligatorios o si
 * access_method/fetch_status no son valores reconocidos — un adapter mal
 * implementado debe fallar aquí, no producir datos silenciosamente inválidos.
 */
export function createRecord(fields) {
  const {
    source,
    intelligence_domain = 'advertising_content',
    platform_object_type,
    url,
    published_at = null,
    author = null,
    title = null,
    content = '',
    media = [],
    metrics = {},
    metadata = {},
    access_method,
    source_reliability = 'medium',
    fetch_status = 'ok',
    content_flags = [],
    raw_reference = null,
  } = fields;

  if (!source) throw new Error('createRecord: "source" es obligatorio');
  if (!platform_object_type) throw new Error('createRecord: "platform_object_type" es obligatorio');
  if (!url) throw new Error('createRecord: "url" es obligatorio');
  if (!ACCESS_METHODS.includes(access_method)) {
    throw new Error(`createRecord: access_method inválido: "${access_method}"`);
  }
  if (!FETCH_STATUS.includes(fetch_status)) {
    throw new Error(`createRecord: fetch_status inválido: "${fetch_status}"`);
  }

  return Object.freeze({
    record_id: randomUUID(),
    source,
    intelligence_domain,
    platform_object_type,
    url,
    retrieved_at: new Date().toISOString(),
    published_at,
    author,
    title,
    content,
    media,
    metrics,
    metadata,
    access_method,
    source_reliability,
    fetch_status,
    content_hash: hashContent(content),
    content_flags,
    raw_reference,
  });
}
