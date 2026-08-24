// contentRequest.js — entrada formal y unificada para "quiero crear esta
// publicación/campaña". NO es un segundo cerebro de marketing: solo
// estructura y clasifica una intención de contenido, deterministamente,
// para que contentOrchestrator.js sepa a qué camino dirigirla
// (campaignMode.js o directInstructionAdapter.js).
//
// GAP DOCUMENTADO (igual que video-production/src/directInstructionMode.js):
// convertir prosa 100% libre en campos reales requeriría comprensión
// semántica genuina -- un LLM, fuera de alcance de esta fase. Este parser
// SOLO reconoce patrones deterministas (producto conocido, plataforma,
// duración, presencia de CTA/WhatsApp, presencia de asset/voiceover/cta
// literal). Todo lo demás debe llegar explícito en `explicitFields`, o el
// Content Request queda con esos campos en null -- NUNCA se inventa un
// valor no reconocido.

import { randomUUID } from 'node:crypto';

export const CONTENT_MODES = Object.freeze(['CAMPAIGN_MODE', 'DIRECT_INSTRUCTION_MODE']);

// Extensible por diseño (Parte 2 de esta fase) -- no está atado solo a
// Reels. Si se necesita un tipo nuevo, se agrega aquí, sin tocar el resto
// del contrato de ContentRequest.
export const CONTENT_TYPES = Object.freeze([
  'VIDEO_REEL', 'VIDEO_STORY', 'VIDEO_SHORT',
  'IMAGE_POST', 'IMAGE_STORY', 'CAROUSEL', 'CAMPAIGN',
]);

// Productos reales conocidos por este parser -- deliberadamente pequeño y
// explícito (no un NER genérico). Si el producto mencionado no está en esta
// lista, el Content Request lo deja como productId:null y
// missingFields incluye 'productId' -- nunca se adivina un producto.
const KNOWN_PRODUCTS = Object.freeze([
  { productId: 'te-divina', pattern: /\bt[eé]\s*divina\b|\btedivina\b/i },
  { productId: 'cafe-divina-tongkat-ali', pattern: /\bcaf[eé]\s*divina\b/i },
]);

const PATRON_PLATAFORMA = Object.freeze([
  { platform: 'INSTAGRAM', pattern: /\binstagram\b|\breels?\b/i },
  { platform: 'FACEBOOK', pattern: /\bfacebook\b/i },
  { platform: 'YOUTUBE', pattern: /\byoutube\b/i },
  { platform: 'WHATSAPP', pattern: /\bwhatsapp\b/i },
]);

const PATRON_OBJETIVO_WHATSAPP = /\b(conversaci[oó]n(?:es)?\s+por\s+whatsapp|escr[ií]benos\s+por\s+whatsapp|cta\s+a?\s*whatsapp|generar\s+conversaciones)\b/i;
const PATRON_DURACION = /(\d+(?:[.,]\d+)?)\s*(segundos|seg\b|s\b)/i;
const PATRON_AUDIENCIA = /\b(dirigid[oa]s?\s+a|para\s+(?:mujeres|hombres|personas))\s+([^.,;]+)/i;

// Presencia de estos patrones es la señal determinista de que la solicitud
// YA trae contenido literal (guion/foto/CTA exactos) -- eso es
// DIRECT_INSTRUCTION_MODE, aunque la prosa también mencione objetivo o
// plataforma. Ver directInstructionMode.js: nunca se infiere voiceoverText
// ni cta de la prosa, así que si el llamador los da explícitos, la
// intención real es "sáltate Creative Intelligence".
function tieneContenidoLiteralExplicito(explicitFields) {
  return Boolean(
    explicitFields?.voiceoverText?.trim() ||
    explicitFields?.cta?.trim() ||
    (Array.isArray(explicitFields?.visualAssets) && explicitFields.visualAssets.length > 0)
  );
}

function detectarProducto(rawText) {
  for (const { productId, pattern } of KNOWN_PRODUCTS) {
    if (pattern.test(rawText)) return productId;
  }
  return null;
}

function detectarPlataformas(rawText) {
  const encontradas = PATRON_PLATAFORMA.filter(({ pattern }) => pattern.test(rawText)).map((p) => p.platform);
  return encontradas.length > 0 ? Object.freeze(encontradas) : Object.freeze([]);
}

function extraerParametrosDeterministas(rawText) {
  const duracionMatch = rawText.match(PATRON_DURACION);
  const audienciaMatch = rawText.match(PATRON_AUDIENCIA);
  return {
    productId: detectarProducto(rawText),
    platforms: detectarPlataformas(rawText),
    objectiveWhatsappConversation: PATRON_OBJETIVO_WHATSAPP.test(rawText),
    durationSeconds: duracionMatch ? Number(duracionMatch[1].replace(',', '.')) : null,
    targetAudienceDescriptor: audienciaMatch ? audienciaMatch[2].trim() : null,
  };
}

