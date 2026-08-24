// contentGenerationRequest.js — Content Generation Engine, Parte 3: un
// único contrato central para las tres formas de pedir producción
// (CREATE / EDIT_ENHANCE / ADAPT). NO son tres arquitecturas separadas:
// una sola función clasifica determinísticamente el modo a partir de la
// presencia de un `sourceAsset` real y del vocabulario reconocido en la
// instrucción, y produce un ContentGenerationRequest con la misma forma
// sin importar el modo.
//
// MISMO GAP DOCUMENTADO que contentRequest.js/directInstructionMode.js:
// clasificar intención 100% libre requeriría un LLM, fuera de alcance.
// Este clasificador reconoce patrones deterministas (verbos de edición,
// presencia de un asset fuente, nombres de plataforma) -- si la
// instrucción no calza con ningún patrón reconocido y no hay `sourceAsset`,
// asume CREATE (comportamiento por defecto más seguro: nunca asume que un
// video existente debe modificarse si no se le dio uno).

import { randomUUID } from 'node:crypto';

export const CONTENT_GENERATION_MODES = Object.freeze(['CREATE', 'EDIT_ENHANCE', 'ADAPT', 'CAROUSEL']);

// Verbos/frases reales que indican "modifica lo que ya existe" (EDIT_ENHANCE)
// vs. "genera versiones para otros destinos de lo que ya existe" (ADAPT).
// Ambos requieren sourceAsset; se distinguen por el TIPO de cambio pedido.
const PATRON_EDIT = /\b(mejora|mejorar|normaliza|normalizar|agrega|añade|corrige|corregir|reduce|reducir|recorta|recortar|limpia|limpiar|hazlo m[aá]s profesional|arregla)\b/i;
const PATRON_ADAPT = /\b(convierte|convertir|adapta|adaptar|genera (?:versiones|stories|shorts?)|versiones? para|para (?:instagram|facebook|youtube|whatsapp))\b/i;

const PATRON_PLATAFORMA = Object.freeze([
  { profile: 'INSTAGRAM_REEL', pattern: /\binstagram\s*reels?\b|\breels?\b/i },
  { profile: 'INSTAGRAM_STORY', pattern: /\binstagram\s*story\b|\bstories?\b/i },
  { profile: 'INSTAGRAM_FEED', pattern: /\binstagram\s*feed\b/i },
  { profile: 'FACEBOOK_REEL', pattern: /\bfacebook\s*reels?\b/i },
  { profile: 'FACEBOOK_STORY', pattern: /\bfacebook\s*story\b/i },
  { profile: 'FACEBOOK_FEED', pattern: /\bfacebook\s*feed\b/i },
  { profile: 'YOUTUBE_SHORT', pattern: /\byoutube\s*shorts?\b/i },
  { profile: 'YOUTUBE_VIDEO', pattern: /\byoutube\s*video\b/i },
  { profile: 'WHATSAPP_VIDEO', pattern: /\bwhatsapp\b/i },
]);

/** Detecta perfiles de salida mencionados por nombre en la instrucción -- nunca infiere uno no mencionado. "genera todas las versiones" es la única frase que expande a TODOS los perfiles de video conocidos, explícitamente. */
function detectarOutputProfilesMencionados(texto) {
  if (/\btodas las versiones\b|\btodos los formatos\b/i.test(texto)) return 'ALL_VIDEO_PROFILES';
  const encontrados = PATRON_PLATAFORMA.filter(({ pattern }) => pattern.test(texto)).map((p) => p.profile);
  return Object.freeze([...new Set(encontrados)]);
}

function clasificarModo({ sourceAsset, rawText, forcedMode }) {
  if (forcedMode) {
    if (!CONTENT_GENERATION_MODES.includes(forcedMode)) {
      throw new Error(`parseContentGenerationRequest: "forcedMode" inválido "${forcedMode}" (válidos: ${CONTENT_GENERATION_MODES.join(', ')}).`);
    }
    return forcedMode;
  }
  if (!sourceAsset) return 'CREATE'; // sin asset fuente, nunca puede ser EDIT ni ADAPT.
  // Con sourceAsset: ADAPT si menciona plataformas/conversión de formato: EDIT_ENHANCE si menciona verbos de mejora.
  // Si menciona AMBOS (ej. "mejora y adapta"), ADAPT tiene prioridad porque casi siempre implica una lista de perfiles concreta y verificable; EDIT_ENHANCE sin perfiles es la interpretación por defecto para sourceAsset + verbos de mejora sin plataformas.
  const esAdapt = PATRON_ADAPT.test(rawText);
  const esEdit = PATRON_EDIT.test(rawText);
  if (esAdapt) return 'ADAPT';
  if (esEdit) return 'EDIT_ENHANCE';
  // sourceAsset presente pero sin verbo reconocido: EDIT_ENHANCE es el default más conservador (no genera N archivos nuevos sin que se haya pedido explícitamente una lista de plataformas).
  return 'EDIT_ENHANCE';
}

