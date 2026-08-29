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

// Claim Diversity (Corrección "Refinamiento creativo", 2026-08-28, Paso
// 12/37 del encargo): también considera secondaryAngleId (peso menor,
// nunca domina sobre el ángulo primario real) -- ej. una variante con
// ángulo primario "routine" y secundario "aspiration" puede rescatar un
// claim real que el ángulo primario solo no habría marcado con señal.
function scoreClaimAgainstAngles(claimText, angleId, secondaryAngleId) {
  const primario = scoreClaimAgainstAngle(claimText, angleId);
  const secundario = secondaryAngleId ? scoreClaimAgainstAngle(claimText, secondaryAngleId) * 0.5 : 0;
  return primario + secundario;
}

function normalizeClaim(t) { return String(t ?? '').toLowerCase().trim(); }

/**
 * Clasifica los claims reales de UN campo real (beneficios O ingredientes,
 * nunca ambos mezclados -- mismo criterio real de disjunción ya usado por
 * hypothesisCopyProvider.js#SOURCE_FIELD_BY_SECTION) por relevancia real
 * al primaryAngle real (+ secondaryAngle real opcional, peso menor).
 *
 * @param {{fieldText:?string, angleId:?string, secondaryAngleId?:?string, maxCoreClaims?:number, maxSupportingClaims?:number, previousClaims?:string[]}} args
 * @returns {{core:string[], supporting:string[], irrelevant:string[], filteredText:string}}
 */
export function classifyClaimsForField({
  fieldText, angleId, secondaryAngleId = null, maxCoreClaims = DEFAULT_MAX_CORE_CLAIMS, maxSupportingClaims = DEFAULT_MAX_SUPPORTING_CLAIMS,
  previousClaims = [],
}) {
  const claims = splitClaims(fieldText);
  if (claims.length === 0) return Object.freeze({ core: Object.freeze([]), supporting: Object.freeze([]), irrelevant: Object.freeze([]), filteredText: null });

  // Sin angleId real (compatibilidad hacia atrás): nunca filtra -- el
  // campo real completo se preserva tal cual (Paso 31, mismo criterio del
  // resto del proyecto).
  if (!angleId) {
    return Object.freeze({ core: Object.freeze([...claims]), supporting: Object.freeze([]), irrelevant: Object.freeze([]), filteredText: fieldText });
  }

  const previousNormalizados = new Set(previousClaims.map(normalizeClaim));
  // Claim Diversity (Paso 12/26/37 del encargo): la relevancia real
  // (score) sigue siendo el criterio principal real (Paso 27: "nunca
  // sacrificar coherencia por diversidad") -- "yaUsado" SOLO desempata
  // cuando dos claims reales tienen el MISMO score real, nunca promueve un
  // claim real menos relevante por encima de uno más relevante.
  const scored = claims
    .map((claim) => ({ claim, score: scoreClaimAgainstAngles(claim, angleId, secondaryAngleId), yaUsado: previousNormalizados.has(normalizeClaim(claim)) }))
    .sort((a, b) => b.score - a.score || (a.yaUsado === b.yaUsado ? 0 : a.yaUsado ? 1 : -1));

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
 * @param {{facts:object, angleId:?string, secondaryAngleId?:?string, maxCoreClaims?:number, maxSupportingClaims?:number, previousClaims?:string[]}} args
 */
export function selectRelevantClaims({
  facts, angleId, secondaryAngleId = null, maxCoreClaims = DEFAULT_MAX_CORE_CLAIMS, maxSupportingClaims = DEFAULT_MAX_SUPPORTING_CLAIMS,
  // previousClaims (Paso 12/26/37 del encargo): claims reales CORE ya
  // usados en variantes anteriores de ESTE batch -- diversidad real entre
  // variantes, nunca inventada (mismo patrón real ya usado por
  // previousAngles/previousHooks/previousStructureIds).
  previousClaims = [],
}) {
  if (!facts) throw new Error('selectRelevantClaims: "facts" es obligatorio.');

  const beneficios = classifyClaimsForField({ fieldText: facts.beneficios, angleId, secondaryAngleId, maxCoreClaims, maxSupportingClaims, previousClaims });
  const ingredientes = classifyClaimsForField({ fieldText: facts.ingredientes, angleId, secondaryAngleId, maxCoreClaims, maxSupportingClaims, previousClaims });

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
