// traceability.js — Resuelve una PatternReference hasta su fuente original
// (§10 del encargo): ContentBrief → inference_id/observation_id → raw_id → URL.
//
// Este es el ÚNICO punto donde Website Intelligence lee (nunca escribe)
// dentro de marketing-intelligence — es exactamente la integración que la
// Fase 6 definió como necesaria ("ContentBrief consume Marketing
// Intelligence"), no una dependencia oculta. Los stores se inyectan por
// parámetro: este archivo nunca conoce la ruta real de los datos de
// marketing-intelligence, así que puede probarse con datos reales sin
// acoplar el módulo a esa ruta.
//
// Para source_module: 'website_intelligence' no hay nada que resolver
// todavía — esta fase solo define el contrato, no el RawStore/
// IntelligenceStore de Website Intelligence (esos llegan en una fase
// posterior, cuando se autorice construir el motor de adquisición).

export function traceReference(reference, { rawStore, intelligenceStore } = {}) {
  if (reference.source_module === 'website_intelligence') {
    return {
      status: 'pending',
      reason: 'Website Intelligence no tiene todavía RawStore/IntelligenceStore propios (Fase 7 es solo contrato) — trazabilidad pendiente hasta que se autorice esa fase.',
      reference,
    };
  }

  if (reference.source_module !== 'marketing_intelligence') {
    throw new Error(`traceReference: source_module desconocido "${reference.source_module}"`);
  }
  if (!rawStore || !intelligenceStore) {
    throw new Error('traceReference: se requieren rawStore e intelligenceStore reales de marketing-intelligence para resolver esta referencia.');
  }

  let hypothesis = null;
  let inference = null;
  let observation = null;

  if (reference.reference_type === 'hypothesis') {
    hypothesis = intelligenceStore.loadAll('hypothesis').find((h) => h.hypothesis_id === reference.reference_id) ?? null;
    if (!hypothesis) return { status: 'not_found', reference };
    inference = intelligenceStore.loadAll('inference').find((i) => i.inference_id === hypothesis.based_on_inference_id) ?? null;
  } else if (reference.reference_type === 'inference') {
    inference = intelligenceStore.loadAll('inference').find((i) => i.inference_id === reference.reference_id) ?? null;
    if (!inference) return { status: 'not_found', reference };
  }

  if (inference) {
    const observationId = inference.based_on_observation_ids?.[0] ?? null;
    if (observationId) {
      observation = intelligenceStore.loadAll('observation').find((o) => o.observation_id === observationId) ?? null;
    }
  } else if (reference.reference_type === 'observation') {
    observation = intelligenceStore.loadAll('observation').find((o) => o.observation_id === reference.reference_id) ?? null;
    if (!observation) return { status: 'not_found', reference };
  }

  const rawId = observation ? (observation.raw_id ?? observation.source_record_id) : null;
  const rawRecord = rawId ? rawStore.loadByRecordId(rawId) : null;

  return {
    status: 'resolved',
    reference,
    chain: {
      hypothesis,
      inference,
      observation,
      raw_id: rawRecord?.record_id ?? null,
      url: rawRecord?.url ?? null,
    },
  };
}
