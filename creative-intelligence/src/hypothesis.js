// hypothesis.js — Pillar 5 (Prompt 9), fórmula fija del framework.
//
// FRAMEWORK ORIGINAL: "If we ship [angle] in [format] targeting [persona]
// at [awareness], we expect [specific outcome] because [mechanism]."
// Variante en español, dada en la fase de Competitive Research Procedure:
// "Si producimos [concepto] para [persona], utilizando [pain] y [angle] en
// [format] para [awareness], esperamos [resultado específico] porque
// [razón/mecanismo]." — ambas coexisten, ninguna reemplaza a la otra.
//
// Regla no negociable: una Hypothesis NUNCA es un Result. Estructuralmente
// no tiene ningún campo para un desenlace medido — createHypothesis()
// rechaza explícitamente cualquier intento de colar "result"/
// "actualOutcome"/"measuredOutcome" en el objeto.

import { randomUUID } from 'node:crypto';
import { assertValidAwarenessStage } from './awareness.js';

const FORBIDDEN_RESULT_FIELDS = ['result', 'actualOutcome', 'measuredOutcome', 'achieved', 'performanceSnapshotId'];

export function createHypothesis({
  creativeCellId,
  targetPersona,
  awareness,
  angle,
  format,
  expectedOutcome,
  mechanism,
  rationale = null,
  ...rest
}) {
  for (const forbidden of FORBIDDEN_RESULT_FIELDS) {
    if (forbidden in rest) {
      throw new Error(`Hypothesis: el campo "${forbidden}" no pertenece a una Hypothesis — una hipótesis nunca es un resultado (ver evidenceTaxonomy.js para Result/Learning).`);
    }
  }
  if (!creativeCellId) throw new Error('Hypothesis: "creativeCellId" es obligatorio — toda hipótesis pertenece a una CreativeCell.');
  if (!targetPersona?.trim()) throw new Error('Hypothesis: "targetPersona" es obligatorio.');
  assertValidAwarenessStage(awareness);
  if (!angle?.trim()) throw new Error('Hypothesis: "angle" es obligatorio.');
  if (!format?.trim()) throw new Error('Hypothesis: "format" es obligatorio.');
  if (!expectedOutcome?.trim()) throw new Error('Hypothesis: "expectedOutcome" es obligatorio — nunca una hipótesis sin resultado esperado específico (Prompt 9).');
  if (!mechanism?.trim()) throw new Error('Hypothesis: "mechanism" es obligatorio — nunca una hipótesis sin el "because [mechanism]" (Prompt 9).');

  return Object.freeze({
    hypothesisId: randomUUID(),
    type: 'HYPOTHESIS', // nunca 'RESULT' — marcador explícito, ver evidenceTaxonomy.js
    creativeCellId,
    targetPersona,
    awareness,
    angle,
    format,
    expectedOutcome,
    mechanism,
    rationale,
    createdAt: new Date().toISOString(),
  });
}

export function validateHypothesis(hypothesis) {
  createHypothesis(hypothesis);
  return true;
}

/** Renderiza la fórmula original en inglés (Prompt 9), tal cual. */
export function renderHypothesisStatementEN(hypothesis) {
  validateHypothesis(hypothesis);
  return `If we ship ${hypothesis.angle} in ${hypothesis.format} targeting ${hypothesis.targetPersona} at ${hypothesis.awareness}, we expect ${hypothesis.expectedOutcome} because ${hypothesis.mechanism}.`;
}

/** Renderiza la variante en español dada para conceptos de origen competitivo. */
export function renderHypothesisStatementES(hypothesis, { concepto, pain }) {
  validateHypothesis(hypothesis);
  if (!concepto?.trim() || !pain?.trim()) {
    throw new Error('renderHypothesisStatementES: se requieren "concepto" y "pain" para la variante en español.');
  }
  return `Si producimos ${concepto} para ${hypothesis.targetPersona}, utilizando ${pain} y ${hypothesis.angle} en ${hypothesis.format} para ${hypothesis.awareness}, esperamos ${hypothesis.expectedOutcome} porque ${hypothesis.mechanism}.`;
}
