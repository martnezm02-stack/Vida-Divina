// websitePatternHypothesis.js — Etapa C: Hipótesis especulativa a partir de
// una Inferencia de patrones de sitios de referencia.
//
// Regla dura específica de esta fase (§8 del encargo): NUNCA afirmar
// causalidad ("esta estructura convierte mejor") solo porque un patrón
// aparece con frecuencia — toda hipótesis se redacta explícitamente como
// especulativa y sin evidencia de rendimiento real, exactamente igual que
// marketing-intelligence hace con sus propias hipótesis.

import { randomUUID } from 'node:crypto';

const HYPOTHESIS_TEMPLATES = {
  CONVERSION_FLOW: (pattern) =>
    `La secuencia "${pattern}" podría facilitar la conversión, pero esto no está demostrado — no hay evidencia de rendimiento real (tasa de conversión) que respalde que esta estructura funcione mejor que otra.`,
  NAVIGATION: (pattern) =>
    `El patrón de navegación "${pattern}" podría facilitar el uso del sitio, pero es una especulación sin datos de usabilidad propios.`,
  INTERACTION_PATTERN: (pattern) =>
    `El patrón de interacción "${pattern}" podría mejorar el engagement, pero no se probó con usuarios reales de Vida Divina.`,
};

export function generateWebsitePatternHypotheses(inferences) {
  return inferences.map((inference) => {
    const template = HYPOTHESIS_TEMPLATES[inference.dimension];
    const text = template
      ? template(inference.pattern)
      : `El patrón "${inference.pattern}" (dimensión: ${inference.dimension}) podría tener algún efecto, pero esto es especulativo y no está verificado con datos propios de Vida Divina.`;

    return {
      hypothesis_id: randomUUID(),
      dimension: inference.dimension,
      hypothesis: text,
      basis: 'HIPOTESIS',
      requires_review: true,
      based_on_inference_id: inference.inference_id,
      retrieved_at: new Date().toISOString(),
    };
  });
}
