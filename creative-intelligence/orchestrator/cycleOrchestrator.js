// cycleOrchestrator.js — coordina las 5 stages ya construidas
// (Persona → Pain → Angle → Format → Synthesis) en un solo ciclo completo,
// y lo persiste vía cycleStore. NO introduce ninguna regla estratégica
// nueva — cada decisión de negocio (qué es una Persona válida, qué Pain
// cuenta, qué Angle es Empty Cell, qué Format es válido, qué CreativeCell
// es prioritaria) sigue viviendo exclusivamente en src/ y en las stages ya
// auditadas. Este archivo solo: valida el CycleInput, construye el
// evidenceIndex, llama a cada stage pasándole el output REAL de la
// anterior, detiene el ciclo con contexto claro si una stage no produce
// nada usable, ensambla el CycleOutput real, y lo guarda.
//
// RESOLUCIÓN DE REFERENCIAS (el único mecanismo propio de este archivo,
// necesario porque los ids reales de Persona/Pain/Angle/Format no existen
// hasta que cada stage corre): quien llama a runCycle() no puede conocer
// de antemano el personaId/painId/angleId/formatId real que una stage
// anterior generará. Por eso los candidatos de Pain/Angle/Format/Synthesis
// referencian a la entidad anterior por un campo humano ya existente en
// esa entidad (el `name` de la Persona, el `painPoint` del Pain, el
// `angleId` real ya resuelto para Format/Synthesis) — nunca se inventa un
// id nuevo, solo se traduce una referencia legible a la real ya producida.
// Si la referencia no coincide con ninguna entidad real, es exactamente
// una relación rota (ver StageFailureError / tests de broken traceability).

import { validateCycleInput } from '../schemas/cycleInput.schema.js';
import { createCycleOutput } from '../schemas/cycleOutput.schema.js';
import { saveEvidenceSnapshot, saveCycle } from './cycleStore.js';
import { buildEvidenceIndex } from './stages/evidenceIndex.js';
import { runPersonaStage } from './stages/personaStage.js';
import { runPainStage } from './stages/painStage.js';
import { runAngleStage } from './stages/angleStage.js';
import { runFormatStage } from './stages/formatStage.js';
import { runSynthesisStage } from './stages/synthesisStage.js';

/**
 * Error con contexto de stage — nunca un fallo silencioso. `stageName`
 * dice exactamente dónde se detuvo el ciclo; `details.warnings` conserva
 * los warnings reales que la stage produjo antes de fallar, para que el
 * llamador pueda diagnosticar sin adivinar.
 */
export class StageFailureError extends Error {
  constructor(stageName, message, details = {}) {
    super(`[${stageName}] ${message}`);
    this.name = 'StageFailureError';
    this.stageName = stageName;
    this.details = details;
  }
}

function assertStageProducedOutput(stageName, entities, stageWarnings, entityLabel) {
  if (!entities || entities.length === 0) {
    throw new StageFailureError(
      stageName,
      `no produjo ningún ${entityLabel} válido — el ciclo no puede continuar sin al menos 1 real (ver warnings para el detalle de cada candidato rechazado).`,
      { warnings: stageWarnings }
    );
  }
}

/** Traduce una referencia legible (ej. nombre de Persona) al id real ya producido por una stage anterior — lanza StageFailureError si la relación no existe (broken traceability). */
function resolveRef({ stageName, refFieldName, refValue, entities, matchField, idField }) {
  const match = entities.find((e) => e[matchField] === refValue);
  if (!match) {
    throw new StageFailureError(
      stageName,
      `"${refFieldName}" ("${refValue}") no corresponde a ninguna entidad real producida por la etapa anterior de este ciclo — relación rota entre stages.`,
      { refFieldName, refValue }
    );
  }
  return match[idField];
}

/** Ensambla el Strategy Map como PROYECCIÓN de las entidades reales — nunca una fuente nueva de verdad, nunca una decisión de cuál CreativeCell es mejor. */
function buildStrategyMap({ creativeCells, personas, pains, angles, formatDecisions }) {
  const personaById = new Map(personas.map((p) => [p.personaId, p]));
  const painById = new Map(pains.map((p) => [p.painId, p]));
  const angleById = new Map(angles.map((a) => [a.angleId, a]));
  const formatById = new Map(formatDecisions.map((f) => [f.formatId, f]));

  return creativeCells.map((cell) => ({
    creativeCellId: cell.creativeCellId,
    persona: personaById.get(cell.personaId)?.name ?? null,
    subPersonaId: cell.subPersonaId ?? null,
    painAnchor: painById.get(cell.painId)?.painPoint ?? null,
    awareness: cell.awareness,
    angle: angleById.get(cell.angleId)?.angleText ?? null,
    format: formatById.get(cell.formatId)?.recommendedFormat ?? null,
    andromedaSignature: formatById.get(cell.formatId)?.structuralSignature ?? null,
    coverageState: cell.coverageState,
    priority: cell.priority,
  }));
}