/**
 * @param {object} args
 * @param {?string} args.rawText — instrucción en prosa libre. Si se omite y se provee `userIntent`, se deriva de este.
 * @param {?string} args.userIntent — intención comercial de alto nivel (Autonomous CREATE, ver autonomousCreate.js#buildCreativeProposal). No clasifica nada por sí sola aquí -- solo se conserva en el request y sirve de rawText por defecto si no se dio uno explícito.
 * @param {?string} args.forcedMode — uno de CONTENT_GENERATION_MODES, si ya se conoce (ej. UI con selector explícito).
 * @param {?{type:string, path:string, id?:string}} args.sourceAsset — asset existente real (video/imagen) sobre el que operar. null/undefined para CREATE.
 * @param {?string} args.productId
 * @param {string[]} [args.platforms] — plataformas explícitas (si el llamador ya las resolvió, tiene prioridad sobre lo detectado en rawText).
 * @param {string[]} [args.outputProfiles] — Output Profiles explícitos (ver outputProfiles.js), tiene prioridad total.
 * @param {?object} args.campaignContext — contexto estratégico ya resuelto (ej. de campaignMode.js), opcional.
 * @param {?object} args.productionPreferences — preferencias de producción explícitas (ej. { operations: [...], operationParams: {...} }).
 * @param {?object} args.requestedChanges — cambios explícitos pedidos (para EDIT_ENHANCE), forma libre pero nunca inventada aquí.
 * @returns {{
 *   requestId:string, mode:string, rawText:string, sourceAsset:object|null,
 *   productId:string|null, platforms:string[], outputProfiles:string[],
 *   campaignContext:object|null, productionPreferences:object,
 *   requestedChanges:object, missingFields:string[], createdAt:string,
 * }}
 */
export function parseContentGenerationRequest({
  rawText = null, userIntent = null, forcedMode = null, sourceAsset = null, productId = null,
  platforms = [], outputProfiles = [], campaignContext = null,
  productionPreferences = {}, requestedChanges = {},
}) {
  const textoEfectivo = rawText ?? userIntent;
  if (!textoEfectivo?.trim()) throw new Error('parseContentGenerationRequest: se requiere "rawText" o "userIntent".');
  rawText = textoEfectivo;

  const mode = clasificarModo({ sourceAsset, rawText, forcedMode });

  if ((mode === 'EDIT_ENHANCE' || mode === 'ADAPT') && !sourceAsset) {
    throw new Error(`parseContentGenerationRequest: el modo "${mode}" requiere "sourceAsset" real -- nunca se asume un asset que no fue provisto.`);
  }

  const outputProfilesResueltos = outputProfiles.length > 0
    ? Object.freeze([...outputProfiles])
    : detectarOutputProfilesMencionados(rawText);

  const missingFields = [];
  if ((mode === 'CREATE' || mode === 'CAROUSEL') && !productId) missingFields.push('productId');
  if (mode === 'ADAPT' && (outputProfilesResueltos === 'ALL_VIDEO_PROFILES' ? false : outputProfilesResueltos.length === 0)) {
    missingFields.push('outputProfiles');
  }

  return Object.freeze({
    requestId: randomUUID(),
    mode,
    rawText,
    userIntent: userIntent ?? null,
    sourceAsset: sourceAsset ? Object.freeze({ ...sourceAsset }) : null,
    productId,
    platforms: Object.freeze([...platforms]),
    outputProfiles: outputProfilesResueltos === 'ALL_VIDEO_PROFILES' ? 'ALL_VIDEO_PROFILES' : outputProfilesResueltos,
    campaignContext: campaignContext ? Object.freeze({ ...campaignContext }) : null,
    productionPreferences: Object.freeze({ ...productionPreferences }),
    requestedChanges: Object.freeze({ ...requestedChanges }),
    missingFields: Object.freeze(missingFields),
    createdAt: new Date().toISOString(),
  });
}
