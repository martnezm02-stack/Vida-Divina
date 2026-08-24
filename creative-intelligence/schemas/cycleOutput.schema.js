// cycleOutput.schema.js — Contrato de salida de un ciclo del Creative
// Intelligence Orchestrator. Ensambla entidades REALES ya producidas por
// creative-intelligence/src/ (Persona, Pain, Angle, FormatDecision,
// CreativeCell, Hypothesis, ProductionBrief) — este archivo no define
// ninguna entidad nueva ni reglas de negocio, solo la forma del paquete
// que un ciclo completo produce, más un guard estructural anti-"WINNER".

import { randomUUID } from 'node:crypto';

export const GATE_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED']);

// Vocabulario prohibido como resultado derivado automáticamente en
// CUALQUIER parte de un CycleOutput — mismo guard textual ya usado en
// competitiveEvidencePreliminary.js (validación #15) para el mismo
// propósito: ninguna hipótesis puede aparecer nunca como resultado
// probado sin evidencia de Own Performance real.
const FORBIDDEN_OUTCOME_CLAIMS = /\b(WINNER|VALIDATED|PROVEN)\b/i;

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) throw new Error(`CycleOutput: "${fieldName}" debe ser un arreglo.`);
  return value;
}

/**
 * Escanea el CycleOutput completo (serializado) en busca de
 * WINNER/VALIDATED/PROVEN — defensa en profundidad: hoy ningún
 * constructor de src/ produce esos valores (CreativeCell.priority está
 * cerrado a starred/candidate/not_prioritized/UNKNOWN, la hipótesis
 * preliminar fija status a PRIORITY_HYPOTHESIS_FOR_TESTING), pero este
 * guard existe para que, si algún día una etapa nueva del orchestrator
 * introdujera esos términos por error, el contrato de salida lo rechace
 * en el punto de ensamblaje, no en producción.
 */
export function assertNoWinnerClaim(cycleOutput) {
  const serialized = JSON.stringify(cycleOutput);
  const match = serialized.match(FORBIDDEN_OUTCOME_CLAIMS);
  if (match) {
    throw new Error(`CycleOutput: contiene el término prohibido "${match[0]}" — ninguna pieza de este ciclo puede declararse ganadora/validada/probada automáticamente (ver PRIORITY_HYPOTHESIS_FOR_TESTING).`);
  }
  return true;
}

// Fase 4D (Approval Provenance / Audit Trail): el valor de un gate
// individual ahora acepta DOS formatos, deliberadamente coexistiendo, sin
// migrar ni reescribir nada histórico:
//
//   LEGACY (los 2 ciclos reales ya persistidos en creative-intelligence/
//   data/cycles/ usan exactamente esto, y siguen siendo válidos tal cual):
//     gateStatus.strategyAndBriefApproval = "PENDING"
//
//   NEW (aditivo -- para cuando exista trazabilidad real de quién/cuándo):
//     gateStatus.strategyAndBriefApproval = {
//       status: "APPROVED", reviewedBy: "...", reviewedAt: "2026-08-22T..."
//     }
//
// No existe hoy ningún mecanismo de identidad/autenticación en el
// Dashboard (auditado antes de escribir esto: cero referencias a sesión,
// login, JWT, req.user en dashboard/server) -- por eso "reviewedBy" es
// SIEMPRE opcional en ambos formatos, nunca inventado ni derivado de un
// valor por defecto. Cuando exista una capa real de autenticación/revisión,
// ese será el único origen legítimo de "reviewedBy"; hasta entonces, un
// humano puede aprobar/rechazar un gate sin identidad asociada, o omitir
// el campo por completo.
/**
 * Exportada (Fase 5, Hypothesis Testing): experimentos también usan gates
 * de aprobación humana (ver src/hypothesisTesting.js#createExperiment) —
 * reutiliza exactamente esta misma validación de formato legado/nuevo, en
 * vez de duplicarla.
 */
export function assertValidGateValue(gate, value) {
  if (typeof value === 'string') {
    if (!GATE_STATUSES.includes(value)) {
      throw new Error(`CycleOutput: gateStatus["${gate}"] inválido "${value}" (válidos: ${GATE_STATUSES.join(', ')}).`);
    }
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`CycleOutput: gateStatus["${gate}"] debe ser un string legado (${GATE_STATUSES.join('/')}) o un objeto real { status, reviewedBy?, reviewedAt? }.`);
  }
  const { status, reviewedBy = null, reviewedAt = null, ...resto } = value;
  if (Object.keys(resto).length > 0) {
    throw new Error(`CycleOutput: gateStatus["${gate}"] tiene campos desconocidos (${Object.keys(resto).join(', ')}) — el formato nuevo solo acepta status/reviewedBy/reviewedAt.`);
  }
  if (!GATE_STATUSES.includes(status)) {
    throw new Error(`CycleOutput: gateStatus["${gate}"].status inválido "${status}" (válidos: ${GATE_STATUSES.join(', ')}).`);
  }
  if (status === 'PENDING') {
    if (reviewedBy !== null || reviewedAt !== null) {
      throw new Error(`CycleOutput: gateStatus["${gate}"] con status PENDING no puede tener reviewedBy/reviewedAt — un gate pendiente nunca tiene revisor ni fecha de revisión (nunca se inventan).`);
    }
    return;
  }
  // APPROVED o REJECTED (formato nuevo): reviewedAt es obligatorio -- misma
  // trazabilidad real para ambos, nunca una decisión sin fecha de revisión.
  // reviewedBy sigue opcional (ver nota arriba: sin identidad real disponible hoy).
  if (!reviewedAt?.trim?.() || Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error(`CycleOutput: gateStatus["${gate}"] con status ${status} (formato nuevo) requiere "reviewedAt" real, una fecha ISO válida — nunca una aprobación/rechazo sin fecha de revisión.`);
  }
  if (reviewedBy !== null && !reviewedBy.trim?.()) {
    throw new Error(`CycleOutput: gateStatus["${gate}"].reviewedBy, si se provee, no puede ser un string vacío.`);
  }
}

