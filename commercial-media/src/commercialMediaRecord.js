// commercialMediaRecord.js — Commercial Media Registry: modelo mínimo
// (encargo §12). Registry PROPIO, deliberadamente separado de
// video-production/src/assetRegistry.js (Production Asset Registry --
// fotografía de catálogo, otra responsabilidad, encargo §15/§55).

import { randomUUID } from 'node:crypto';
import { MEDIA_TYPES, BUSINESS_INTENTS, AUDIENCES, CLASSIFICATION_CONFIDENCE_LEVELS, intentForMediaType } from './mediaTypes.js';

function validateEnum(value, allowed, label) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new Error(`createCommercialMediaRecord: "${label}" inválido: "${value}". Válidos: ${allowed.join(', ')}.`);
  }
}

/**
 * Construye un registro validado. Lanza si falta trazabilidad real
 * (sourcePath/contentHash/classificationReason, encargo §42) -- nunca un
 * registro sin poder responder "¿de dónde salió y por qué se clasificó
 * así?".
 */
export function createCommercialMediaRecord(fields) {
  const {
    displayName, filePath, sourcePath = filePath, mimeType, mediaType,
    businessIntent, productId = null, category = null, audience = null,
    needTags = [], language = 'es', durationSeconds = null, fileSizeBytes,
    contentHash, classificationConfidence, classificationReason,
    active = null, mediaId = null, createdAt = null, updatedAt = null,
  } = fields;

  if (!displayName?.trim()) throw new Error('createCommercialMediaRecord: "displayName" es obligatorio -- nunca un UUID como nombre principal (§11).');
  if (!filePath?.trim()) throw new Error('createCommercialMediaRecord: "filePath" es obligatorio.');
  if (!sourcePath?.trim()) throw new Error('createCommercialMediaRecord: "sourcePath" es obligatorio (§42: trazabilidad).');
  if (!mimeType?.trim()) throw new Error('createCommercialMediaRecord: "mimeType" es obligatorio.');
  if (!contentHash?.trim()) throw new Error('createCommercialMediaRecord: "contentHash" es obligatorio (§16: dedupe).');
  if (typeof fileSizeBytes !== 'number' || fileSizeBytes < 0) throw new Error('createCommercialMediaRecord: "fileSizeBytes" debe ser un número real >= 0.');
  if (!classificationReason?.trim()) throw new Error('createCommercialMediaRecord: "classificationReason" es obligatorio (§42: por qué fue clasificado así).');

  validateEnum(mediaType, MEDIA_TYPES, 'mediaType');
  validateEnum(businessIntent, BUSINESS_INTENTS, 'businessIntent');
  validateEnum(audience, AUDIENCES, 'audience');
  validateEnum(classificationConfidence, CLASSIFICATION_CONFIDENCE_LEVELS, 'classificationConfidence');

  // Consistencia mediaType <-> businessIntent (§3, §25, §26): un mediaType
  // real siempre pertenece a un único intent -- nunca se registra una
  // combinación contradictoria (ej. VIDEO_TESTIMONIAL con businessIntent
  // DISTRIBUTION). businessIntent=NEEDS_METADATA es la única excepción real
  // (el mediaType puede ser una mejor-hipótesis o null).
  if (mediaType && businessIntent !== 'NEEDS_METADATA') {
    const owner = intentForMediaType(mediaType);
    if (owner !== businessIntent) {
      throw new Error(`createCommercialMediaRecord: mediaType "${mediaType}" pertenece a businessIntent "${owner}", no a "${businessIntent}".`);
    }
  }

  // §14: incertidumbre => NEEDS_METADATA => nunca active/selectable, sin
  // importar lo que el llamador haya pasado -- invariante de schema, no
  // una convención que se pueda romper por accidente en otro archivo.
  const resolvedActive = businessIntent === 'NEEDS_METADATA' ? false : (active ?? true);

  const now = new Date().toISOString();
  return Object.freeze({
    mediaId: fields.mediaId ?? randomUUID(),
    displayName,
    filePath,
    sourcePath,
    mimeType,
    mediaType: mediaType ?? null,
    businessIntent,
    productId,
    category,
    audience,
    needTags: Object.freeze([...needTags]),
    language,
    durationSeconds,
    fileSizeBytes,
    contentHash,
    classificationConfidence,
    classificationReason,
    active: resolvedActive,
    createdAt: createdAt ?? now,
    updatedAt: updatedAt ?? now,
  });
}