/**
 * Clasifica el modo determinísticamente. Un `forcedMode` explícito siempre
 * gana (ej. una UI real donde el usuario ya eligió Campaign vs Direct) --
 * el clasificador de texto libre es solo un default de conveniencia, nunca
 * una autoridad que se imponga sobre una elección explícita.
 */
function clasificarModo({ explicitFields, forcedMode }) {
  if (forcedMode) {
    if (!CONTENT_MODES.includes(forcedMode)) {
      throw new Error(`parseContentRequest: "forcedMode" inválido "${forcedMode}" (válidos: ${CONTENT_MODES.join(', ')}).`);
    }
    return forcedMode;
  }
  return tieneContenidoLiteralExplicito(explicitFields) ? 'DIRECT_INSTRUCTION_MODE' : 'CAMPAIGN_MODE';
}

/**
 * @param {object} args
 * @param {string} args.rawText — instrucción en prosa libre (Campaign o Direct).
 * @param {string} args.contentType — uno de CONTENT_TYPES.
 * @param {?string} args.forcedMode — uno de CONTENT_MODES, si el llamador ya sabe el modo (ver clasificarModo).
 * @param {object} [args.explicitFields] — campos ya explícitos que el llamador provee (nunca inferidos de rawText):
 *   { productId, voiceoverText, cta, visualAssets, screenText, durationSeconds, platforms, targetOutputProfiles }
 * @returns {{
 *   contentRequestId:string, mode:string, contentType:string, rawText:string,
 *   productId:string|null, platforms:string[], objectiveWhatsappConversation:boolean,
 *   durationSeconds:number|null, targetAudienceDescriptor:string|null,
 *   explicitFields:object, missingFields:string[], createdAt:string,
 * }}
 */
export function parseContentRequest({ rawText, contentType, forcedMode = null, explicitFields = {} }) {
  if (!rawText?.trim()) throw new Error('parseContentRequest: "rawText" es obligatorio.');
  if (!CONTENT_TYPES.includes(contentType)) {
    throw new Error(`parseContentRequest: "contentType" inválido "${contentType}" (válidos: ${CONTENT_TYPES.join(', ')}).`);
  }

  const detectado = extraerParametrosDeterministas(rawText);
  const mode = clasificarModo({ explicitFields, forcedMode });

  const productId = explicitFields.productId ?? detectado.productId;
  const durationSeconds = explicitFields.durationSeconds ?? detectado.durationSeconds;
  const platforms = (explicitFields.platforms?.length ? Object.freeze([...explicitFields.platforms]) : detectado.platforms);

  // NO INVENTAR: se listan explícitamente los campos estratégicos que
  // faltan, para que el orquestador pueda pedirlos o declarar el bloqueo
  // -- nunca se sigue adelante fabricando un valor.
  const missingFields = [];
  if (!productId) missingFields.push('productId');
  if (platforms.length === 0) missingFields.push('platforms');
  if (mode === 'DIRECT_INSTRUCTION_MODE') {
    if (!explicitFields.voiceoverText?.trim()) missingFields.push('voiceoverText');
    if (!explicitFields.cta?.trim()) missingFields.push('cta');
    if (!Array.isArray(explicitFields.visualAssets) || explicitFields.visualAssets.length === 0) missingFields.push('visualAssets');
  }

  return Object.freeze({
    contentRequestId: randomUUID(),
    mode,
    contentType,
    rawText,
    productId,
    platforms,
    objectiveWhatsappConversation: detectado.objectiveWhatsappConversation || Boolean(explicitFields.objectiveWhatsappConversation),
    durationSeconds: durationSeconds ?? null,
    targetAudienceDescriptor: explicitFields.targetAudienceDescriptor ?? detectado.targetAudienceDescriptor,
    explicitFields: Object.freeze({ ...explicitFields }),
    targetOutputProfiles: Object.freeze([...(explicitFields.targetOutputProfiles ?? [])]),
    missingFields: Object.freeze(missingFields),
    createdAt: new Date().toISOString(),
  });
}

/** Lanza si el ContentRequest tiene campos estratégicos faltantes que impedirían continuar sin inventar. Quien llama decide cuándo exigir esto (ej. antes de CampaignMode, no necesariamente antes de solo inspeccionar el request). */
export function assertContentRequestComplete(contentRequest, requiredFields) {
  const faltantes = requiredFields.filter((f) => contentRequest.missingFields.includes(f));
  if (faltantes.length > 0) {
    throw new Error(`assertContentRequestComplete: faltan campos estratégicos reales para continuar: ${faltantes.join(', ')} — no se inventan, deben proveerse explícitamente.`);
  }
  return true;
}
