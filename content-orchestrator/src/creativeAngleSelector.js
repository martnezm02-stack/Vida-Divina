// creativeAngleSelector.js — Corrección "Evolución integral del Creative
// Director" (2026-08-28, Paso 1/4 del encargo). Root cause real
// confirmado: handleProposeDirectCreative() (dashboard/server/routes/
// generation.js) ya genera N variantes reales (blueprints con angle+hook
// reales, ver creative-intelligence/src/marketingPlaybook.js#ANGLE_STRATEGIES/
// HOOK_STRATEGIES/generateBlueprintAtIndex -- Hook Intelligence YA EXISTE
// en sustancia, 7 ángulos × 11 tipos de hook, con renderHook()
// construyendo el hook real desde pain/mechanism reales, nunca
// inventando), pero elegía la PRIMERA variante compatible con VIDEO por
// orden de rotación -- userInstruction nunca influía en CUÁL de esas
// variantes reales se usaba. Este módulo SOLO decide cuál variante ya
// generada se usa -- nunca genera copy/hook nuevo (Paso 4/40 del encargo:
// "no crear un segundo motor de generación").

import { ANGLE_STRATEGIES, HOOK_STRATEGIES } from '../../creative-intelligence/src/marketingPlaybook.js';

function limpiar(texto) { return String(texto ?? '').toLowerCase().trim(); }
function contains(texto, patterns) { return patterns.some((re) => re.test(texto)); }

// Palabras clave reales por ángulo -- mismo criterio ya usado en todo el
// proyecto (KEYWORD_AFFINITY de visualTreatments.js, matchByInstruction de
// creativeStructureEngine.js): nunca decide por sí solo si no hay señal
// real, solo puntúa candidatos YA generados.
const ANGLE_KEYWORDS = Object.freeze({
  [ANGLE_STRATEGIES.CONVENIENCE.id]: [/f[aá]cil/i, /conveniente/i, /sin complicar/i, /pr[aá]ctico/i, /integrar(?:lo)?\s+(?:a|en)\s+(?:la|su|tu)\s+rutina/i],
  [ANGLE_STRATEGIES.MECHANISM.id]: [/ingredientes?/i, /f[oó]rmula/i, /mecanismo/i, /c[oó]mo funciona/i, /compuesto/i],
  [ANGLE_STRATEGIES.ASPIRATION.id]: [/mejor versi[oó]n/i, /aspiracional/i, /aspira/i, /lograr/i, /alcanzar/i, /segur[oa]\b/i],
  [ANGLE_STRATEGIES.COMPARISON.id]: [/comparad[oa]/i, /diferencia/i, /mejor que/i, /en vez de/i, /versus/i, /a diferencia de/i],
  [ANGLE_STRATEGIES.DISCOVERY.id]: [/descubr/i, /\bnuevo\b/i, /novedad/i, /todav[ií]a no conoce/i, /presentar/i],
  [ANGLE_STRATEGIES.PROBLEM_AGITATION.id]: [/problema/i, /\bdolor\b/i, /dificultad/i, /cansad[oa]/i, /incomod/i, /s[ií]ntomas?/i],
  [ANGLE_STRATEGIES.ROUTINE.id]: [/rutina/i, /ma[nñ]ana/i, /todos los d[ií]as/i, /cotidian/i, /antes del trabajo/i, /d[ií]a a d[ií]a/i, /jornada/i, /estilo de vida/i],
});

// Palabras clave reales por tipo de hook -- mismo catálogo de 11 tipos
// reales de marketingPlaybook.js#HOOK_STRATEGIES, nunca una taxonomía
// paralela (Paso 5 del encargo: "no crear un segundo motor").
const HOOK_KEYWORDS = Object.freeze({
  [HOOK_STRATEGIES.QUESTION.id]: [/\?/, /te has preguntado/i, /sab[ií]as que/i, /qu[eé] tal si/i],
  [HOOK_STRATEGIES.CURIOSITY.id]: [/curios/i, /secreto/i, /lo que nadie/i, /pocos saben/i],
  [HOOK_STRATEGIES.PATTERN_INTERRUPT.id]: [/espera/i, /det[eé]nte/i, /para todo/i, /olvida lo que sab[ií]as/i],
  [HOOK_STRATEGIES.CONTRARIAN.id]: [/no es lo que piensas/i, /al contrario/i, /\bmito\b/i, /\bfalso\b/i],
  [HOOK_STRATEGIES.POV.id]: [/\bpov\b/i, /desde tu perspectiva/i, /imagina que eres/i, /ponte en el lugar/i],
  [HOOK_STRATEGIES.DEMONSTRATION.id]: [/mira c[oó]mo/i, /te muestro/i, /paso a paso/i, /as[ií] se usa/i, /mostrando c[oó]mo/i],
  [HOOK_STRATEGIES.PROBLEM_RECOGNITION.id]: [/te ha pasado/i, /reconoces esto/i, /te identificas/i],
  [HOOK_STRATEGIES.STORY.id]: [/historia/i, /te cuento/i, /una ma[nñ]ana/i, /un d[ií]a (?:normal|cualquiera|cotidiano)/i, /situaci[oó]n real/i],
  [HOOK_STRATEGIES.TEXT_ON_SCREEN.id]: [/texto en pantalla/i, /lee esto/i],
  // verbal/visual: pattern-interrupt deliberadamente agnósticos de tema
  // (ver renderHook() en marketingPlaybook.js) -- sin keywords reales
  // propios, nunca inventadas solo para darles puntaje.
});

