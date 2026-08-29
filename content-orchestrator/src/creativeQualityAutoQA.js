// creativeQualityAutoQA.js — Corrección "Cierre del Creative Director"
// (2026-08-28, Paso 1/2/3/4/5/6 del encargo). Auto-QA GLOBAL de una
// propuesta ya construida -- nunca reconstruye hook/script/voiceover/
// visualIntent desde cero solo para evaluarlos (Paso 7: "usar los datos
// reales ya generados"), nunca un motor paralelo: cada componente del
// score real lee campos YA calculados por creativeAngleSelector.js/
// hookIntelligence.js/claimRelevance.js/creativeStructureEngine.js/
// creativeDirector.js.

export const MIN_CREATIVE_QUALITY_SCORE = 0.70;
// Corrección "Corrección integral del flujo de Crear contenido"
// (2026-08-28, Paso 37 del encargo): mismo umbral real 0.70 -- gates
// ADICIONALES reales, nunca sustituyen creativeQualityScore, se aplican
// aparte (Paso 37: "no marcar ACCEPTED si X < 0.70").
export const MIN_INSTRUCTION_COVERAGE_SCORE = 0.70;
export const MIN_NARRATIVE_ALIGNMENT_SCORE = 0.70;
const MAX_REPAIR_ROUNDS = 2;

// Ponderación real del encargo (Paso 2) -- suma 1.0.
const WEIGHTS = Object.freeze({
  hook: 0.20, angle: 0.15, claim: 0.15, structure: 0.10, scriptVoice: 0.15, visual: 0.15, continuity: 0.05, repetition: 0.05,
});

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

/**
 * hookScore real (Corrección "Refinamiento creativo", 2026-08-28, Paso 14
 * del encargo): combina hookRelevanceScore + hookNaturalnessScore +
 * hookSpecificityScore -- los TRES ya calculados por hookIntelligence.js,
 * nunca recalculados aparte. Sigue ocupando el MISMO slot real de
 * WEIGHTS.hook (nunca un score paralelo, Paso 14: "agregar estos factores
 * sin crear otro score paralelo"). Sin naturalidad/especificidad reales
 * (compatibilidad hacia atrás, llamador preexistente), se degrada a
 * exactamente el comportamiento real de antes (solo hookRelevanceScore).
 */
function scoreHook({ hookRelevanceScore, hookNaturalnessScore = null, hookSpecificityScore = null }) {
  const relevancia = clamp01(hookRelevanceScore ?? 0);
  if (hookNaturalnessScore === null && hookSpecificityScore === null) return relevancia;
  return clamp01((0.5 * relevancia) + (0.25 * clamp01(hookNaturalnessScore ?? relevancia)) + (0.25 * clamp01(hookSpecificityScore ?? relevancia)));
}

/** angleScore real: 1.0 si hay un ángulo real elegido con instrucción real que lo respalde; degradado sin instrucción real (no verificable), 0 sin ningún ángulo real. */
function scoreAngle({ primaryAngle, hadUserInstruction }) {
  if (!primaryAngle) return 0;
  return hadUserInstruction ? 1 : 0.5;
}

/**
 * claimScore real: penaliza una propuesta real sin ningún claim CORE real
 * (cayó a un fallback sin señal real de relevancia) -- y ahora también
 * claimCoherence real (Paso 14/13 del encargo): una propuesta real con
 * DEMASIADOS claims CORE (sobrecargada, más de maxCoreClaims=2 reales) se
 * penaliza -- "1-2 CORE + 0-1 SUPPORTING cuando sea suficiente" (Paso 13).
 */
function scoreClaims(relevantClaims) {
  if (!relevantClaims) return 0.6; // sin filtrado real (compatibilidad hacia atrás) -- ni mejor ni peor, neutral real.
  const coreCount = relevantClaims.core?.length ?? 0;
  if (coreCount === 0) return relevantClaims.supporting?.length > 0 ? 0.6 : 0.3;
  if (coreCount > 2) return 0.7; // claimCoherence real: sobrecargado, nunca 0 (sigue siendo un claim real válido, solo menos coherente/enfocado).
  return 1;
}

