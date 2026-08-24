// publishedContent.js — Contrato PublishedContent (Fase 12, §1).
//
// Representa un contenido PROPIO de Vida Divina ya publicado — nunca el
// contenido en sí (texto/guion/transcripción completos), solo su identidad y
// referencias a lo que ya existe en otros módulos (producto real,
// hook/patrón externo, ContentOpportunity, ContentBrief). "No almacenar
// contenido completo innecesariamente" se aplica como guardia estructural,
// no solo como convención de nombres.

import { randomUUID } from 'node:crypto';

const PLATFORMS = Object.freeze(['instagram', 'tiktok', 'youtube_shorts', 'youtube', 'facebook', 'other']);

// Cualquier campo con uno de estos nombres sugiere que se está intentando
// guardar el contenido completo (texto/guion/transcripción) en vez de solo
// su identidad — se rechaza en tiempo de construcción, igual que
// assertNoAdoptionLeakage en website-intelligence.
const FORBIDDEN_KEYS = ['content_text', 'transcript', 'full_text', 'caption_text', 'script'];

function assertNoFullContentLeakage(obj, path = '') {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      throw new Error(`PublishedContent: el campo "${path}${key}" sugiere almacenar el contenido completo de la publicación — PublishedContent solo registra IDENTIDAD y REFERENCIAS, nunca el texto/guion/transcripción completos.`);
    }
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      assertNoFullContentLeakage(obj[key], `${path}${key}.`);
    }
  }
}

export function createPublishedContent(fields) {
  const {
    platform,
    published_at,
    content_type,
    format,
    topic,
    product_ref = null,
    hook_pattern_ref = null,
    content_opportunity_ref = null,
    content_brief_ref = null,
    url = null,
    external_post_id = null,
    metadata = {},
  } = fields;

  if (!PLATFORMS.includes(platform)) throw new Error(`PublishedContent: platform inválida "${platform}" (válidas: ${PLATFORMS.join(', ')})`);
  if (!published_at) throw new Error('PublishedContent: "published_at" es obligatorio.');
  if (!content_type) throw new Error('PublishedContent: "content_type" es obligatorio.');
  if (!format) throw new Error('PublishedContent: "format" es obligatorio.');
  if (!topic) throw new Error('PublishedContent: "topic" es obligatorio.');
  // product_ref, cuando existe, debe apuntar a la fuente primaria REAL de
  // Vida Divina (ej. "TéDivina", tal como aparece en docs/productos.md) —
  // esta función no puede leer el catálogo por sí misma sin acoplarse a
  // docs/, así que valida solo que sea un string no vacío; es
  // responsabilidad del llamador (el script de orquestación) pasar un
  // nombre real del catálogo, nunca uno inventado.
  if (product_ref !== null && (typeof product_ref !== 'string' || !product_ref.trim())) {
    throw new Error('PublishedContent: "product_ref", si se especifica, debe ser un string no vacío que referencie un producto real del catálogo.');
  }

  const record = {
    content_id: randomUUID(),
    platform,
    published_at,
    content_type,
    format,
    topic,
    product_ref,
    hook_pattern_ref,
    content_opportunity_ref,
    content_brief_ref,
    url,
    external_post_id,
    metadata,
    created_at: new Date().toISOString(),
  };

  // Se valida el INPUT crudo (fields), no el "record" ya filtrado — un
  // "record" construido solo con los campos conocidos nunca contendría
  // content_text/transcript/script aunque el llamador los hubiera pasado,
  // así que revisar "record" no detectaría nada. metadata se comparte por
  // referencia entre fields y record, así que también queda cubierta aquí.
  assertNoFullContentLeakage(fields);
  return Object.freeze(record);
}

export { PLATFORMS };