const HOOK_TYPE_LABELS = Object.freeze(
  Object.fromEntries(Object.values(HOOK_STRATEGIES).map((h) => [h.id, h.label])),
);
const ANGLE_LABELS = Object.freeze(
  Object.fromEntries(Object.values(ANGLE_STRATEGIES).map((a) => [a.id, a.label])),
);

function scoreKeywords(texto, patterns) {
  return (patterns ?? []).reduce((acc, re) => acc + (re.test(texto) ? 1 : 0), 0);
}

/**
 * Puntúa cada variante real YA GENERADA (nunca genera una nueva) contra
 * userInstruction real -- score real = coincidencias reales de keyword de
 * angle + hook. Nunca decide un ángulo/hook que la variante no tenga ya
 * (Paso 40: "la solución más simple compatible con la arquitectura
 * existente").
 *
 * @param {{userInstruction:?string, candidates: object[]}} args — candidates: variantsDetail reales (cada uno con .angleId/.hookId o .creativeVariant.angle/.hook, ver hypothesisCreativeEngine.js).
 * @returns {{selectedIndex:number, primaryAngle:?object, secondaryAngle:?object, hookType:?object, hookRelevanceScore:number, scored: object[]}}
 */
export function selectCreativeAngle({ userInstruction = null, candidates, previousAngles = [] }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('selectCreativeAngle: "candidates" debe ser un arreglo real no vacío de variantes ya generadas.');
  }
  const texto = limpiar(userInstruction);

  const scored = candidates.map((variant, index) => {
    const angleId = variant.angleId ?? variant.conceptId ?? null;
    const hookId = variant.hookId ?? null;
    const angleScore = texto ? scoreKeywords(texto, ANGLE_KEYWORDS[angleId]) : 0;
    const hookScore = texto ? scoreKeywords(texto, HOOK_KEYWORDS[hookId]) : 0;
    // Diversidad entre variantes (Corrección "Cierre del Creative
    // Director", 2026-08-28, Paso 11/12/13/16 del encargo): penalización
    // real SUAVE (nunca exclusión) cuando este angleId real ya se usó en
    // otra variante real de la MISMA corrida -- relevancia real sigue
    // dominando (Paso 13: "no elegir una variante peor solo para que sea
    // diferente"), esto solo desempata hacia una variante real distinta
    // cuando la relevancia real es comparable.
    const diversityPenalty = previousAngles.includes(angleId) ? 1 : 0;
    // El ángulo pesa el doble real que el hook (Paso 14 del encargo: "el
    // PRIMARY ANGLE debe dominar la pieza") -- un tipo de hook que
    // coincide por casualidad de vocabulario nunca debe ganarle a un
    // ángulo con señal real más fuerte y directa sobre el TEMA de la
    // instrucción.
    return {
      index, angleId, hookId, angleScore, hookScore, totalScore: (angleScore * 2) + hookScore - (0.5 * diversityPenalty),
    };
  });

  // Sin userInstruction real (compatibilidad hacia atrás, Paso 31 del
  // encargo anterior): todos los scores quedan en 0 -- se preserva EXACTAMENTE
  // el criterio preexistente (primer candidato compatible, índice 0 de los
  // ya filtrados por el llamador), nunca un cambio de comportamiento.
  let mejor = scored[0];
  for (const s of scored) {
    if (s.totalScore > mejor.totalScore) mejor = s;
  }

  // secondaryAngle real (Paso 2 del encargo): el ángulo real DISTINTO del
  // primario con mayor score real de instrucción entre TODOS los
  // candidatos reales (no solo el elegido) -- puramente descriptivo/
  // informativo (nunca fuerza que la variante elegida mezcle dos
  // ángulos, Paso 2: "no mezclar indiscriminadamente").
  const otros = scored.filter((s) => s.angleId !== mejor.angleId && s.angleScore > 0).sort((a, b) => b.angleScore - a.angleScore);
  const secondaryAngleId = otros[0]?.angleId ?? null;

  const maxPossibleScore = (Math.max(1, ...Object.values(ANGLE_KEYWORDS).map((k) => k.length)) * 2)
    + Math.max(1, ...Object.values(HOOK_KEYWORDS).map((k) => k?.length ?? 0));

  return Object.freeze({
    selectedIndex: mejor.index,
    primaryAngle: mejor.angleId ? Object.freeze({ id: mejor.angleId, label: ANGLE_LABELS[mejor.angleId] ?? mejor.angleId }) : null,
    secondaryAngle: secondaryAngleId ? Object.freeze({ id: secondaryAngleId, label: ANGLE_LABELS[secondaryAngleId] ?? secondaryAngleId }) : null,
    hookType: mejor.hookId ? Object.freeze({ id: mejor.hookId, label: HOOK_TYPE_LABELS[mejor.hookId] ?? mejor.hookId }) : null,
    // hookRelevanceScore (Paso 7 del encargo): normalizado real 0..1 --
    // determinista, nunca una IA nueva.
    hookRelevanceScore: texto ? Math.min(1, mejor.totalScore / maxPossibleScore) : 0,
    scored: Object.freeze(scored.map((s) => Object.freeze(s))),
  });
}

export { ANGLE_LABELS, HOOK_TYPE_LABELS, ANGLE_KEYWORDS, HOOK_KEYWORDS };
