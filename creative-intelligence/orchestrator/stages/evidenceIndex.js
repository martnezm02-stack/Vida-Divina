// evidenceIndex.js — utilidad compartida por las stages (Persona/Pain):
// resuelve evidenceId → {domain, record} a partir de un evidenceBatch real
// (CycleInput.evidenceBatch, ver schemas/cycleInput.schema.js). Ninguna
// stage puede citar evidencia que no exista en este índice — es el
// mecanismo ESTRUCTURAL que impide fabricar procedencia, no solo una
// convención documental.
//
// No es una entidad del framework (no vive en src/) — es plomería de
// orquestación pura, sin ninguna regla de Persona/Pain/Angle/Format.

/**
 * @param {{domain: string, records: object[]}[]} evidenceBatch
 * @returns {Map<string, {domain: string, record: object}>}
 */
export function buildEvidenceIndex(evidenceBatch) {
  if (!Array.isArray(evidenceBatch) || evidenceBatch.length === 0) {
    throw new Error('buildEvidenceIndex: se requiere un evidenceBatch real (ver schemas/cycleInput.schema.js) — nunca un índice vacío.');
  }
  const index = new Map();
  for (const { domain, records } of evidenceBatch) {
    for (const record of records) {
      if (!record?.evidenceId?.trim?.()) {
        throw new Error('buildEvidenceIndex: cada record de evidencia debe tener un "evidenceId" real para poder citarse desde una stage.');
      }
      if (index.has(record.evidenceId)) {
        throw new Error(`buildEvidenceIndex: evidenceId duplicado "${record.evidenceId}" — cada id debe ser único dentro del ciclo.`);
      }
      index.set(record.evidenceId, Object.freeze({ domain, record }));
    }
  }
  return index;
}

/**
 * Resuelve una lista de evidenceIds contra el índice — lanza si alguno no
 * existe. Es el único punto por el que una stage puede convertir un id en
 * el registro real que representa; no hay otro camino para "citar"
 * evidencia.
 */
export function resolveEvidenceIds(evidenceIndex, evidenceIds, { stageName }) {
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new Error(`${stageName}: se requiere al menos 1 evidenceId real.`);
  }
  return evidenceIds.map((id) => {
    const entry = evidenceIndex.get(id);
    if (!entry) {
      throw new Error(`${stageName}: evidenceId "${id}" no existe en el evidenceBatch de este ciclo — no se puede citar evidencia que no fue provista.`);
    }
    return entry;
  });
}
