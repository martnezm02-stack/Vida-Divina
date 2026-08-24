// synthesisStage.js — Pillar 5 (Prompts 9 + 10) como etapa ejecutable.
//
// NO reimplementa ninguna regla de CreativeCell/Hypothesis/ProductionBrief
// — viven en src/creativeCell.js, src/hypothesis.js, src/productionBrief.js,
// invocadas tal cual. Tampoco reimplementa priorización — reutiliza
// computeStrategicPriority()/selectPriorityCreativeCells() de
// src/competitivePipeline.js (el mismo checklist cualitativo ya construido
// y ya probado para "nunca WINNER, nunca fórmula matemática").
//
// El único valor agregado propio de esta stage: antes de construir una
// CreativeCell, verifica que personaId/painId/angleId/formatId
// referencien entidades REALES ya producidas por las etapas anteriores de
// este mismo ciclo (knownPersonas/knownPains/knownAngles/
// knownFormatDecisions) — src/creativeCell.js exige que esos campos NO
// estén vacíos, pero no puede saber si el id corresponde a algo real: esa
// verificación de trazabilidad es exactamente lo que una orquestación
// agrega por encima del framework, sin tocarlo.

import { createCreativeCell, attachHypothesis } from '../../src/creativeCell.js';
import { createHypothesis } from '../../src/hypothesis.js';
import { createProductionBrief } from '../../src/productionBrief.js';
import { computeStrategicPriority, selectPriorityCreativeCells } from '../../src/competitivePipeline.js';

function idSetOf(entities, idField) {
  return new Set((entities ?? []).map((e) => e[idField]));
}

/** Eje 1 (Evidence Strength) para una CreativeCell no-competitiva: se deriva del Pain real que la respalda (frequency/highFrequencyAnchor ya calculados por pain.js), nunca de un cálculo nuevo. */
function deriveEvidenceStrengthFromPain(pain) {
  if (!pain) return { strength: 'INSUFFICIENT_DATA', recordCount: 0 };
  if (pain.highFrequencyAnchor) return { strength: 'high', recordCount: pain.frequency };
  if (pain.frequency >= 2) return { strength: 'medium', recordCount: pain.frequency };
  if (pain.frequency === 1) return { strength: 'low', recordCount: pain.frequency };
  return { strength: 'INSUFFICIENT_DATA', recordCount: 0 };
}

/**
 * @param {{
 *   cellCandidates: Array<{
 *     personaId: string, painId: string, awareness: string, angleId: string, formatId: string,
 *     mechanism: string, coverageState?: string, evidence?: object[],
 *     hypothesis?: Omit<Parameters<typeof createHypothesis>[0], 'creativeCellId'>,
 *     productionBrief?: Omit<Parameters<typeof createProductionBrief>[0], 'creativeCellId'>,
 *     priorityCriteria?: Parameters<typeof computeStrategicPriority>[0],
 *   }>,
 *   knownPersonas: object[], knownPains: object[], knownAngles: object[], knownFormatDecisions: object[],
 *   maxPriorityCells?: number,
 * }}
 */
export function runSynthesisStage({ cellCandidates, knownPersonas, knownPains, knownAngles, knownFormatDecisions, maxPriorityCells = 8 }) {
  if (!Array.isArray(cellCandidates) || cellCandidates.length === 0) {
    throw new Error('runSynthesisStage: se requiere al menos 1 cellCandidate real.');
  }

  const personaIds = idSetOf(knownPersonas, 'personaId');
  const painIds = idSetOf(knownPains, 'painId');
  const angleIds = idSetOf(knownAngles, 'angleId');
  const formatIds = idSetOf(knownFormatDecisions, 'formatId');
  const painById = new Map((knownPains ?? []).map((p) => [p.painId, p]));

  const creativeCells = [];
  const hypotheses = [];
  const productionBriefs = [];
  const priorityInputs = [];
  const warnings = [];

  for (const candidate of cellCandidates) {
    try {
      for (const [id, set, label] of [
        [candidate.personaId, personaIds, 'personaId'],
        [candidate.painId, painIds, 'painId'],
        [candidate.angleId, angleIds, 'angleId'],
        [candidate.formatId, formatIds, 'formatId'],
      ]) {
        if (!set.has(id)) {
          throw new Error(
            `synthesisStage: "${label}" ("${id}") no corresponde a ninguna entidad real producida por las etapas anteriores de este ciclo — una CreativeCell nunca se construye sobre una referencia que no existe (trazabilidad rota).`
          );
        }
      }

      let cell = createCreativeCell({
        personaId: candidate.personaId,
        painId: candidate.painId,
        awareness: candidate.awareness,
        angleId: candidate.angleId,
        formatId: candidate.formatId,
        mechanism: candidate.mechanism,
        priority: 'candidate',
        coverageState: candidate.coverageState ?? 'Not Running',
        evidence: candidate.evidence ?? [],
      });

      if (candidate.hypothesis) {
        const hyp = createHypothesis({ creativeCellId: cell.creativeCellId, ...candidate.hypothesis });
        hypotheses.push(hyp);
        cell = attachHypothesis(cell, hyp);
      }
      creativeCells.push(cell);

      if (candidate.productionBrief) {
        productionBriefs.push(createProductionBrief({ creativeCellId: cell.creativeCellId, ...candidate.productionBrief }));
      }

      if (candidate.priorityCriteria) {
        priorityInputs.push({
          creativeCell: cell,
          evidenceStrength: deriveEvidenceStrengthFromPain(painById.get(candidate.painId)),
          strategicPriority: computeStrategicPriority(candidate.priorityCriteria),
        });
      }
    } catch (err) {
      warnings.push({ type: 'CREATIVE_CELL_CANDIDATE_REJECTED', reason: err.message });
    }
  }

  const priorityRanking = priorityInputs.length > 0 ? selectPriorityCreativeCells(priorityInputs, { max: maxPriorityCells }) : [];

  if (creativeCells.length === 0) {
    warnings.push({ type: 'INSUFFICIENT_DATA', stage: 'synthesis', reason: 'Ningún cellCandidate produjo una CreativeCell válida — ver CREATIVE_CELL_CANDIDATE_REJECTED arriba para el detalle.' });
  }

  return { creativeCells, hypotheses, productionBriefs, priorityRanking, warnings };
}
