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
// Naturalidad/Especificidad (Corrección "Refinamiento creativo", 2026-08-28,
// Paso 6 del encargo): umbrales ADICIONALES reales -- un candidato real solo
// se acepta si cruza los TRES a la vez (score global + naturalidad +
// especificidad), nunca uno solo.
export const MIN_HOOK_NATURALNESS_SCORE = 0.70;
export const MIN_HOOK_SPECIFICITY_SCORE = 0.65;
const MAX_RETRY_ROUNDS = 2; // rondas ADICIONALES reales (Paso 6 del encargo) -- 1 ronda inicial + hasta 2 más = 3 intentos reales.
const CANDIDATES_PER_ROUND = 5;
const ALL_HOOK_IDS = Object.freeze(Object.values(HOOK_STRATEGIES).map((h) => h.id));

function limpiar(t) { return String(t ?? '').toLowerCase().trim(); }
function normalizeForDup(t) { return limpiar(t).replace(/[¿?¡!.,]/g, '').replace(/\s+/g, ' ').trim(); }
function normalizeAccents(t) { return limpiar(t).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function clamp01(n) { return Math.max(0, Math.min(1, n)); }

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

// Generic Hook Pattern Penalty (Paso 2/29 del encargo "Refinamiento
// creativo"): patrones reales de alto riesgo de sonar genéricos/plantilla
// traducida en español -- NUNCA se prohíben, solo penalizan cuando el hook
// real no trae contexto real que los respalde (Paso 2: "aplicar cuando no
// existe contexto específico/no hay objeto claro/no conectan con
// primaryAngle"). Lista literal real del encargo, sin acentos (comparación
// vía normalizeAccents()).
const GENERIC_HOOK_PATTERNS_REAL = Object.freeze([
  'esto es de otro', 'esto es otro', 'esto cambia', 'esto es', 'otro nivel', 'otro mundo',
  'punto y aparte', 'esto te lleva', 'esto lo cambia todo', 'descubre', 'conoce', 'sabias que',
]);

function matchesGenericHookPattern(hookText) {
  const normalizado = normalizeAccents(hookText);
  return GENERIC_HOOK_PATTERNS_REAL.some((p) => normalizado.includes(p));
}

/**
 * genericPatternPenalty real (Paso 2 del encargo): 0 si el hook real no
 * calza ningún patrón genérico real de la lista. Si calza uno, la
 * penalización real es inversamente proporcional al contexto real que YA
 * tiene (instructionAlignment/angleAlignment, mismas señales reales que el
 * resto del score) -- un hook genérico CON contexto real específico se
 * penaliza poco; uno genérico y descontextualizado se penaliza fuerte.
 */
function computeGenericPatternPenalty({ hookText, instructionAlignment, angleAlignment }) {
  if (!matchesGenericHookPattern(hookText)) return 0;
  const contexto = Math.max(instructionAlignment, angleAlignment);
  return Math.max(0, 0.5 * (1 - contexto));
}

/**
 * hookSpecificityScore real (Paso 3 del encargo): un hook real debe poder
 * anclarse a situación/audiencia/ángulo/contexto real -- se aproxima real
 * combinando (a) densidad real de contenido propio (palabras significativas
 * reales del hook, nunca stopwords) y (b) el mismo alignment real contra
 * instrucción/ángulo ya calculado (nunca un segundo cálculo paralelo).
 * "Esto es otro nivel." (2 palabras significativas reales, sin alignment
 * real) puntúa bajo real; "Hay mañanas que empiezan de otra manera."
 * (más contenido real + alignment real) puntúa alto real.
 */
function computeHookSpecificity({ hookText, instructionAlignment, angleAlignment }) {
  const palabras = significantWords(hookText);
  const densidadContenido = Math.min(1, palabras.length / 4);
  return clamp01(0.20 + (0.40 * densidadContenido) + (0.25 * instructionAlignment) + (0.15 * angleAlignment));
}

// Naturalidad (Paso 4 del encargo): construcción "Si" real + infinitivo real
// sin sujeto/pronombre entre medio ("Si apoyar tu rutina...") es gramática
// real rota en español -- caso literal reportado en el encargo. Nunca un
// chequeo gramatical completo (eso requeriría un motor de lenguaje real
// nuevo, fuera de alcance) -- solo la construcción real ya identificada como
// problema real recurrente.
const AWKWARD_SI_INFINITIVE_RE = /\bsi\s+[a-z]+(ar|er|ir)\b/i;

/**
 * hookNaturalnessScore real (Paso 4 del encargo): heurística determinista
 * real (nunca una IA nueva revisando texto, Paso 5/6 de la corrección
 * anterior) -- penaliza construcciones reales conocidas como poco
 * naturales/gramaticalmente rotas/fragmentadas, nunca evalúa "belleza"
 * subjetiva.
 */
function computeHookNaturalness(hookText) {
  let score = 0.9;
  if (AWKWARD_SI_INFINITIVE_RE.test(hookText)) score -= 0.35;
  const comas = (hookText.match(/,/g) ?? []).length;
  if (comas >= 3) score -= 0.15;
  if (significantWords(hookText).length <= 1) score -= 0.25;
  if (/\.\.\.$|--$/.test(hookText.trim())) score -= 0.1;
  return clamp01(score);
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
 * de keywords inventada aparte).
 *
 * Score compuesto (Corrección "Refinamiento creativo", Paso 5 del encargo):
 * hookRelevanceScore (BASE+alignment) + naturalidad + especificidad -
 * repetitionPenalty - genericPatternPenalty. hookRelevanceScore real se
 * sigue exponiendo tal cual (consumido por creativeQualityAutoQA.js/
 * generation.js) -- nunca se le resta ahí la repetición, que ahora vive
 * SOLO en el score compuesto real (totalScore), para no penalizarla dos
 * veces.
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
  // relevanceComponent: SOLO la señal real de coincidencia con
  // instrucción/ángulo -- pieza interna del score compuesto real
  // (totalScore, abajo), NUNCA el "hookRelevanceScore" público (ese sigue
  // siendo el score compuesto completo real, mismo nombre/significado real
  // ya consumido por generation.js/creativeQualityAutoQA.js/UI -- Paso 21
  // del encargo: nunca romper un contrato real ya validado).
  const relevanceComponent = clamp01(BASE + (0.30 * instructionAlignment) + (0.15 * angleAlignment));
  const hookNaturalnessScore = computeHookNaturalness(hookText);
  const hookSpecificityScore = computeHookSpecificity({ hookText, instructionAlignment, angleAlignment });
  const genericPatternPenalty = computeGenericPatternPenalty({ hookText, instructionAlignment, angleAlignment });

  const totalScore = clamp01(
    (0.45 * relevanceComponent) + (0.25 * hookNaturalnessScore) + (0.20 * hookSpecificityScore)
    - (0.45 * repetitionPenalty) - genericPatternPenalty,
  );

  return {
    totalScore, instructionAlignment, angleAlignment, repetitionPenalty,
    hookNaturalnessScore, hookSpecificityScore, genericPatternPenalty,
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
    // Hook Quality Gate (Paso 6 del encargo "Refinamiento creativo"): un
    // candidato real solo detiene la búsqueda temprano si cruza los TRES
    // umbrales reales a la vez (score global + naturalidad + especificidad)
    // -- un score global alto real con naturalidad/especificidad reales
    // bajas sigue intentando (hasta agotar maxRounds), nunca se acepta con
    // un solo criterio real cumplido.
    const pasaGateCompleto = (c) => c.totalScore >= MIN_ACCEPTABLE_HOOK_SCORE
      && c.hookNaturalnessScore >= MIN_HOOK_NATURALNESS_SCORE && c.hookSpecificityScore >= MIN_HOOK_SPECIFICITY_SCORE;
    const mejorHastaAhora = allCandidates.reduce((best, c) => (!best || c.totalScore > best.totalScore ? c : best), null);
    if (mejorHastaAhora && pasaGateCompleto(mejorHastaAhora)) break;
    round += 1;
  }

  if (allCandidates.length === 0) {
    throw new Error('selectHook: ningún candidato real de hook pasó Claim Safety -- no se puede seleccionar un hook real.');
  }

  // Ranking real (Paso 8 del encargo): entre candidatos que YA cruzan el
  // gate completo real, gana el de mayor totalScore real; si NINGUNO lo
  // cruza (Paso 6: "usar el mejor disponible"), gana el de mayor totalScore
  // real entre todos -- LOW_CONFIDENCE real, nunca bloquea la campaña.
  const conGateCompleto = allCandidates.filter((c) => (
    c.totalScore >= MIN_ACCEPTABLE_HOOK_SCORE && c.hookNaturalnessScore >= MIN_HOOK_NATURALNESS_SCORE && c.hookSpecificityScore >= MIN_HOOK_SPECIFICITY_SCORE
  ));
  const poolGanador = conGateCompleto.length > 0 ? conGateCompleto : allCandidates;
  const best = poolGanador.reduce((top, c) => (c.totalScore > top.totalScore ? c : top), poolGanador[0]);
  const hookQualityStatus = conGateCompleto.includes(best) ? 'ACCEPTED' : 'LOW_CONFIDENCE';

  return Object.freeze({
    hook: best.hook,
    hookId: best.hookId,
    hookType: Object.freeze({ id: best.hookId, label: HOOK_TYPE_LABELS[best.hookId] ?? best.hookId }),
    hookRelevanceScore: best.totalScore,
    hookQualityStatus,
    // Naturalidad/Especificidad (Paso 1/3/4 del encargo): expuestas para
    // que el Dashboard/Auto-QA las muestren/reutilicen tal cual, nunca
    // recalculadas aparte.
    hookNaturalnessScore: best.hookNaturalnessScore,
    hookSpecificityScore: best.hookSpecificityScore,
    genericPatternPenalty: best.genericPatternPenalty,
    // repetitionPenalty (Paso 8/9 del encargo "Cierre del Creative
    // Director"): expuesto para que creativeQualityAutoQA.js lo reutilice
    // TAL CUAL -- nunca recalculado aparte.
    repetitionPenalty: best.repetitionPenalty,
    copy: best.copy,
    candidates: Object.freeze(allCandidates.map((c) => Object.freeze({
      hookId: c.hookId, hook: c.hook, totalScore: c.totalScore, hookNaturalnessScore: c.hookNaturalnessScore, hookSpecificityScore: c.hookSpecificityScore,
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
  return Object.freeze({
    hookRelevanceScore: scored.totalScore, repetitionPenalty: scored.repetitionPenalty,
    hookNaturalnessScore: scored.hookNaturalnessScore, hookSpecificityScore: scored.hookSpecificityScore, genericPatternPenalty: scored.genericPatternPenalty,
  });
}
