// stagesIntegration.test.js — encadena las 5 stages reales (Persona → Pain
// → Angle → Format → Synthesis) tal como lo haría un ciclo real, más los
// casos límite pedidos explícitamente en esta fase. 100% local: sin red,
// sin API, sin PostgreSQL, sin Instagram, sin WhatsApp.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runPersonaStage } from '../orchestrator/stages/personaStage.js';
import { runPainStage } from '../orchestrator/stages/painStage.js';
import { runAngleStage } from '../orchestrator/stages/angleStage.js';
import { runFormatStage } from '../orchestrator/stages/formatStage.js';
import { runSynthesisStage } from '../orchestrator/stages/synthesisStage.js';
import { buildEvidenceIndex } from '../orchestrator/stages/evidenceIndex.js';

function fullEvidenceIndex() {
  return buildEvidenceIndex([
    {
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-07', verbatimQuote: 'El te genera palpitaciones', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-08', verbatimQuote: 'A mi el te me da Taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-09', verbatimQuote: 'El te me da taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
      ],
    },
    { domain: 'COMPETITIVE_EVIDENCE', records: [{ evidenceId: 'AR-06', competitor: 'Fuxion' }] },
  ]);
}

/** Corre la cadena completa real, devolviendo el resultado de cada stage. */
function runFullChain() {
  const evidenceIndex = fullEvidenceIndex();

  const personaOut = runPersonaStage({
    personaCandidates: [{
      name: 'La Sensible a Estimulantes', lifeSituation: 'Busca energía sin efectos secundarios.',
      relationshipToProblem: 'Ya tuvo una reacción física real al tomar un energizante.',
      verbatimEvidenceIds: ['ME-07', 'ME-08', 'ME-09'],
    }],
    evidenceIndex,
  });
  const persona = personaOut.personas[0];

  const painOut = runPainStage({
    painCandidates: [{ personaId: persona.personaId, painPoint: 'Taquicardia con estimulantes', supportingEvidenceIds: ['ME-07', 'ME-08', 'ME-09'] }],
    evidenceIndex,
  });
  const pain = painOut.pains[0];

  const angleOut = runAngleStage({
    angleCandidates: [{
      personaId: persona.personaId, painId: pain.painId, awarenessStage: 'Problem Aware',
      angleText: 'Por qué el té energizante te puede dar taquicardia',
      scriptDirection: 'Explicación educativa sin alarmismo.', painAnchor: pain.painPoint,
    }],
  });
  const angle = angleOut.angles[0];

  const formatOut = runFormatStage({
    formatCandidates: [{
      angleId: angle.angleId, recommendedFormat: 'Pharmacist / authority figure in-studio',
      justification: 'Requiere autoridad calmada.', whyBeatsDefault: 'Da credibilidad a una explicación técnica.',
      structuralSignature: { narratorType: 'creator', sceneSetup: 'studio', editRhythm: 'slow cut' },
    }],
  });
  const format = formatOut.formatDecisions[0];

  const synthesisOut = runSynthesisStage({
    cellCandidates: [{
      personaId: persona.personaId, painId: pain.painId, awareness: 'Problem Aware', angleId: angle.angleId, formatId: format.formatId,
      mechanism: 'nombrar la sensibilidad a estimulantes sin diagnosticar',
      hypothesis: { targetPersona: persona.name, awareness: 'Problem Aware', angle: angle.angleText, format: format.recommendedFormat, expectedOutcome: 'más comentarios de identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el síntoma genera identificación' },
      productionBrief: { persona: persona.name, pain: pain.painPoint, awareness: 'Problem Aware', angle: angle.angleText, format: format.recommendedFormat, hookDirection: 'pregunta directa', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'studio', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    knownPersonas: [persona], knownPains: [pain], knownAngles: [angle], knownFormatDecisions: [format],
  });

  return { evidenceIndex, personaOut, painOut, angleOut, formatOut, synthesisOut, persona, pain, angle, format };
}

describe('1. Persona → Pain integration', () => {
  test('el Pain resultante referencia el personaId real que produjo la Persona Stage', () => {
    const { persona, pain } = runFullChain();
    assert.equal(pain.personaId, persona.personaId);
  });
});

describe('2. Pain → Angle integration', () => {
  test('el Angle resultante referencia personaId y painId reales, y conserva el painAnchor', () => {
    const { persona, pain, angle } = runFullChain();
    assert.equal(angle.personaId, persona.personaId);
    assert.equal(angle.painId, pain.painId);
    assert.equal(angle.painAnchor, pain.painPoint);
  });
});

describe('3. Angle → Format integration', () => {
  test('el FormatDecision resultante referencia el angleId real', () => {
    const { angle, format } = runFullChain();
    assert.equal(format.angleId, angle.angleId);
  });
});

describe('4. Format → CreativeCell integration', () => {
  test('la CreativeCell resultante referencia las 4 entidades reales de las etapas anteriores', () => {
    const { persona, pain, angle, format, synthesisOut } = runFullChain();
    const cell = synthesisOut.creativeCells[0];
    assert.equal(cell.personaId, persona.personaId);
    assert.equal(cell.painId, pain.painId);
    assert.equal(cell.angleId, angle.angleId);
    assert.equal(cell.formatId, format.formatId);
  });
});

describe('5. CreativeCell → Hypothesis integration', () => {
  test('la Hypothesis queda adjunta a la CreativeCell real vía attachHypothesis', () => {
    const { synthesisOut } = runFullChain();
    assert.equal(synthesisOut.creativeCells[0].hypothesisId, synthesisOut.hypotheses[0].hypothesisId);
    assert.equal(synthesisOut.hypotheses[0].type, 'HYPOTHESIS');
  });
});

describe('6. Hypothesis → ProductionBrief integration', () => {
  test('el ProductionBrief resultante referencia la misma CreativeCell que la Hypothesis', () => {
    const { synthesisOut } = runFullChain();
    assert.equal(synthesisOut.productionBriefs[0].creativeCellId, synthesisOut.creativeCells[0].creativeCellId);
    assert.equal(synthesisOut.productionBriefs[0].successMetrics, 'NOT_ESTABLISHED');
  });
});

describe('Cadena completa — sin warnings cuando todo el input es válido', () => {
  test('ninguna etapa produce warnings de candidato rechazado en una corrida limpia', () => {
    const { personaOut, painOut, angleOut, formatOut, synthesisOut } = runFullChain();
    assert.deepEqual(personaOut.warnings, []);
    assert.deepEqual(painOut.warnings, []);
    assert.deepEqual(angleOut.warnings, []);
    assert.deepEqual(synthesisOut.warnings, []);
    // formatOut SÍ produce STRUCTURAL_CONCENTRATION aquí — esperado y
    // correcto: con 1 sola FormatDecision, Andromeda da HIGH por diseño
    // del framework (distinctCount===1 → HIGH), no un candidato rechazado.
    assert.deepEqual(formatOut.warnings.map((w) => w.type), ['STRUCTURAL_CONCENTRATION']);
  });

  test('la priorización final está etiquetada PRIORITY_HYPOTHESIS_FOR_TESTING, nunca WINNER', () => {
    const { synthesisOut } = runFullChain();
    assert.equal(synthesisOut.priorityRanking[0].status, 'PRIORITY_HYPOTHESIS_FOR_TESTING');
  });
});

describe('Casos límite — evidencia insuficiente', () => {
  test('Persona Stage: candidato con menos de 3 verbatim reales queda rechazado con INSUFFICIENT_DATA', () => {
    const evidenceIndex = fullEvidenceIndex();
    const { personas, warnings } = runPersonaStage({
      personaCandidates: [{ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', verbatimEvidenceIds: ['ME-07'] }],
      evidenceIndex,
    });
    assert.equal(personas.length, 0);
    assert.ok(warnings.some((w) => w.type === 'INSUFFICIENT_DATA'));
  });
});

describe('Casos límite — evidencia competitiva mal utilizada', () => {
  test('ni Persona ni Pain Stage aceptan evidencia COMPETITIVE_EVIDENCE como base', () => {
    const evidenceIndex = fullEvidenceIndex();
    const personaResult = runPersonaStage({ personaCandidates: [{ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', verbatimEvidenceIds: ['ME-07', 'ME-08', 'AR-06'] }], evidenceIndex });
    const painResult = runPainStage({ painCandidates: [{ personaId: 'p1', painPoint: 'x', supportingEvidenceIds: ['AR-06'] }], evidenceIndex });
    assert.equal(personaResult.personas.length, 0);
    assert.equal(painResult.pains.length, 0);
  });
});

describe('Casos límite — ausencia de Customer Evidence', () => {
  test('la cadena completa funciona end-to-end usando solo MARKET_EVIDENCE (sin ningún CUSTOMER_EVIDENCE)', () => {
    const { persona, synthesisOut } = runFullChain();
    assert.equal(persona.evidenceType, 'MARKET_EVIDENCE');
    assert.equal(persona.confidence, 'PROVISIONAL');
    assert.notEqual(persona.confidence, 'CUSTOMER_VALIDATED');
    assert.equal(synthesisOut.creativeCells.length, 1); // el ciclo no se detiene por falta de Customer Evidence
  });
});

describe('Casos límite — category gap', () => {
  test('Angle Stage produce un Empty Cell CATEGORY_GAP sin inventar un Angle', () => {
    const { angleOut } = (() => {
      const angleOut = runAngleStage({ emptyCellCandidates: [{ personaId: 'p1', painId: 'pa1', awarenessStage: 'Unaware', reason: 'CATEGORY_GAP' }] });
      return { angleOut };
    })();
    assert.equal(angleOut.angles.length, 0);
    assert.equal(angleOut.emptyCells[0].emptyCellReason, 'CATEGORY_GAP');
  });
});

describe('Casos límite — persona inválida', () => {
  test('Persona Stage rechaza lifeSituation que en realidad es un awareness stage', () => {
    const evidenceIndex = fullEvidenceIndex();
    const { personas, warnings } = runPersonaStage({
      personaCandidates: [{ name: 'x', lifeSituation: 'Problem Aware', relationshipToProblem: 'z', verbatimEvidenceIds: ['ME-07', 'ME-08', 'ME-09'] }],
      evidenceIndex,
    });
    assert.equal(personas.length, 0);
    assert.match(warnings[0].reason, /awareness level/);
  });
});

describe('Casos límite — angle confundido con hook', () => {
  test('Angle Stage rechaza un candidato sin painAnchor (forma de Hook, no de Angle)', () => {
    const { angles, warnings } = runAngleStage({ angleCandidates: [{ personaId: 'p1', painId: 'pa1', awarenessStage: 'Problem Aware', angleText: 'Solo un hook' }] });
    assert.equal(angles.length, 0);
    assert.match(warnings[0].reason, /Hook/);
  });
});

describe('Casos límite — format inválido', () => {
  test('Format Stage rechaza un formato fuera de la Format Library', () => {
    const { formatDecisions, warnings } = runFormatStage({ formatCandidates: [{ angleId: 'a1', recommendedFormat: 'TikTok dance trend', justification: 'x', whyBeatsDefault: 'x', structuralSignature: { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'fast cut' } }] });
    assert.equal(formatDecisions.length, 0);
    assert.equal(warnings[0].type, 'FORMAT_CANDIDATE_REJECTED');
  });
});

describe('Casos límite — winner claim', () => {
  test('ningún output de ninguna etapa de la cadena completa contiene la palabra WINNER/VALIDATED/PROVEN', () => {
    const { personaOut, painOut, angleOut, formatOut, synthesisOut } = runFullChain();
    const serialized = JSON.stringify({ personaOut, painOut, angleOut, formatOut, synthesisOut });
    assert.doesNotMatch(serialized, /\b(WINNER|VALIDATED|PROVEN)\b/i);
  });
});

describe('Casos límite — missing evidence', () => {
  test('Pain Stage rechaza un evidenceId que no existe en el índice del ciclo', () => {
    const evidenceIndex = fullEvidenceIndex();
    const { pains, warnings } = runPainStage({ painCandidates: [{ personaId: 'p1', painPoint: 'x', supportingEvidenceIds: ['ME-999-NO-EXISTE'] }], evidenceIndex });
    assert.equal(pains.length, 0);
    assert.match(warnings[0].reason, /no existe en el evidenceBatch/);
  });
});

describe('Casos límite — broken traceability', () => {
  test('Synthesis Stage rechaza un formatId que no fue producido por la Format Stage de este ciclo', () => {
    const { persona, pain, angle, synthesisOut: _unused } = runFullChain();
    const { creativeCells, warnings } = runSynthesisStage({
      cellCandidates: [{ personaId: persona.personaId, painId: pain.painId, awareness: 'Problem Aware', angleId: angle.angleId, formatId: 'format-que-no-existe', mechanism: 'x' }],
      knownPersonas: [persona], knownPains: [pain], knownAngles: [angle], knownFormatDecisions: [], // formatId nunca fue producido
    });
    assert.equal(creativeCells.length, 0);
    assert.match(warnings[0].reason, /trazabilidad rota/);
  });
});
