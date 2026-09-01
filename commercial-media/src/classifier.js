// classifier.js — Commercial Media: motor de clasificación determinista
// (encargo §4, §7, §39, §41). Prioridad de clasificación (§4):
//   1. metadata explícita / manifest
//   2. metadata existente (registro previo con el mismo contentHash -- ver commercialMediaStore.js)
//   3. nomenclatura inequívoca (patrones de nombre + catálogo de producto)
//   4. contexto de archivo/carpeta (no usado en esta fase -- toda la
//      entrada vive en una sola carpeta plana, sin subcarpetas con
//      significado; documentado como extensión futura, §54)
//   5. inferencia segura (mismo motor de nomenclatura, con confidence MEDIUM/LOW)
//   6. NEEDS_METADATA
//
// NUNCA usa un LLM (§39): reglas deterministas + catálogo real + una lista
// pequeña y auditable de patrones de nombre conocidos.

import { BUSINESS_INTENTS, MEDIA_TYPES, AUDIENCES } from './mediaTypes.js';
import { tokenize, matchProductFromFilename } from './productKeywordMatcher.js';

// Patrones de nombre reales (§41) -- orden de prioridad: el primero que
// matchea gana (business_model antes que distribution porque "modelo de
// negocio" es más específico que "negocio" solo; testimonial antes que
// explanation porque un testimonio a veces también dice "explica...").
const NAME_PATTERNS = Object.freeze([
  { kind: 'business_model', re: /modelo\s*(?:de)?\s*negocio|business\s*model/i },
  { kind: 'distribution', re: /distribuci[oó]n/i },
  { kind: 'testimonial', re: /testimoni[oa]l?/i },
  { kind: 'explanation', re: /explicaci[oó]n/i },
  { kind: 'presentation', re: /presentaci[oó]n|\bvoz\b|\baudio\b/i },
  { kind: 'brand', re: /\bmarca\b|institucional/i },
]);

function detectNamePattern(text) {
  // Nombres de archivo reales usan "_"/"-" donde una frase usaría espacio
  // ("Modelo_negocio_..."), y los patrones de arriba están escritos con
  // \s* -- se normaliza a espacios antes de matchear, nunca se duplican
  // los patrones con guiones bajos incluidos.
  const normalizado = String(text ?? '').replace(/[_-]+/g, ' ');
  for (const p of NAME_PATTERNS) if (p.re.test(normalizado)) return p.kind;
  return null;
}

// Vocabulario de necesidades PEQUEÑO y auditable (§9: "no inventar
// etiquetas") -- solo términos de salud/bienestar reales ya usados en el
// catálogo/reportes de investigación de este proyecto (docs/clientes/,
// docs/research/). Ausencia de match real = needTags:[] (nunca se fuerza).
const KNOWN_NEED_KEYWORDS = Object.freeze({
  menopausia: 'menopause',
  perimenopausia: 'perimenopause',
  libido: 'libido',
  energia: 'energy',
  peso: 'weight',
  metabolismo: 'metabolism',
  estres: 'stress',
  digestion: 'digestion',
  inmune: 'immune',
  sueno: 'sleep',
  piel: 'skin',
});

function detectNeedTags(tokens) {
  const tags = new Set();
  for (const t of tokens) if (KNOWN_NEED_KEYWORDS[t]) tags.add(KNOWN_NEED_KEYWORDS[t]);
  return [...tags];
}

function detectAudience(tokens) {
  if (tokens.includes('mujer') || tokens.includes('mujeres') || tokens.includes('femenino') || tokens.includes('female')) return 'female';
  if (tokens.includes('hombre') || tokens.includes('hombres') || tokens.includes('masculino') || tokens.includes('male')) return 'male';
  return null; // §10: nunca se infiere agresivamente -- ausencia real = null, no "general" por defecto.
}

function validateManifestField(value, allowed, label) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new Error(`classifyCommercialMedia: manifest."${label}" inválido: "${value}".`);
  }
}

/**
 * Clasifica UN archivo real. `kind` viene de mediaInspector.js
 * (video/audio/image). `manifest` es opcional (§6) y SIEMPRE tiene
 * prioridad sobre cualquier inferencia.
 *
 * @returns {{mediaType:string|null, businessIntent:string, productId:string|null,
 *   category:string|null, audience:string|null, needTags:string[], displayName:string,
 *   classificationConfidence:string, classificationReason:string}}
 */
