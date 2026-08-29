// claimRelevance.js — Corrección "Hook Intelligence + Claim Relevance +
// Auto-QA" (2026-08-28, Paso 10/11/12 del encargo). Root cause real
// confirmado: facts.beneficios/facts.ingredientes son campos reales del
// catálogo (docs/productos/) escritos como lista completa
// separada por ";" (ej. "Líbido saludable; agudeza mental; fuerza
// muscular; antioxidante.") -- hypothesisCopyProvider.js#buildSection()
// los usa TAL CUAL, íntegros, sin importar qué ángulo se eligió (root
// cause real de "una variante intenta comunicar demasiados beneficios").
//
// Este módulo SOLO filtra por relevancia -- NUNCA inventa un claim
// nuevo, NUNCA modifica el texto de un claim real, NUNCA toca Claim
// Safety (assertNoForbiddenProductClaims/assertBrandAvoidCompliance
// siguen corriendo tal cual, SOBRE los claims ya filtrados, dentro de
// generateVariantCopy() -- ver hookIntelligence.js).

import { ANGLE_KEYWORDS } from './creativeAngleSelector.js';

const DEFAULT_MAX_CORE_CLAIMS = 2;
const DEFAULT_MAX_SUPPORTING_CLAIMS = 1;

function limpiar(texto) { return String(texto ?? '').trim(); }

/** Divide un campo real (ej. "Líbido saludable; agudeza mental; antioxidante.") en fragmentos reales individuales -- nunca inventa una separación que el texto real no tiene. */
function splitClaims(fieldText) {
  return limpiar(fieldText)
    .replace(/\.+$/, '')
    .split(/;|(?<!\d)\.(?!\d)/)
    .map((f) => limpiar(f))
    .filter((f) => f.length > 0);
}

function scoreClaimAgainstAngle(claimText, angleId) {
  const patterns = ANGLE_KEYWORDS[angleId] ?? [];
  const texto = claimText.toLowerCase();
  return patterns.reduce((acc, re) => acc + (re.test(texto) ? 1 : 0), 0);
}

/**
 * Clasifica los claims reales de UN campo real (beneficios O ingredientes,
 * nunca ambos mezclados -- mismo criterio real de disjunción ya usado por
 * hypothesisCopyProvider.js#SOURCE_FIELD_BY_SECTION) por relevancia real
 * al primaryAngle real.
 *
 * @param {{fieldText:?string, angleId:?string, maxCoreClaims?:number, maxSupportingClaims?:number}} args
 * @returns {{core:string[], supporting:string[], irrelevant:string[], filteredText:string}}
 */
export function classifyClaimsForField({
  fieldText, angleId, maxCoreClaims = DEFAULT_MAX_CORE_CLAIMS, maxSupportingClaims = DEFAULT_MAX_SUPPORTING_CLAIMS,
}) {
  const claims = splitClaims(fieldText);
  if (claims.length === 0) return Object.freeze({ core: Object.freeze([]), supporting: Object.freeze([]), irrelevant: Object.freeze([]), filteredText: null });

  // Sin angleId real (compatibilidad hacia atrás): nunca filtra -- el
  // campo real completo se preserva tal cual (Paso 31, mismo criterio del
  // resto del proyecto).
  if (!angleId) {
    return Object.freeze({ core: Object.freeze([...claims]), supporting: Object.freeze([]), irrelevant: Object.freeze([]), filteredText: fieldText });
  }

  const scored = claims.map((claim) => ({ claim, score: scoreClaimAgainstAngle(claim, angleId) }))
    .sort((a, b) => b.score - a.score);

  const conSenal = scored.filter((c) => c.score > 0);
  const sinSenal = scored.filter((c) => c.score === 0);

  // CORE: claims reales con señal real de coincidencia con el ángulo,
  // hasta maxCoreClaims. Si NINGÚN claim real tiene señal (el campo real
  // no menciona nada del ángulo elegido), se preserva el primero real tal
  // cual -- nunca se deja un campo real vacío por falta de señal (Paso 29:
  // "no bloquear innecesariamente").
  const core = (conSenal.length > 0 ? conSenal : scored.slice(0, 1)).slice(0, maxCoreClaims).map((c) => c.claim);
  const restantes = scored.filter((c) => !core.includes(c.claim));
  const supporting = restantes.slice(0, maxSupportingClaims).map((c) => c.claim);
  const irrelevant = restantes.slice(maxSupportingClaims).map((c) => c.claim);

  const filteredText = [...core, ...supporting].join('; ');

  return Object.freeze({
    core: Object.freeze(core), supporting: Object.freeze(supporting), irrelevant: Object.freeze(irrelevant), filteredText,
  });
}

/**
 * Punto de entrada real (Paso 10 del encargo): filtra beneficios E
 * ingredientes reales de "facts" por relevancia al primaryAngle real --
 * devuelve un "facts" real NUEVO (nunca muta el original) con los campos
 * ya recortados, listo para generateVariantCopy(). "problema" NUNCA se
 * filtra (Paso 13: Claim Safety intacto -- el problema real de la sección
 * "problem" no es una lista de claims, es un único hecho real).
 *
 * @param {{facts:object, angleId:?string, maxCoreClaims?:number, maxSupportingClaims?:number}} args
 */
export function selectRelevantClaims({
  facts, angleId, maxCoreClaims = DEFAULT_MAX_CORE_CLAIMS, maxSupportingClaims = DEFAULT_MAX_SUPPORTING_CLAIMS,
}) {
  if (!facts) throw new Error('selectRelevantClaims: "facts" es obligatorio.');

  const beneficios = classifyClaimsForField({ fieldText: facts.beneficios, angleId, maxCoreClaims, maxSupportingClaims });
  const ingredientes = classifyClaimsForField({ fieldText: facts.ingredientes, angleId, maxCoreClaims, maxSupportingClaims });

  return Object.freeze({
    core: Object.freeze([...beneficios.core, ...ingredientes.core]),
    supporting: Object.freeze([...beneficios.supporting, ...ingredientes.supporting]),
    irrelevant: Object.freeze([...beneficios.irrelevant, ...ingredientes.irrelevant]),
    // filteredFacts (Paso 14 del encargo): MISMO objeto real de facts,
    // solo con beneficios/ingredientes recortados a los claims reales
    // relevantes -- "problema" y "nombreComercial"/"nombreVisible"
    // reales intactos, nunca tocados.
    filteredFacts: Object.freeze({
      ...facts,
      beneficios: beneficios.filteredText ?? facts.beneficios,
      ingredientes: ingredientes.filteredText ?? facts.ingredientes,
    }),
  });
}
