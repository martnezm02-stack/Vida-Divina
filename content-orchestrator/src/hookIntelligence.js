// hookIntelligence.js — Corrección "Hook Intelligence + Claim Relevance +
// Auto-QA" (2026-08-28, Paso 2/3/5/6 del encargo). Capa de refinamiento
// SOBRE el Creative Director/Creative Angle Selector existentes -- nunca
// un segundo motor de generación: cada candidato real se construye
// llamando exactamente a hypothesisCopyProvider.js#generateVariantCopy()
// (MISMA función real ya validada, con Claim Safety real incluido), solo
// variando blueprint.hook entre los 11 tipos reales de
// marketingPlaybook.js#HOOK_STRATEGIES -- root cause real confirmado del
// problema reportado (hookRelevanceScore=0.29): antes, el pipeline
// aceptaba el ÚNICO hookId que el blueprint rotado por índice traía,
// nunca comparaba contra alternativas reales.

import { generateVariantCopy } from './hypothesisCopyProvider.js';
import { HOOK_STRATEGIES, ANGLE_STRATEGIES } from '../../creative-intelligence/src/marketingPlaybook.js';
import { HOOK_TYPE_LABELS } from './creativeAngleSelector.js';

export const MIN_ACCEPTABLE_HOOK_SCORE = 0.65;
const MAX_RETRY_ROUNDS = 2; // rondas ADICIONALES reales (Paso 6 del encargo) -- 1 ronda inicial + hasta 2 más = 3 intentos reales.
const CANDIDATES_PER_ROUND = 5;
const ALL_HOOK_IDS = Object.freeze(Object.values(HOOK_STRATEGIES).map((h) => h.id));

function limpiar(t) { return String(t ?? '').toLowerCase().trim(); }
function normalizeForDup(t) { return limpiar(t).replace(/[¿?¡!.,]/g, '').replace(/\s+/g, ' ').trim(); }

const STOPWORDS_REAL = new Set([
  'que', 'para', 'esto', 'esta', 'este', 'como', 'pero', 'nunca', 'siempre', 'antes', 'sobre', 'desde', 'hacia',
  'entre', 'porque', 'cuando', 'donde', 'cual', 'cuales', 'sino', 'muy', 'mas', 'más', 'tan', 'sin', 'con', 'del',
  'las', 'los', 'una', 'uno', 'unos', 'unas', 'les', 'sus', 'tus', 'todo', 'toda', 'todos', 'todas', 'real', 'reales',
]);

