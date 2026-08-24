// audience.js — AUDIENCE_OBSERVED (mencionada explícitamente en el texto) vs
// AUDIENCE_INFERRED (deducida de tono/vocabulario).
//
// LIMITACIÓN DELIBERADA de esta versión basada en reglas: solo se implementa
// AUDIENCE_OBSERVED. AUDIENCE_INFERRED requiere razonamiento sobre tono y
// vocabulario que un LLM real podría aportar — intentarlo con regex sería
// inventar demografía sin respaldo, exactamente lo que el encargo prohíbe.
// Por eso esta fase nunca produce AUDIENCE_INFERRED: mejor "not_detected"
// honesto que una suposición no verificable.

const AUDIENCE_PATTERN = /\b(?:for|para)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\b/i;

export function detectAudience(content) {
  const match = content.match(AUDIENCE_PATTERN);
  if (!match) return [];

  return [{
    dimension: 'AUDIENCE',
    value: match[1].trim(),
    audience_basis: 'AUDIENCE_OBSERVED',
    evidence_quote: match[0].trim(),
    confidence: 0.4,
    confidence_basis: 'Coincidencia de patrón "para/for [audiencia]" mencionado explícitamente en el texto — no es una inferencia demográfica.',
  }];
}
