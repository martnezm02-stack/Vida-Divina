// format.js — FORMAT se deriva de metadata estructurada del registro RAW
// (nunca del texto en sí), por eso su confianza es alta cuando el dato existe.
//
// NARRATIVE_STRUCTURE se deja explícitamente sin detector: identificar la
// estructura narrativa de una pieza (ej. "problema-agitación-solución")
// requiere comprender el texto completo, no un patrón de texto — es una
// capacidad reservada para un proveedor LLM real (ver taxonomy.js,
// RULE_BASED_COVERAGE.not_detected_by_rules).

export function detectFormat(_content, context) {
  if (!context?.platform_object_type) return [];

  return [{
    dimension: 'FORMAT',
    value: context.platform_object_type,
    evidence_quote: `metadata.platform_object_type = "${context.platform_object_type}"`,
    confidence: 0.9,
    confidence_basis: 'Derivado directamente de metadata estructurada del registro RAW, no de una inferencia sobre el texto.',
  }];
}
