// angleStage.js — Pillar 3 (Prompts 5 + 6) como etapa ejecutable.
//
// NO reimplementa ninguna regla de Angle — la separación Angle≠Hook
// (scriptDirection + painAnchor obligatorios), la validación de
// awareness, y las Empty Cells (CATEGORY_GAP/PERSONA_MIS_DEFINED) viven
// en src/angle.js. Esta stage solo orquesta: construye cada candidato,
// aísla los inválidos como warnings, y arma el grid Persona×Pain a partir
// de lo que src/angle.js ya sabe construir (buildAngleGrid).

import { createAngle, createEmptyCell, diagnoseEmptyCell, buildAngleGrid } from '../../src/angle.js';

/**
 * @param {{
 *   angleCandidates?: Array<Parameters<typeof createAngle>[0]>,
 *   emptyCellCandidates?: Array<Parameters<typeof createEmptyCell>[0]>,
 *   diagnosisCandidates?: Array<Parameters<typeof diagnoseEmptyCell>[0]>,
 * }}
 */
export function runAngleStage({ angleCandidates = [], emptyCellCandidates = [], diagnosisCandidates = [] }) {
  if (angleCandidates.length === 0 && emptyCellCandidates.length === 0) {
    throw new Error('runAngleStage: se requiere al menos 1 angleCandidate o 1 emptyCellCandidate real.');
  }

  const angles = [];
  const emptyCells = [];
  const warnings = [];

  for (const candidate of angleCandidates) {
    try {
      angles.push(createAngle(candidate));
    } catch (err) {
      warnings.push({ type: 'ANGLE_CANDIDATE_REJECTED', personaId: candidate?.personaId, awarenessStage: candidate?.awarenessStage, reason: err.message });
    }
  }

  for (const candidate of emptyCellCandidates) {
    try {
      emptyCells.push(createEmptyCell(candidate));
    } catch (err) {
      warnings.push({ type: 'EMPTY_CELL_CANDIDATE_REJECTED', reason: err.message });
    }
  }

  const diagnoses = diagnosisCandidates.map((candidate) => diagnoseEmptyCell(candidate)).filter(Boolean);

  // Grid Persona × Pain — agrupa angles + empty cells que compartan
  // personaId+painId (buildAngleGrid ya sabe organizar por awareness;
  // aquí solo se agrupa por el par persona/pain antes de dárselo).
  const grouped = new Map();
  for (const entry of [...angles, ...emptyCells]) {
    const key = `${entry.personaId}::${entry.painId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  const awarenessGrids = [...grouped.entries()].map(([key, entries]) => {
    const [personaId, painId] = key.split('::');
    return { personaId, painId, grid: buildAngleGrid(entries) };
  });

  if (angles.length === 0) {
    warnings.push({ type: 'INSUFFICIENT_DATA', stage: 'angle', reason: 'Ningún angleCandidate produjo un Angle válido.' });
  }

  return { angles, emptyCells, diagnoses, awarenessGrids, warnings };
}