/**
 * structureScore real: 1.0 con una estructura real ya recomendada/elegida,
 * degradado en LEGACY_STRUCTURE real (fallback sin instrucción/
 * campaignIntent real). structureDiversityContext real (Paso 14/26 del
 * encargo, opcional): penaliza si ESTA estructura real ya se usó en otra
 * variante real de la MISMA campaña (previousStructureIds), reforzando (sin
 * duplicar) el mismo criterio real ya aplicado en creativeStructureEngine.js.
 */
function scoreStructure(structureId, previousStructureIds = []) {
  if (!structureId) return 0.5;
  const base = structureId.startsWith('LEGACY_') ? 0.6 : 1;
  const yaUsada = previousStructureIds.includes(structureId);
  return yaUsada ? clamp01(base - 0.25) : base;
}

/** scriptVoiceScore real: garantía ESTRUCTURAL real de generateVariantCopy() (voiceover:[hook,...bodyLines]) -- 1.0 salvo que el hook real ya no encabece el voiceover real (nunca debería ocurrir por diseño, defensivo). */
function scoreScriptVoice(copy) {
  if (!copy?.hook || !Array.isArray(copy?.voiceover)) return 0.5;
  return copy.voiceover[0] === copy.hook ? 1 : 0.2;
}

const GENERIC_VISUAL_INTENT_REAL = 'Explicación clara y visual relacionada con esta campaña.';
/** visualScore real: penaliza fuerte el default genérico real ya identificado (Paso 18/20 de la corrección anterior). */
function scoreVisual(visualIntent) {
  if (!visualIntent) return 0.3;
  return visualIntent === GENERIC_VISUAL_INTENT_REAL ? 0.3 : 1;
}

/**
 * continuityScore real: 1.0 con visualContinuityContext real activo,
 * degradado sin él (nunca 0 -- sigue siendo una pieza real producible).
 * instructionCoverageScore real (Paso 14/36 del encargo, opcional): YA
 * calculado por creativeDirector.js#buildVisualStrategy() -- si las
 * señales reales de subject/environment NO llegaron al prompt real final,
 * este componente cae, aunque characterContinuityRequired sea true (Paso
 * 15: "reparar antes de producir" -- root cause real del Problema 2).
 */
function scoreContinuity(visualContinuityContext, instructionCoverageScore = null) {
  const base = visualContinuityContext?.characterContinuityRequired ? 1 : 0.7;
  if (instructionCoverageScore === null) return base;
  return clamp01((base + clamp01(instructionCoverageScore)) / 2);
}

/** repetitionPenalty real: 1.0 = sin penalización real -- reutiliza el repetitionPenalty real YA calculado por hookIntelligence.js para el candidato ganador (Paso 8/9, nunca recalculado aparte). */
function scoreRepetition(hookRepetitionPenalty) {
  return clamp01(1 - (hookRepetitionPenalty ?? 0));
}

/**
 * narrativeAlignmentScore real (Paso 36 del encargo): "¿la historia
 * (ángulo + estructura + claims) alinea con la estrategia creativa ya
 * elegida?" -- compuesto real de scores YA calculados arriba (angleScore/
 * structureScore/claimScore), nunca un cálculo nuevo/paralelo (Paso 14 del
 * encargo anterior, mismo criterio: "sin crear otro score paralelo").
 */
function scoreNarrativeAlignment({ angleScore, structureScore, claimScore }) {
  return clamp01((angleScore + structureScore + claimScore) / 3);
}

