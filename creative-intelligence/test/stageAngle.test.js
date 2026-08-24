import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAngleStage } from '../orchestrator/stages/angleStage.js';

function validAngleCandidate(overrides = {}) {
  return {
    personaId: 'persona-1', painId: 'pain-1', awarenessStage: 'Problem Aware',
    angleText: 'Por qué el té energizante te puede dar taquicardia',
    scriptDirection: 'Nombrar el problema específico de forma educativa, sin alarmismo.',
    painAnchor: 'Taquicardia/palpitaciones al tomar productos con estimulante.',
    ...overrides,
  };
}

describe('angleStage — construcción y grid Persona × Pain', () => {
  test('construye un Angle real y lo agrupa en un grid por persona+pain', () => {
    const { angles, awarenessGrids, warnings } = runAngleStage({ angleCandidates: [validAngleCandidate()] });
    assert.equal(warnings.length, 0);
    assert.equal(angles.length, 1);
    assert.equal(awarenessGrids.length, 1);
    assert.equal(awarenessGrids[0].grid['Problem Aware'].angleId, angles[0].angleId);
  });

  test('rechaza un Angle sin scriptDirection/painAnchor — nunca deja pasar un Hook disfrazado de Angle', () => {
    const candidate = { personaId: 'p1', painId: 'pa1', awarenessStage: 'Problem Aware', angleText: 'Solo un hook de 3 segundos' };
    const { angles, warnings } = runAngleStage({ angleCandidates: [candidate] });
    assert.equal(angles.length, 0);
    assert.equal(warnings[0].type, 'ANGLE_CANDIDATE_REJECTED');
  });

  test('construye Empty Cells reales (CATEGORY_GAP/PERSONA_MIS_DEFINED) y las incluye en el grid', () => {
    const emptyCell = { personaId: 'persona-1', painId: 'pain-1', awarenessStage: 'Unaware', reason: 'CATEGORY_GAP' };
    const { emptyCells, awarenessGrids } = runAngleStage({ angleCandidates: [validAngleCandidate()], emptyCellCandidates: [emptyCell] });
    assert.equal(emptyCells[0].isEmptyCell, true);
    assert.equal(awarenessGrids[0].grid['Unaware'].emptyCellReason, 'CATEGORY_GAP');
  });

  test('rechaza un reason de Empty Cell fuera del enum', () => {
    const emptyCell = { personaId: 'p1', painId: 'pa1', awarenessStage: 'Unaware', reason: 'NO_SE_POR_QUE' };
    const { emptyCells, warnings } = runAngleStage({ emptyCellCandidates: [emptyCell] });
    assert.equal(emptyCells.length, 0);
    assert.equal(warnings[0].type, 'EMPTY_CELL_CANDIDATE_REJECTED');
  });

  test('diagnoseEmptyCell detecta discrepancia entre awareness declarado y real', () => {
    const { diagnoses } = runAngleStage({
      angleCandidates: [validAngleCandidate()],
      diagnosisCandidates: [{ awarenessStage: 'Unaware', angleText: 'x', appearsToDescribeStage: 'Problem Aware' }],
    });
    assert.equal(diagnoses[0].diagnosis, 'CATEGORY_GAP');
  });

  test('rechaza un lote vacío (ni angles ni empty cells)', () => {
    assert.throws(() => runAngleStage({}));
  });
});
