import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runSynthesisStage } from '../orchestrator/stages/synthesisStage.js';
import { createPersona } from '../src/persona.js';
import { createPain } from '../src/pain.js';
import { createAngle } from '../src/angle.js';
import { createFormatDecision } from '../src/format.js';

function knownEntities() {
  const persona = createPersona({
    name: 'La Sensible a Estimulantes', lifeSituation: 'Busca energía sin efectos secundarios.',
    relationshipToProblem: 'Ya tuvo una reacción física real.',
    verbatimPhrases: [
      { phrase: 'a', sourceCitation: 'ME-1' }, { phrase: 'b', sourceCitation: 'ME-2' }, { phrase: 'c', sourceCitation: 'ME-3' },
    ],
    confidence: 'PROVISIONAL', evidenceType: 'MARKET_EVIDENCE',
  });
  const pain = createPain({
    personaId: persona.personaId, painPoint: 'Taquicardia con estimulantes', verbatimQuote: 'me da taquicardia',
    sourcePlatform: 'blog', frequency: 5,
  });
  const angle = createAngle({
    personaId: persona.personaId, painId: pain.painId, awarenessStage: 'Problem Aware',
    angleText: 'Por qué te da taquicardia', scriptDirection: 'Explicación educativa sin alarmismo.', painAnchor: 'Taquicardia con estimulantes',
  });
  const format = createFormatDecision({
    angleId: angle.angleId, recommendedFormat: 'Pharmacist / authority figure in-studio',
    justification: 'Requiere autoridad calmada.', whyBeatsDefault: 'Da credibilidad a una explicación técnica.',
    structuralSignature: { narratorType: 'creator', sceneSetup: 'studio', editRhythm: 'slow cut' },
  });
  return { persona, pain, angle, format };
}

function baseKnown({ persona, pain, angle, format }) {
  return { knownPersonas: [persona], knownPains: [pain], knownAngles: [angle], knownFormatDecisions: [format] };
}

describe('synthesisStage — trazabilidad + priorización cualitativa reutilizada', () => {
  test('construye una CreativeCell real solo si las 4 referencias existen entre las entidades conocidas', () => {
    const known = knownEntities();
    const { creativeCells, warnings } = runSynthesisStage({
      cellCandidates: [{ personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'explicación fisiológica breve' }],
      ...baseKnown(known),
    });
    assert.equal(warnings.length, 0);
    assert.equal(creativeCells.length, 1);
    assert.equal(creativeCells[0].priority, 'candidate');
  });

  test('rechaza una referencia a un personaId/painId/angleId/formatId que no existe — trazabilidad rota', () => {
    const known = knownEntities();
    const { creativeCells, warnings } = runSynthesisStage({
      cellCandidates: [{ personaId: 'persona-inventada', painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x' }],
      ...baseKnown(known),
    });
    assert.equal(creativeCells.length, 0);
    assert.match(warnings[0].reason, /no corresponde a ninguna entidad real/);
  });

  test('adjunta Hypothesis real vía attachHypothesis cuando se provee', () => {
    const known = knownEntities();
    const { creativeCells, hypotheses } = runSynthesisStage({
      cellCandidates: [{
        personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x',
        hypothesis: { targetPersona: known.persona.name, awareness: 'Problem Aware', angle: known.angle.angleText, format: known.format.recommendedFormat, expectedOutcome: 'más comentarios de identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el síntoma genera identificación' },
      }],
      ...baseKnown(known),
    });
    assert.equal(hypotheses.length, 1);
    assert.equal(hypotheses[0].type, 'HYPOTHESIS');
    assert.equal(creativeCells[0].hypothesisId, hypotheses[0].hypothesisId);
  });

  test('nunca acepta un campo de resultado colado en la Hypothesis (hereda el guard de hypothesis.js)', () => {
    const known = knownEntities();
    const { hypotheses, warnings } = runSynthesisStage({
      cellCandidates: [{
        personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x',
        hypothesis: { targetPersona: known.persona.name, awareness: 'Problem Aware', angle: known.angle.angleText, format: known.format.recommendedFormat, expectedOutcome: 'x', mechanism: 'x', result: 'ganó' },
      }],
      ...baseKnown(known),
    });
    assert.equal(hypotheses.length, 0);
    assert.match(warnings[0].reason, /nunca es un resultado/);
  });

  test('construye ProductionBrief real con NOT_ESTABLISHED cuando no se proveen métricas', () => {
    const known = knownEntities();
    const { productionBriefs } = runSynthesisStage({
      cellCandidates: [{
        personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x',
        productionBrief: {
          persona: known.persona.name, pain: known.pain.painPoint, awareness: 'Problem Aware', angle: known.angle.angleText, format: known.format.recommendedFormat,
          hookDirection: 'pregunta directa', mechanismEntry: 'x', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'studio', runtime: '20-30s',
        },
      }],
      ...baseKnown(known),
    });
    assert.equal(productionBriefs[0].successMetrics, 'NOT_ESTABLISHED');
    assert.equal(productionBriefs[0].killCriteria, 'NOT_ESTABLISHED');
  });

  test('la priorización reutiliza selectPriorityCreativeCells — nunca WINNER, siempre PRIORITY_HYPOTHESIS_FOR_TESTING', () => {
    const known = knownEntities();
    const { priorityRanking } = runSynthesisStage({
      cellCandidates: [{
        personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x',
        priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
      }],
      ...baseKnown(known),
    });
    assert.equal(priorityRanking.length, 1);
    assert.equal(priorityRanking[0].status, 'PRIORITY_HYPOTHESIS_FOR_TESTING');
    assert.equal(priorityRanking[0].evidenceStrength, 'high'); // pain.frequency=5 → highFrequencyAnchor
  });

  test('sin priorityCriteria, priorityRanking queda vacío — nunca se prioriza sin criterio declarado', () => {
    const known = knownEntities();
    const { priorityRanking } = runSynthesisStage({
      cellCandidates: [{ personaId: known.persona.personaId, painId: known.pain.painId, awareness: 'Problem Aware', angleId: known.angle.angleId, formatId: known.format.formatId, mechanism: 'x' }],
      ...baseKnown(known),
    });
    assert.deepEqual([...priorityRanking], []);
  });

  test('rechaza un lote vacío', () => {
    const known = knownEntities();
    assert.throws(() => runSynthesisStage({ cellCandidates: [], ...baseKnown(known) }));
  });
});