export function classifyCommercialMedia({ fileName, kind, manifest = null }) {
  // 1. Metadata explícita / manifest -- gana siempre, HIGH por definición
  // (una persona ya lo dijo explícitamente, no es una inferencia).
  if (manifest) {
    validateManifestField(manifest.mediaType, MEDIA_TYPES, 'mediaType');
    validateManifestField(manifest.businessIntent, BUSINESS_INTENTS, 'businessIntent');
    validateManifestField(manifest.audience, AUDIENCES, 'audience');
    return Object.freeze({
      mediaType: manifest.mediaType ?? null,
      businessIntent: manifest.businessIntent ?? 'NEEDS_METADATA',
      productId: manifest.productId ?? null,
      category: manifest.category ?? null,
      audience: manifest.audience ?? null,
      needTags: Object.freeze([...(manifest.needTags ?? [])]),
      displayName: manifest.displayName ?? fileName,
      classificationConfidence: 'HIGH',
      classificationReason: 'manifest explícito (prioridad §6/§4.1).',
    });
  }

  // 3/5. Nomenclatura -- patrón de nombre + catálogo de producto real.
  const tokens = tokenize(fileName);
  const patternKind = detectNamePattern(fileName);
  const productMatch = matchProductFromFilename(fileName);
  const productId = productMatch.match ? productMatch.productId : null;
  const nombreVisible = productMatch.match ? productMatch.nombreVisible : null;
  const audience = detectAudience(tokens);
  const needTags = detectNeedTags(tokens);
  const productAmbiguous = productMatch.ambiguous === true;

  const isVideo = kind === 'video';
  const isAudio = kind === 'audio';

  let mediaType = null;
  let businessIntent = 'NEEDS_METADATA';
  let confidence = 'LOW';
  let reason;

  if (patternKind === 'business_model') {
    if (isVideo) { mediaType = 'BUSINESS_MODEL_VIDEO'; businessIntent = 'DISTRIBUTION'; confidence = 'HIGH'; }
    else if (isAudio) { mediaType = 'BUSINESS_MODEL_AUDIO'; businessIntent = 'DISTRIBUTION'; confidence = 'HIGH'; }
    reason = `patrón de nombre "modelo de negocio" detectado (${kind ?? 'sin video/audio'}).`;
  } else if (patternKind === 'distribution') {
    mediaType = 'DISTRIBUTION_EXPLANATION'; businessIntent = 'DISTRIBUTION'; confidence = 'MEDIUM';
    reason = 'patrón de nombre "distribución" detectado.';
  } else if (patternKind === 'testimonial') {
    if (isVideo) { mediaType = 'VIDEO_TESTIMONIAL'; businessIntent = 'CONSUMPTION'; confidence = productAmbiguous ? 'MEDIUM' : 'HIGH'; }
    reason = isVideo ? 'patrón de nombre "testimonial" + video real.' : 'patrón "testimonial" detectado pero sin video real -- tipo de media testimonial solo definido para video (§33).';
  } else if (patternKind === 'explanation') {
    if (isVideo && productId) { mediaType = 'PRODUCT_EXPLANATION_VIDEO'; businessIntent = 'CONSUMPTION'; confidence = 'HIGH'; }
    else if (isAudio) { mediaType = 'AUDIO_OFICIAL'; businessIntent = 'CONSUMPTION'; confidence = productId ? 'HIGH' : 'MEDIUM'; }
    reason = 'patrón de nombre "explicación" detectado' + (productId ? ` para producto real "${nombreVisible}".` : ', sin producto real identificado.');
  } else if (patternKind === 'presentation') {
    if (isAudio) { mediaType = 'AUDIO_OFICIAL'; businessIntent = 'CONSUMPTION'; confidence = productId ? 'HIGH' : 'MEDIUM'; }
    else if (isVideo && productId) { mediaType = 'PRODUCT_MEDIA'; businessIntent = 'CONSUMPTION'; confidence = 'MEDIUM'; }
    reason = 'patrón de nombre "presentación/audio/voz" detectado.';
  } else if (patternKind === 'brand') {
    mediaType = 'BRAND_MEDIA'; businessIntent = 'GENERAL'; confidence = 'MEDIUM';
    reason = 'patrón de nombre "marca/institucional" detectado -- sin asociación automática a producto (§35).';
  } else if (productId && !productAmbiguous) {
    // Sin patrón de nombre reconocido, pero el producto SÍ se identifica
    // con seguridad -- bucket genérico de consumo, confidence MEDIA (menos
    // seguro que un patrón de nombre explícito).
    mediaType = 'PRODUCT_MEDIA'; businessIntent = 'CONSUMPTION'; confidence = 'MEDIUM';
    reason = `sin patrón de nombre reconocido, pero producto real identificado sin ambigüedad ("${nombreVisible}").`;
  } else {
    reason = productAmbiguous
      ? `nombre de producto ambiguo entre ${productMatch.candidates.join(', ')} -- no se asume ninguno (§4: "no hacer inferencia creativa libre").`
      : 'ningún patrón de nombre ni producto real reconocible en el nombre de archivo.';
  }

  // 6. Ningún mediaType real resuelto -> NEEDS_METADATA sin importar lo demás.
  if (!mediaType) businessIntent = 'NEEDS_METADATA';

  return Object.freeze({
    mediaType,
    businessIntent,
    productId: productAmbiguous ? null : productId,
    category: null, // se completa en scanCommercialMedia.js desde el catálogo real, si hay productId.
    audience,
    needTags: Object.freeze(needTags),
    displayName: fileName,
    classificationConfidence: businessIntent === 'NEEDS_METADATA' ? 'LOW' : confidence,
    classificationReason: reason,
  });
}
