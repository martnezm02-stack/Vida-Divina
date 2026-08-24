import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runFormatStage } from '../orchestrator/stages/formatStage.js';

function validFormatCandidate(overrides = {}) {
  return {
    angleId: 'angle-1', recommendedFormat: 'Educational walk-and-talk',
    justification: 'Reencuadre educativo necesita autoridad calmada.',
    whyBeatsDefault: 'Evita el tono de venta que ya satura la categoría.',
    structuralSignature: { narratorType: 'creator', sceneSetup: 'outdoor', editRhythm: 'single-take' },
    ...overrides,
  };
}

describe('formatStage — Format Library cerrada + Andromeda', () => {
  test('construye un FormatDecision real y calcula Andromeda sobre el lote', () => {
    const { formatDecisions, andromedaReport } = runFormatStage({
      formatCandidates: [
        validFormatCandidate(),
        validFormatCandidate({ angleId: 'angle-2', structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' } }),
      ],
    });
    assert.equal(formatDecisions.length, 2);
    assert.equal(andromedaReport.totalDecisions, 2);
    // Nota: con solo 2 decisiones, Andromeda da HIGH por diseño del framework
    // (top2Share siempre ≥0.8 en un lote de 2) — no es un defecto de la
    // stage, ver test dedicado de STRUCTURAL_CONCENTRATION más abajo.
  });

  test('rechaza un formato fuera de la Format Library — nunca inventa un formato nuevo', () => {
    const { formatDecisions, warnings } = runFormatStage({ formatCandidates: [validFormatCandidate({ recommendedFormat: 'Formato inventado por mí' })] });
    assert.equal(formatDecisions.length, 0);
    assert.equal(warnings[0].type, 'FORMAT_CANDIDATE_REJECTED');
  });

  test('señala STRUCTURAL_CONCENTRATION cuando Andromeda detecta needsStructuralBreak', () => {
    const sameSignature = { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'fast cut' };
    const { warnings } = runFormatStage({
      formatCandidates: [
        validFormatCandidate({ angleId: 'a1', structuralSignature: sameSignature }),
        validFormatCandidate({ angleId: 'a2', structuralSignature: sameSignature }),
        validFormatCandidate({ angleId: 'a3', structuralSignature: sameSignature }),
      ],
    });
    assert.ok(warnings.some((w) => w.type === 'STRUCTURAL_CONCENTRATION' && w.risk === 'HIGH'));
  });

  test('reporta INSUFFICIENT_DATA y andromedaReport null si ningún candidato es válido', () => {
    const { formatDecisions, andromedaReport, warnings } = runFormatStage({ formatCandidates: [validFormatCandidate({ recommendedFormat: 'no existe' })] });
    assert.equal(formatDecisions.length, 0);
    assert.equal(andromedaReport, null);
    assert.ok(warnings.some((w) => w.type === 'INSUFFICIENT_DATA'));
  });

  test('rechaza un lote vacío', () => {
    assert.throws(() => runFormatStage({ formatCandidates: [] }));
  });
});