/** Palabras reales significativas (>=4 letras, sin acentos, sin stopwords) -- nunca inventa vocabulario, solo tokeniza texto real ya existente. */
function significantWords(texto) {
  const normalizado = limpiar(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  return [...new Set(normalizado.split(/\s+/).filter((w) => w.length >= 4 && !STOPWORDS_REAL.has(w)))];
}

/** Fracción real de las palabras significativas de "hookText" que también aparecen en "referenceText" -- 0 si el hook real no tiene ninguna palabra significativa propia. */
function tokenOverlap(hookText, referenceText) {
  const hookWords = significantWords(hookText);
  if (hookWords.length === 0 || !referenceText) return 0;
  const refWords = new Set(significantWords(referenceText));
  const hits = hookWords.filter((w) => refWords.has(w)).length;
  return hits / hookWords.length;
}

/**
 * Puntúa UN candidato real -- determinista, nunca una IA nueva (Paso 5 del
 * encargo). BASE real (0.55): el ángulo YA fue validado aguas arriba por
 * creativeAngleSelector.js (el candidato SIEMPRE se construye desde el
 * blueprint/facts de la variante YA elegida por su ángulo), así que un
 * hook real que ni siquiera repite nada de la instrucción/ángulo todavía
 * arranca de una base real de coherencia -- el refinamiento real mide si
 * el TEXTO YA RENDERIZADO además cita vocabulario real de la instrucción
 * (instructionAlignment) y del ángulo (angleAlignment, contra la
 * descripción real ya documentada en ANGLE_STRATEGIES -- nunca una lista
 * de keywords inventada aparte). repetitionPenalty puede tirar el score
 * real muy por debajo del umbral (Paso 8/9 del encargo).
 */
function scoreHookCandidate({
  hookId, hookText, angleId, userInstruction, previousHooks,
}) {
  const angleDescription = Object.values(ANGLE_STRATEGIES).find((a) => a.id === angleId)?.description ?? null;
  const instructionAlignment = tokenOverlap(hookText, userInstruction);
  const angleAlignment = tokenOverlap(hookText, angleDescription);

  const normalized = normalizeForDup(hookText);
  const exactDup = previousHooks.some((p) => normalizeForDup(p.hook ?? p) === normalized);
  const sameTypeCount = previousHooks.filter((p) => (p.hookId ?? p.hookType) === hookId).length;
  const repetitionPenalty = exactDup ? 1 : Math.min(0.6, sameTypeCount * 0.3);

  const BASE = 0.55;
  const totalScore = Math.max(0, Math.min(1,
    BASE + (0.30 * instructionAlignment) + (0.15 * angleAlignment) - (0.45 * repetitionPenalty),
  ));

  return {
    totalScore, instructionAlignment, angleAlignment, repetitionPenalty,
  };
}

/** Hasta "count" hookIds reales aún no probados -- orden determinista real (ver HOOK_STRATEGIES), nunca aleatorio. */
function pickCandidateHookIds({ exclude, count }) {
  return ALL_HOOK_IDS.filter((id) => !exclude.has(id)).slice(0, count);
}

/**
 * Selecciona el mejor hook REAL entre varios candidatos reales
 * reformulados (Paso 2/3/6/7 del encargo) para una variante YA elegida
 * por creativeAngleSelector.js. Nunca inventa un producto/claim/hecho
 * nuevo -- cada candidato usa EXACTAMENTE los mismos
 * facts/painHookFragment/campaignIntent reales ya usados para esa
 * variante (ver hypothesisCreativeEngine.js#buildVariant ->
 * hookRegenerationContext), Claim Safety real corre dentro de cada
 * generateVariantCopy() (un candidato que lo viola simplemente se
 * descarta, nunca se fuerza).
 *
 * @param {{variant:object, userInstruction?:?string, previousHooks?:object[], maxRounds?:number}} args
 * @returns {{hook:string, hookId:string, hookType:object, hookRelevanceScore:number, hookQualityStatus:'ACCEPTED'|'LOW_CONFIDENCE', copy:object, candidates:object[]}}
 */
export function selectHook({
  variant, userInstruction = null, previousHooks = [], maxRounds = MAX_RETRY_ROUNDS, excludeHookIds = [],
}) {
  const ctx = variant?.hookRegenerationContext;
  if (!ctx) throw new Error('selectHook: "variant.hookRegenerationContext" es obligatorio (ver hypothesisCreativeEngine.js#buildVariant).');
  const angleId = variant.angleId;

  // excludeHookIds (Paso 21 del encargo "Regenerar hook"): excluye
  // explícitamente el hook real actual (y cualesquiera otros ya
  // mostrados) de la búsqueda real -- nunca puede repetir el mismo tipo
  // real que el usuario ya vio y pidió cambiar.
  const tried = new Set(excludeHookIds);
  const allCandidates = [];
  let round = 0;

  while (round <= maxRounds) {
    const idsThisRound = pickCandidateHookIds({ exclude: tried, count: CANDIDATES_PER_ROUND });
    if (idsThisRound.length === 0) break; // catálogo real de 11 hookIds agotado -- nunca inventa un tipo #12.
    for (const hookId of idsThisRound) {
      tried.add(hookId);
      let copy;
      try {
        copy = generateVariantCopy({
          blueprint: { ...ctx.blueprint, hook: hookId }, painHookFragment: ctx.painHookFragment, facts: ctx.facts, campaignIntent: ctx.campaignIntent,
        });
      } catch {
        continue; // Claim Safety real (assertNoForbiddenProductClaims/assertBrandAvoidCompliance) rechazó este candidato real -- se descarta, nunca se fuerza.
      }
      const scored = scoreHookCandidate({
        hookId, hookText: copy.hook, angleId, userInstruction, previousHooks,
      });
      allCandidates.push(Object.freeze({
        hookId, hook: copy.hook, copy, ...scored,
      }));
    }
    const mejorHastaAhora = allCandidates.reduce((best, c) => (!best || c.totalScore > best.totalScore ? c : best), null);
    if (mejorHastaAhora && mejorHastaAhora.totalScore >= MIN_ACCEPTABLE_HOOK_SCORE) break;
    round += 1;
  }

  if (allCandidates.length === 0) {
    throw new Error('selectHook: ningún candidato real de hook pasó Claim Safety -- no se puede seleccionar un hook real.');
  }

  const best = allCandidates.reduce((top, c) => (c.totalScore > top.totalScore ? c : top), allCandidates[0]);
  const hookQualityStatus = best.totalScore >= MIN_ACCEPTABLE_HOOK_SCORE ? 'ACCEPTED' : 'LOW_CONFIDENCE';

  return Object.freeze({
    hook: best.hook,
    hookId: best.hookId,
    hookType: Object.freeze({ id: best.hookId, label: HOOK_TYPE_LABELS[best.hookId] ?? best.hookId }),
    hookRelevanceScore: best.totalScore,
    hookQualityStatus,
    // repetitionPenalty (Paso 8/9 del encargo "Cierre del Creative
    // Director"): expuesto para que creativeQualityAutoQA.js lo reutilice
    // TAL CUAL -- nunca recalculado aparte.
    repetitionPenalty: best.repetitionPenalty,
    copy: best.copy,
    candidates: Object.freeze(allCandidates.map((c) => Object.freeze({
      hookId: c.hookId, hook: c.hook, totalScore: c.totalScore,
    }))),
  });
}

/**
 * Re-puntúa un hook real LITERAL (ej. editado a mano por el usuario, Paso
 * 22/23 del encargo) contra el mismo ángulo/instrucción/historial real --
 * nunca sustituye el texto real del usuario, solo informa qué tan
 * coherente real quedó.
 *
 * @param {{hookText:string, angleId:?string, userInstruction?:?string, previousHooks?:object[]}} args
 */
export function scoreHookText({
  hookText, angleId, userInstruction = null, previousHooks = [],
}) {
  const scored = scoreHookCandidate({
    hookId: null, hookText, angleId, userInstruction, previousHooks,
  });
  return Object.freeze({ hookRelevanceScore: scored.totalScore, repetitionPenalty: scored.repetitionPenalty });
}
