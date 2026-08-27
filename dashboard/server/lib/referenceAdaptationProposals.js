// referenceAdaptationProposals.js — Adaptar contenido / Video de
// referencia (2026-08-26, enriquecido 2026-08-27 con Reference
// Intelligence). Convierte UN experimento de hipótesis real
// (buildHypothesisExperiment, vía suggestHypothesisVariantsCore -- MISMO
// Creative Strategy Engine que ya usan Crear Autónomo/Crear Contenido,
// nunca duplicado) en 2-3 "propuestas de adaptación" con etiquetas
// orientadas al video de referencia. NUNCA redacta copy nuevo aquí -- cada
// propuesta envuelve una variante real ya generada y aprobada por el
// Creative Quality Gate; esta capa solo añade metadata informativa (qué
// conserva/qué cambia) tomada del Reference Intelligence real
// (referenceIntelligence.js: technicalAnalysis + hook/narrativeStructure
// semánticos reales cuando están disponibles) -- nunca inventa un dato que
// el análisis real no tenga (available:false se refleja tal cual).

const ARCHETYPES = Object.freeze([
  {
    key: 'STRUCTURAL',
    label: 'Adaptación estructural',
    keeps: 'Mantiene el ritmo, la estructura de escenas y el tipo de hook de la referencia.',
    changes: 'Cambia producto, mensaje, visuales y CTA.',
  },
  {
    key: 'CREATIVE',
    label: 'Adaptación creativa',
    keeps: 'Mantiene la idea narrativa, la dinámica y la duración aproximada.',
    changes: 'Cambia estilo visual, hook y composición.',
  },
  {
    key: 'CONVERSION',
    label: 'Optimizada para conversión',
    keeps: 'Mantiene la estructura de alto impacto de la referencia.',
    changes: 'Optimiza hook, beneficio y CTA para conversión.',
  },
]);

/** "keeps" real -- si el Reference Intelligence detectó un tipo de hook y/o una estructura narrativa semántica reales, se citan tal cual (nunca inventados); si no, cae al texto genérico del arquetipo. */
function realKeepsText(archetype, referenceIntelligence) {
  const hookType = referenceIntelligence?.hook?.available ? referenceIntelligence.hook.type : null;
  const structure = referenceIntelligence?.narrativeStructure?.available ? referenceIntelligence.narrativeStructure.sequence.join(' → ') : null;
  if (archetype.key === 'STRUCTURAL' && (hookType || structure)) {
    const partes = [];
    if (structure) partes.push(`la estructura real detectada (${structure})`);
    partes.push('el ritmo de la referencia');
    if (hookType) partes.push(`un hook tipo "${hookType}"`);
    return `Mantiene ${partes.join(', ')}.`;
  }
  if (archetype.key === 'CREATIVE' && structure) {
    return `Mantiene la idea narrativa real (${structure}) y la duración aproximada.`;
  }
  return archetype.keeps;
}

/**
 * @param {object} hypothesisResult — resultado real HYPOTHESIS_EXPERIMENT_READY de suggestHypothesisVariantsCore() (batchId/variantsDetail reales ya persistidos).
 * @param {object} referenceIntelligence — Reference Intelligence real ya persistido (referenceAnalysisStore.js / referenceIntelligence.js): { technicalAnalysis, hook, narrativeStructure, cta, ... }.
 * @returns {Array<object>} 2-3 propuestas reales, cada una lista para producirse vía el pipeline YA existente (/api/create/produce con batchId+variantIndex).
 */
export function buildAdaptationProposals(hypothesisResult, referenceIntelligence) {
  if (hypothesisResult?.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
    throw new Error('buildAdaptationProposals: se requiere un experimento de hipótesis real ya listo (HYPOTHESIS_EXPERIMENT_READY).');
  }
  const variants = hypothesisResult.variantsDetail ?? [];
  const count = Math.min(ARCHETYPES.length, variants.length);
  const technicalAnalysis = referenceIntelligence?.technicalAnalysis ?? referenceIntelligence; // compat: technicalAnalysis "plano" (sin Reference Intelligence) si algún llamador todavía lo pasa así.
  const referenceDuration = typeof technicalAnalysis?.duration === 'number' ? technicalAnalysis.duration : null;
  const referenceSceneCount = technicalAnalysis?.pacing?.sceneCount ?? null;

  return Array.from({ length: count }, (_, i) => {
    const archetype = ARCHETYPES[i];
    const variant = variants[i];
    return Object.freeze({
      proposalKey: archetype.key,
      label: archetype.label,
      keeps: realKeepsText(archetype, referenceIntelligence),
      changes: archetype.changes,
      targetDurationSeconds: referenceDuration,
      targetSceneCount: referenceSceneCount,
      // Estructura/hook real detectados en la referencia (Reference
      // Intelligence) -- available:false explícito cuando no hay evidencia
      // real (nunca inventado), para que la UI lo muestre honestamente.
      referenceHook: referenceIntelligence?.hook ?? { available: false },
      referenceStructure: referenceIntelligence?.narrativeStructure ?? { available: false },
      visualStyle: variant.visualDirection?.aspectRatio ?? null,
      objective: variant.creativeVariant?.awareness ?? null,
      // Producto visible (nombreVisible, UX cleanup 2026-08-26) -- nunca el nombre técnico.
      productNombreVisible: hypothesisResult.product?.nombreVisible ?? hypothesisResult.product?.nombreComercial ?? null,
      hook: variant.copy?.hook ?? null,
      cta: variant.copy?.cta ?? null,
      // Handoff real al pipeline YA existente -- nunca un segundo pipeline
      // de producción (ver generation.js#handleProduceCreative, ya usado
      // por "Sugerir variantes -> PRODUCIR VIDEO REAL").
      batchId: hypothesisResult.batchId,
      variantIndex: i,
    });
  });
}

export { ARCHETYPES };
