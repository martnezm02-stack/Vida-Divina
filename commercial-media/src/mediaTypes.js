// mediaTypes.js — Commercial Media: vocabulario cerrado (encargo §2, §3,
// §10, §13). Ningún módulo de este paquete inventa un valor fuera de estas
// listas -- si un archivo no encaja, la clasificación cae a NEEDS_METADATA
// (businessIntent), nunca a un tipo inventado.

export const MEDIA_TYPES_BY_INTENT = Object.freeze({
  CONSUMPTION: Object.freeze(['AUDIO_OFICIAL', 'VIDEO_TESTIMONIAL', 'PRODUCT_EXPLANATION_VIDEO', 'PRODUCT_MEDIA', 'OTHER_CONSUMPTION_MEDIA']),
  DISTRIBUTION: Object.freeze(['BUSINESS_MODEL_VIDEO', 'BUSINESS_MODEL_AUDIO', 'DISTRIBUTION_EXPLANATION', 'OTHER_DISTRIBUTION_MEDIA']),
  GENERAL: Object.freeze(['BRAND_MEDIA', 'OTHER_COMMERCIAL_MEDIA']),
});

export const MEDIA_TYPES = Object.freeze(Object.values(MEDIA_TYPES_BY_INTENT).flat());

// businessIntent (encargo §3): independiente de mediaType a nivel de
// schema, pero cada mediaType real pertenece a exactamente un intent (ver
// MEDIA_TYPES_BY_INTENT) -- NEEDS_METADATA es el único intent sin
// mediaTypes propios, se usa cuando la clasificación no puede resolverse
// con seguridad.
export const BUSINESS_INTENTS = Object.freeze(['CONSUMPTION', 'DISTRIBUTION', 'GENERAL', 'NEEDS_METADATA']);

/** Intent "dueño" de un mediaType real, o null si el mediaType no existe. */
export function intentForMediaType(mediaType) {
  for (const [intent, types] of Object.entries(MEDIA_TYPES_BY_INTENT)) {
    if (types.includes(mediaType)) return intent;
  }
  return null;
}

// encargo §10: "female/male/general o el equivalente existente" -- sin
// inferencia agresiva de género, estos 3 valores son los únicos permitidos.
export const AUDIENCES = Object.freeze(['female', 'male', 'general']);

// encargo §13: separado de marketing confidence (el confidence 0-1 de
// marketingIntelligence/ mide calidad de una señal de mercado; este mide
// qué tan segura fue la clasificación automática de ESTE archivo).
export const CLASSIFICATION_CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