/**
 * Auto-QA global real de una propuesta YA construida (Paso 1/7 del
 * encargo) -- SOLO lee, nunca reconstruye. Devuelve el score real
 * compuesto + cada componente real (Paso 3: visibilidad interna).
 *
 * @param {{
 *   primaryAngle:?object, hadUserInstruction:boolean, hookRelevanceScore:?number,
 *   hookRepetitionPenalty?:?number, relevantClaims:?object, structureId:?string,
 *   copy:?object, visualIntent:?string, visualContinuityContext:?object,
 * }} args
 */
export function evaluateCreativeProposal({
  primaryAngle, hadUserInstruction = false, hookRelevanceScore, hookRepetitionPenalty = 0,
  // hookNaturalnessScore/hookSpecificityScore (Paso 1/3/14 del encargo
  // "Refinamiento creativo"): opcionales, YA calculados por
  // hookIntelligence.js -- nunca recalculados aparte.
  hookNaturalnessScore = null, hookSpecificityScore = null,
  relevantClaims, structureId, copy, visualIntent, visualContinuityContext,
  // previousStructureIds (Paso 14/26 del encargo): opcional, structureId
  // reales ya usados en otras variantes de ESTA campaña real.
  previousStructureIds = [],
  // instructionCoverageScore/instructionCoverageMissing (Paso 14/15/36/37
  // del encargo "Corrección integral del flujo de Crear contenido"):
  // opcionales, YA calculados por creativeDirector.js#buildVisualStrategy()
  // -- nunca recalculados aparte.
  instructionCoverageScore = null, instructionCoverageMissing = [],
}) {
  const hookScore = scoreHook({ hookRelevanceScore, hookNaturalnessScore, hookSpecificityScore });
  const angleScore = scoreAngle({ primaryAngle, hadUserInstruction });
  const claimScore = scoreClaims(relevantClaims);
  const structureScore = scoreStructure(structureId, previousStructureIds);
  const scriptVoiceScore = scoreScriptVoice(copy);
  const visualScore = scoreVisual(visualIntent);
  const continuityScore = scoreContinuity(visualContinuityContext, instructionCoverageScore);
  const repetitionPenalty = scoreRepetition(hookRepetitionPenalty);
  const narrativeAlignmentScore = scoreNarrativeAlignment({ angleScore, structureScore, claimScore });

  const creativeQualityScore = clamp01(
    (WEIGHTS.hook * hookScore) + (WEIGHTS.angle * angleScore) + (WEIGHTS.claim * claimScore)
    + (WEIGHTS.structure * structureScore) + (WEIGHTS.scriptVoice * scriptVoiceScore) + (WEIGHTS.visual * visualScore)
    + (WEIGHTS.continuity * continuityScore) + (WEIGHTS.repetition * repetitionPenalty),
  );

  // Quality Gates (Paso 37 del encargo): NO marcar ACCEPTED si
  // creativeQualityScore/instructionCoverageScore/narrativeAlignmentScore
  // real caen bajo 0.70, O si el subject lock real falla (una señal real
  // de género/edad ya detectada que NO llegó al prompt real final) --
  // gates ADICIONALES reales, nunca sustituyen el score compuesto real.
  const subjectLockOk = !instructionCoverageMissing.includes('subjectGender');
  const accepted = creativeQualityScore >= MIN_CREATIVE_QUALITY_SCORE
    && (instructionCoverageScore === null || instructionCoverageScore >= MIN_INSTRUCTION_COVERAGE_SCORE)
    && narrativeAlignmentScore >= MIN_NARRATIVE_ALIGNMENT_SCORE
    && subjectLockOk;

  return Object.freeze({
    creativeQualityScore,
    creativeQualityStatus: accepted ? 'ACCEPTED' : 'LOW_CONFIDENCE',
    instructionCoverageScore,
    narrativeAlignmentScore,
    subjectLockOk,
    components: Object.freeze({
      hookScore, angleScore, claimScore, structureScore, scriptVoiceScore, visualScore, continuityScore, repetitionPenalty,
    }),
  });
}

export { MAX_REPAIR_ROUNDS };
