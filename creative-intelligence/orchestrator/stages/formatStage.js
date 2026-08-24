// formatStage.js — Pillar 4 (Prompts 7 + 8) como etapa ejecutable.
//
// NO reimplementa ninguna regla de Format — la Format Library cerrada, la
// validación de structural signature (narrator/scene/editRhythm) y el
// cálculo de Andromeda Risk viven en src/format.js, invocados tal cual.
// Esta stage solo orquesta el lote y traduce el resultado de Andromeda en
// un warning accionable cuando el framework mismo señala concentración
// estructural.

import { createFormatDecision, computeAndromedaRisk } from '../../src/format.js';

/**
 * @param {{ formatCandidates: Array<Parameters<typeof createFormatDecision>[0]> }}
 */
export function runFormatStage({ formatCandidates }) {
  if (!Array.isArray(formatCandidates) || formatCandidates.length === 0) {
    throw new Error('runFormatStage: se requiere al menos 1 formatCandidate real.');
  }

  const formatDecisions = [];
  const warnings = [];

  for (const candidate of formatCandidates) {
    try {
      formatDecisions.push(createFormatDecision(candidate));
    } catch (err) {
      warnings.push({ type: 'FORMAT_CANDIDATE_REJECTED', angleId: candidate?.angleId, reason: err.message });
    }
  }

  if (formatDecisions.length === 0) {
    warnings.push({ type: 'INSUFFICIENT_DATA', stage: 'format', reason: 'Ningún formatCandidate produjo un FormatDecision válido.' });
    return { formatDecisions, andromedaReport: null, warnings };
  }

  const andromedaReport = computeAndromedaRisk(formatDecisions);
  if (andromedaReport.needsStructuralBreak) {
    warnings.push({
      type: 'STRUCTURAL_CONCENTRATION',
      risk: andromedaReport.risk,
      reason: `El lote de FormatDecisions concentra estructura (${andromedaReport.distinctSignatureCount} signatures distintas de ${andromedaReport.totalDecisions}) — considera diversificar narrator/scene/editRhythm antes de sintetizar CreativeCells.`,
    });
  }

  return { formatDecisions, andromedaReport, warnings };
}