/**
 * Ejecuta un ciclo completo: CycleInput → Evidence Index → Persona → Pain
 * → Angle → Format → Synthesis → CycleOutput → cycleStore.saveCycle().
 *
 * Cada candidato usa la MISMA forma ya definida por su stage (ver
 * orchestrator/stages/*.js), con una diferencia: en vez de un
 * personaId/painId/angleId/formatId real (que todavía no existe cuando se
 * construye el input), painCandidates/angleCandidates/emptyCellCandidates/
 * formatCandidates/cellCandidates referencian la entidad anterior por:
 *   - personaRef: el "name" exacto de un personaCandidate
 *   - painRef: el "painPoint" exacto de un painCandidate
 *   - angleRef: el "angleText" exacto de un angleCandidate
 * El orquestador resuelve cada ref al id real ya producido antes de llamar
 * a la siguiente stage.
 *
 * @returns {{ cycleOutput: object, saveResult: {cycleId: string, path: string}, priorityRanking: object[] }}
 */
export function runCycle({
  cycleInput,
  personaCandidates,
  painCandidates,
  angleCandidates = [],
  emptyCellCandidates = [],
  diagnosisCandidates = [],
  formatCandidates,
  cellCandidates,
  maxPriorityCells = 8,
  gateStatus = { strategyAndBriefApproval: 'PENDING' },
}) {
  // 1. CycleInput válido — nunca se arranca un ciclo sobre una entrada silenciosamente inválida.
  validateCycleInput(cycleInput);

  // 2. Evidence Index — único punto por el que cualquier stage resuelve un
  // evidenceId real; las 5 stages comparten exactamente la misma evidencia.
  const evidenceIndex = buildEvidenceIndex(cycleInput.evidenceBatch);

  const warnings = [];
  if (cycleInput.previousCycleId) {
    warnings.push({ type: 'CYCLE_LINEAGE', previousCycleId: cycleInput.previousCycleId });
  }

  // 3. Persona Stage
  const personaOut = runPersonaStage({ personaCandidates, evidenceIndex });
  warnings.push(...personaOut.warnings);
  assertStageProducedOutput('PersonaStage', personaOut.personas, personaOut.warnings, 'Persona');

  // 4. Pain Stage — resuelve personaRef → personaId real antes de llamar la stage.
  const resolvedPainCandidates = painCandidates.map(({ personaRef, ...rest }) => ({
    ...rest,
    personaId: resolveRef({ stageName: 'PainStage', refFieldName: 'personaRef', refValue: personaRef, entities: personaOut.personas, matchField: 'name', idField: 'personaId' }),
  }));
  const painOut = runPainStage({ painCandidates: resolvedPainCandidates, evidenceIndex });
  warnings.push(...painOut.warnings);
  assertStageProducedOutput('PainStage', painOut.pains, painOut.warnings, 'Pain');

  // 5. Angle Stage — resuelve personaRef + painRef reales.
  const resolveForAngle = (stageName) => ({ personaRef, painRef, ...rest }) => ({
    ...rest,
    personaId: resolveRef({ stageName, refFieldName: 'personaRef', refValue: personaRef, entities: personaOut.personas, matchField: 'name', idField: 'personaId' }),
    painId: resolveRef({ stageName, refFieldName: 'painRef', refValue: painRef, entities: painOut.pains, matchField: 'painPoint', idField: 'painId' }),
  });
  const resolvedAngleCandidates = angleCandidates.map(resolveForAngle('AngleStage'));
  const resolvedEmptyCellCandidates = emptyCellCandidates.map(resolveForAngle('AngleStage'));
  const angleOut = runAngleStage({ angleCandidates: resolvedAngleCandidates, emptyCellCandidates: resolvedEmptyCellCandidates, diagnosisCandidates });
  warnings.push(...angleOut.warnings);
  if (angleOut.angles.length === 0 && angleOut.emptyCells.length === 0) {
    throw new StageFailureError('AngleStage', 'no produjo ningún Angle ni Empty Cell válido — el ciclo no puede continuar.', { warnings: angleOut.warnings });
  }

  // 6. Format Stage — resuelve angleRef → angleId real.
  const resolvedFormatCandidates = formatCandidates.map(({ angleRef, ...rest }) => ({
    ...rest,
    angleId: resolveRef({ stageName: 'FormatStage', refFieldName: 'angleRef', refValue: angleRef, entities: angleOut.angles, matchField: 'angleText', idField: 'angleId' }),
  }));
  const formatOut = runFormatStage({ formatCandidates: resolvedFormatCandidates });
  warnings.push(...formatOut.warnings);
  assertStageProducedOutput('FormatStage', formatOut.formatDecisions, formatOut.warnings, 'FormatDecision');

  // 7. Synthesis Stage — resuelve las 4 referencias reales. formatRef se
  // resuelve por el angleId ya resuelto (limitación documentada: si un
  // mismo Angle tuviera más de un FormatDecision candidato, se toma el
  // primero que coincida por angleId — este ciclo no lo necesita).
  const resolvedCellCandidates = cellCandidates.map(({ personaRef, painRef, angleRef, formatRef: _formatRef, ...rest }) => {
    const personaId = resolveRef({ stageName: 'SynthesisStage', refFieldName: 'personaRef', refValue: personaRef, entities: personaOut.personas, matchField: 'name', idField: 'personaId' });
    const painId = resolveRef({ stageName: 'SynthesisStage', refFieldName: 'painRef', refValue: painRef, entities: painOut.pains, matchField: 'painPoint', idField: 'painId' });
    const angleId = resolveRef({ stageName: 'SynthesisStage', refFieldName: 'angleRef', refValue: angleRef, entities: angleOut.angles, matchField: 'angleText', idField: 'angleId' });
    const matchingFormat = formatOut.formatDecisions.find((f) => f.angleId === angleId);
    if (!matchingFormat) {
      throw new StageFailureError('SynthesisStage', `no existe ningún FormatDecision real para el angleId resuelto de "${angleRef}" — relación rota entre Angle y Format.`, { angleRef });
    }
    return { ...rest, personaId, painId, angleId, formatId: matchingFormat.formatId };
  });
  const synthesisOut = runSynthesisStage({
    cellCandidates: resolvedCellCandidates,
    knownPersonas: personaOut.personas, knownPains: painOut.pains, knownAngles: angleOut.angles, knownFormatDecisions: formatOut.formatDecisions,
    maxPriorityCells,
  });
  warnings.push(...synthesisOut.warnings);
  assertStageProducedOutput('SynthesisStage', synthesisOut.creativeCells, synthesisOut.warnings, 'CreativeCell');

  // 8. Evidence snapshot — inmutable, direccionado por contenido. Ninguna
  // entidad copia la evidencia dentro de sí misma; el CycleOutput solo
  // guarda la referencia (hash + path).
  const evidenceSnapshotRef = saveEvidenceSnapshot(cycleInput.evidenceBatch);

  const strategyMap = buildStrategyMap({
    creativeCells: synthesisOut.creativeCells, personas: personaOut.personas, pains: painOut.pains,
    angles: angleOut.angles, formatDecisions: formatOut.formatDecisions,
  });

  // 9-10. Ensamblar y guardar. createCycleOutput() ya aplica
  // assertNoWinnerClaim() internamente.
  const cycleOutput = createCycleOutput({
    cycleId: cycleInput.cycleId,
    evidenceSnapshotRef,
    personas: personaOut.personas,
    subPersonaDecisions: personaOut.subPersonaDecisions,
    pains: painOut.pains,
    angles: angleOut.angles,
    emptyCells: angleOut.emptyCells,
    formatDecisions: formatOut.formatDecisions,
    andromedaReport: formatOut.andromedaReport,
    strategyMap,
    priorityCreativeCells: synthesisOut.creativeCells,
    hypotheses: synthesisOut.hypotheses,
    productionBriefs: synthesisOut.productionBriefs,
    gateStatus,
    warnings,
  });

  const saveResult = saveCycle(cycleOutput);

  return { cycleOutput, saveResult, priorityRanking: synthesisOut.priorityRanking };
}
