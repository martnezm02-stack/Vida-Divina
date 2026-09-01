// selector.js — Commercial Media: interfaz de consulta para el commercial
// engine (encargo §23-§29). Solo lee el registry ya poblado -- nunca
// escanea incoming/ ni clasifica nada aquí (esa responsabilidad es de
// scanCommercialMedia.js). El commercial engine real (whatsapp-adapter/src/
// conversationRouter.js + outboundBuilder.js) NO se modifica ni se conecta
// todavía a estas funciones (§29: "integrarlo solo hasta que PUEDA
// consultar" -- la conexión real queda para una fase posterior).

import { listCommercialMedia } from './commercialMediaStore.js';

/**
 * Candidatos compatibles con los filtros dados (§23). Solo devuelve
 * media `active:true` -- un NEEDS_METADATA nunca es candidato (§14).
 */
export function getCommercialMediaCandidates({ productId, businessIntent, needTags, audience, mediaType } = {}) {
  let candidates = listCommercialMedia({ active: true });

  if (businessIntent !== undefined) candidates = candidates.filter((c) => c.businessIntent === businessIntent);
  if (productId !== undefined) candidates = candidates.filter((c) => c.productId === productId || c.productId === null);
  if (mediaType !== undefined) candidates = candidates.filter((c) => c.mediaType === mediaType);
  if (audience !== undefined) candidates = candidates.filter((c) => c.audience === audience || c.audience === 'general' || c.audience === null);
  if (needTags !== undefined && needTags.length > 0) {
    candidates = candidates.filter((c) => needTags.some((t) => c.needTags.includes(t)));
  }

  return Object.freeze(candidates);
}

const RANK_WEIGHTS = Object.freeze({ businessIntentExact: 1000, productIdExact: 500, needTagsExact: 250, audienceCompatible: 100, languageCompatible: 50, mediaTypeExact: 25, active: 10 });
const CONFIDENCE_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1 });

/** Ranking determinista (§24) -- las 8 prioridades del encargo, en ese orden exacto, ninguna reordenada. */
function rank(candidate, { productId, businessIntent, needTags = [], audience, mediaType, language }) {
  let score = 0;
  if (businessIntent !== undefined && candidate.businessIntent === businessIntent) score += RANK_WEIGHTS.businessIntentExact;
  if (productId !== undefined && candidate.productId === productId) score += RANK_WEIGHTS.productIdExact;
  if (needTags.length > 0 && needTags.some((t) => candidate.needTags.includes(t))) score += RANK_WEIGHTS.needTagsExact;
  if (audience !== undefined && (candidate.audience === audience || candidate.audience === 'general')) score += RANK_WEIGHTS.audienceCompatible;
  if (language !== undefined && candidate.language === language) score += RANK_WEIGHTS.languageCompatible;
  if (mediaType !== undefined && candidate.mediaType === mediaType) score += RANK_WEIGHTS.mediaTypeExact;
  if (candidate.active) score += RANK_WEIGHTS.active;
  score += (CONFIDENCE_RANK[candidate.classificationConfidence] ?? 0); // último desempate real, nunca decide por sí solo.
  return score;
}

/**
 * Elige el mejor candidato real (§24-§28). Devuelve el registro ganador o
 * literalmente el string "NO_MATCH" (§27) -- nunca envía contenido al
 * azar cuando no hay compatibilidad real.
 *
 * businessIntent=CONSUMPTION nunca puede devolver DISTRIBUTION (§25) y
 * viceversa (§26) -- se garantiza filtrando ANTES de rankear, no
 * confiando solo en el peso del ranking.
 */
export function selectCommercialMedia(criteria = {}) {
  const candidates = getCommercialMediaCandidates(criteria);
  if (candidates.length === 0) return 'NO_MATCH';

  const ranked = [...candidates].sort((a, b) => (rank(b, criteria) - rank(a, criteria)) || a.displayName.localeCompare(b.displayName));
  return ranked[0];
}
