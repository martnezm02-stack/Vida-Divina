// hypothesis.js — Etapa C del pipeline: Hipótesis especulativa a partir de una
// inferencia.
//
// Plantillas deterministas para este MVP (sin modelo de IA todavía). Toda
// hipótesis queda marcada requires_review: true — nunca se presenta como
// hecho verificado, y nunca se promueve automáticamente a una etapa
// posterior sin revisión humana.

import { randomUUID } from 'node:crypto';

const HYPOTHESIS_TEMPLATES = {
  hook: (value) =>
    `El patrón "${value}" podría aumentar la atención inicial del lector, pero esto no está verificado — requiere validación con datos de rendimiento reales.`,
  cta: (value) =>
    `El uso de "${value}" como llamada a la acción podría influir en la tasa de conversión, pero se requiere una prueba controlada para confirmarlo.`,
  mecanismo: (value) =>
    `El mecanismo de "${value}" podría generar una respuesta más rápida del lector, pero es una especulación sin evidencia de desempeño propia.`,
};

export function generateHypotheses(inferences) {
  return inferences.map((inference) => {
    const template = HYPOTHESIS_TEMPLATES[inference.dimension];
    const text = template
      ? template(inference.pattern)
      : `El patrón "${inference.pattern}" (dimensión: ${inference.dimension}) podría tener algún efecto, pero esto es especulativo y no está verificado.`;

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
