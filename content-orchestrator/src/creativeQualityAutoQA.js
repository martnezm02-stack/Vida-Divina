// creativeQualityAutoQA.js — Corrección "Cierre del Creative Director"
// (2026-08-28, Paso 1/2/3/4/5/6 del encargo). Auto-QA GLOBAL de una
// propuesta ya construida -- nunca reconstruye hook/script/voiceover/
// visualIntent desde cero solo para evaluarlos (Paso 7: "usar los datos
// reales ya generados"), nunca un motor paralelo: cada componente del
// score real lee campos YA calculados por creativeAngleSelector.js/
// hookIntelligence.js/claimRelevance.js/creativeStructureEngine.js/
// creativeDirector.js.

export const MIN_CREATIVE_QUALITY_SCORE = 0.70;
const MAX_REPAIR_ROUNDS = 2;

// Ponderación real del encargo (Paso 2) -- suma 1.0.
const WEIGHTS = Object.freeze({
  hook: 0.20, angle: 0.15, claim: 0.15, structure: 0.10, scriptVoice: 0.15, visual: 0.15, continuity: 0.05, repetition: 0.05,
});

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

/** hookScore real: exactamente el score real ya calculado por hookIntelligence.js -- nunca recalculado aparte. */
function scoreHook(hookRelevanceScore) {
  return clamp01(hookRelevanceScore ?? 0);
}

/** angleScore real: 1.0 si hay un ángulo real elegido con instrucción real que lo respalde; degradado sin instrucción real (no verificable), 0 sin ningún ángulo real. */
function scoreAngle({ primaryAngle, hadUserInstruction }) {
  if (!primaryAngle) return 0;
  return hadUserInstruction ? 1 : 0.5;
}

/** claimScore real: penaliza una propuesta real sin ningún claim CORE real (cayó a un fallback sin señal real de relevancia). */
function scoreClaims(relevantClaims) {
  if (!relevantClaims) return 0.6; // sin filtrado real (compatibilidad hacia atrás) -- ni mejor ni peor, neutral real.
  if (relevantClaims.core?.length > 0) return 1;
  if (relevantClaims.supporting?.length > 0) return 0.6;
  return 0.3;
}

/** structureScore real: 1.0 con una estructura real ya recomendada/elegida, degradado en LEGACY_STRUCTURE real (fallback sin instrucción/campaignIntent real). */
function scoreStructure(structureId) {
  if (!structureId) return 0.5;
  return structureId.startsWith('LEGACY_') ? 0.6 : 1;
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

/** continuityScore real: 1.0 con visualContinuityContext real activo, degradado sin él (nunca 0 -- sigue siendo una pieza real producible). */
function scoreContinuity(visualContinuityContext) {
  return visualContinuityContext?.characterContinuityRequired ? 1 : 0.7;
}

/** repetitionPenalty real: 1.0 = sin penalización real -- reutiliza el repetitionPenalty real YA calculado por hookIntelligence.js para el candidato ganador (Paso 8/9, nunca recalculado aparte). */
function scoreRepetition(hookRepetitionPenalty) {
  return clamp01(1 - (hookRepetitionPenalty ?? 0));
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
  relevantClaims, structureId, copy, visualIntent, visualContinuityContext,
}) {
  const hookScore = scoreHook(hookRelevanceScore);
  const angleScore = scoreAngle({ primaryAngle, hadUserInstruction });
  const claimScore = scoreClaims(relevantClaims);
  const structureScore = scoreStructure(structureId);
  const scriptVoiceScore = scoreScriptVoice(copy);
  const visualScore = scoreVisual(visualIntent);
  const continuityScore = scoreContinuity(visualContinuityContext);
  const repetitionPenalty = scoreRepetition(hookRepetitionPenalty);

  const creativeQualityScore = clamp01(
    (WEIGHTS.hook * hookScore) + (WEIGHTS.angle * angleScore) + (WEIGHTS.claim * claimScore)
    + (WEIGHTS.structure * structureScore) + (WEIGHTS.scriptVoice * scriptVoiceScore) + (WEIGHTS.visual * visualScore)
    + (WEIGHTS.continuity * continuityScore) + (WEIGHTS.repetition * repetitionPenalty),
  );

  return Object.freeze({
    creativeQualityScore,
    creativeQualityStatus: creativeQualityScore >= MIN_CREATIVE_QUALITY_SCORE ? 'ACCEPTED' : 'LOW_CONFIDENCE',
    components: Object.freeze({
      hookScore, angleScore, claimScore, structureScore, scriptVoiceScore, visualScore, continuityScore, repetitionPenalty,
    }),
  });
}

export { MAX_REPAIR_ROUNDS };
