// referenceAdaptationProposals.js — Adaptar contenido / Video de
// referencia (2026-08-26). Convierte UN experimento de hipótesis real
// (buildHypothesisExperiment, vía suggestHypothesisVariantsCore -- MISMO
// Creative Strategy Engine que ya usan Crear Autónomo/Crear Contenido,
// nunca duplicado) en 2-3 "propuestas de adaptación" con etiquetas
// orientadas al video de referencia. NUNCA redacta copy nuevo aquí -- cada
// propuesta envuelve una variante real ya generada y aprobada por el
// Creative Quality Gate; esta capa solo añade metadata informativa
// (qué conserva/qué cambia, duración/escenas objetivo tomadas del análisis
// técnico real de la referencia) para que la UI explique la adaptación.

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

/**
 * @param {object} hypothesisResult — resultado real HYPOTHESIS_EXPERIMENT_READY de suggestHypothesisVariantsCore() (batchId/variantsDetail reales ya persistidos).
 * @param {object} referenceAnalysis — ReferenceAnalysis real ya persistido (referenceAnalysisStore.js).
 * @returns {Array<object>} 2-3 propuestas reales, cada una lista para producirse vía el pipeline YA existente (/api/create/produce con batchId+variantIndex).
 */
export function buildAdaptationProposals(hypothesisResult, referenceAnalysis) {
  if (hypothesisResult?.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
    throw new Error('buildAdaptationProposals: se requiere un experimento de hipótesis real ya listo (HYPOTHESIS_EXPERIMENT_READY).');
  }
  const variants = hypothesisResult.variantsDetail ?? [];
  const count = Math.min(ARCHETYPES.length, variants.length);
  const referenceDuration = typeof referenceAnalysis?.duration === 'number' ? referenceAnalysis.duration : null;
  const referenceSceneCount = referenceAnalysis?.pacing?.sceneCount ?? null;

  return Array.from({ length: count }, (_, i) => {
    const archetype = ARCHETYPES[i];
    const variant = variants[i];
    return Object.freeze({
      proposalKey: archetype.key,
      label: archetype.label,
      keeps: archetype.keeps,
      changes: archetype.changes,
      targetDurationSeconds: referenceDuration,
      targetSceneCount: referenceSceneCount,
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