function assertValidGateStatus(gateStatus) {
  if (!gateStatus || typeof gateStatus !== 'object' || Array.isArray(gateStatus)) {
    throw new Error('CycleOutput: "gateStatus" debe ser un objeto { [gateName]: status }.');
  }
  for (const [gate, value] of Object.entries(gateStatus)) {
    assertValidGateValue(gate, value);
  }
}

/**
 * Lee el status real de un valor de gate, sin importar el formato (legado
 * string, o nuevo objeto {status, reviewedBy, reviewedAt}) -- único punto
 * de lectura reutilizado por cualquier consumidor (ver
 * content-orchestrator/src/campaignMode.js) para no duplicar esta lógica
 * de compatibilidad en cada lugar que necesite leer un gate.
 */
export function getGateStatusValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.status === 'string') return value.status;
  return 'PENDING';
}

function assertValidShape(fields) {
  if (!fields.cycleId?.trim?.()) throw new Error('CycleOutput: "cycleId" es obligatorio.');
  if (!fields.evidenceSnapshotRef?.hash?.trim?.()) {
    throw new Error('CycleOutput: "evidenceSnapshotRef" debe referenciar un snapshot real por hash (ver orchestrator/cycleStore.js) — nunca un ciclo sin procedencia de evidencia.');
  }
  assertArray(fields.personas, 'personas');
  assertArray(fields.subPersonaDecisions, 'subPersonaDecisions');
  assertArray(fields.pains, 'pains');
  assertArray(fields.angles, 'angles');
  assertArray(fields.emptyCells, 'emptyCells');
  assertArray(fields.formatDecisions, 'formatDecisions');
  assertArray(fields.strategyMap, 'strategyMap');
  assertArray(fields.priorityCreativeCells, 'priorityCreativeCells');
  assertArray(fields.hypotheses, 'hypotheses');
  assertArray(fields.productionBriefs, 'productionBriefs');
  assertArray(fields.warnings, 'warnings');
  assertValidGateStatus(fields.gateStatus);
}

/**
 * Construye y valida un CycleOutput. Lanza ante cualquier violación de
 * forma o ante la presencia de un claim de resultado prohibido.
 */
export function createCycleOutput({
  cycleId = randomUUID(),
  evidenceSnapshotRef,
  personas = [],
  subPersonaDecisions = [],
  pains = [],
  angles = [],
  emptyCells = [],
  formatDecisions = [],
  andromedaReport = null,
  strategyMap = [],
  priorityCreativeCells = [],
  hypotheses = [],
  productionBriefs = [],
  gateStatus = {},
  warnings = [],
}) {
  const fields = {
    cycleId, evidenceSnapshotRef, personas, subPersonaDecisions, pains, angles, emptyCells,
    formatDecisions, andromedaReport, strategyMap, priorityCreativeCells, hypotheses, productionBriefs,
    gateStatus, warnings,
  };
  assertValidShape(fields);

  const output = Object.freeze({
    cycleId,
    generatedAt: new Date().toISOString(),
    evidenceSnapshotRef: Object.freeze({ ...evidenceSnapshotRef }),
    personas: Object.freeze([...personas]),
    subPersonaDecisions: Object.freeze([...subPersonaDecisions]),
    pains: Object.freeze([...pains]),
    angles: Object.freeze([...angles]),
    emptyCells: Object.freeze([...emptyCells]),
    formatDecisions: Object.freeze([...formatDecisions]),
    andromedaReport: andromedaReport ? Object.freeze({ ...andromedaReport }) : null,
    strategyMap: Object.freeze([...strategyMap]),
    priorityCreativeCells: Object.freeze([...priorityCreativeCells]),
    hypotheses: Object.freeze([...hypotheses]),
    productionBriefs: Object.freeze([...productionBriefs]),
    gateStatus: Object.freeze({ ...gateStatus }),
    warnings: Object.freeze([...warnings]),
  });

  assertNoWinnerClaim(output);
  return output;
}

/** Revalida un CycleOutput ya construido (ej. leído de disco vía cycleStore) sin pasar por createCycleOutput(). */
export function validateCycleOutput(output) {
  assertValidShape(output ?? {});
  assertNoWinnerClaim(output);
  return true;
}
