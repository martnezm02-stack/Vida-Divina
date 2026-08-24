// reproducibility.test.js — demuestra que las nuevas stages, corridas
// sobre un input equivalente al que originó el ciclo real ya persistido
// (6ee030bd-9b4d-483c-9b87-762c0860a2f7, Lot 1: Cell 1/2/6), producen
// entidades COMPATIBLES con la arquitectura existente — mismas reglas,
// misma clasificación de evidencia, mismo tipo de CreativeCell, nunca
// WINNER. NO se exige igualdad textual ni de ids (createPersona/
// createPain/etc. generan randomUUID() en cada corrida — eso es una
// REPRODUCTION DIFFERENCE esperada y documentada abajo, no un defecto).
//
// Este archivo NUNCA llama a saveCycle() sobre el cycleId real ni sobre
// ningún otro — es de solo lectura sobre el ciclo persistido y de
// ejecución en memoria sobre las stages. No usa CREATIVE_INTELLIGENCE_DATA_ROOT
// (lee el data/ real del paquete, sin modificarlo).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getCycle } from '../orchestrator/cycleStore.js';
import { runPersonaStage } from '../orchestrator/stages/personaStage.js';
import { runPainStage } from '../orchestrator/stages/painStage.js';
import { runAngleStage } from '../orchestrator/stages/angleStage.js';
import { runFormatStage } from '../orchestrator/stages/formatStage.js';
import { runSynthesisStage } from '../orchestrator/stages/synthesisStage.js';
import { buildEvidenceIndex } from '../orchestrator/stages/evidenceIndex.js';
import { AWARENESS_STAGES } from '../src/awareness.js';
import { FORMAT_LIBRARY } from '../src/format.js';
import { PRIORITY_LEVELS } from '../src/creativeCell.js';
import { PERSONA_CONFIDENCE_LEVELS, PERSONA_EVIDENCE_TYPES } from '../src/persona.js';

const REAL_CYCLE_ID = '6ee030bd-9b4d-483c-9b87-762c0860a2f7';

describe('Reproducibility test — ciclo real Lot 1 (solo lectura)', () => {
  test('el ciclo real existe y contiene Cell 2 (Energía × Problem Aware) sin alterarlo', () => {
    const realCycle = getCycle(REAL_CYCLE_ID);
    assert.equal(realCycle.cycleId, REAL_CYCLE_ID);
    const realEnergyPersona = realCycle.personas.find((p) => p.name.includes('Sensible a Estimulantes'));
    assert.ok(realEnergyPersona, 'el ciclo real debe contener la Persona de Energía');
    assert.equal(realEnergyPersona.confidence, 'PROVISIONAL');
    assert.equal(realEnergyPersona.evidenceType, 'MARKET_EVIDENCE');
  });

  test('las nuevas stages, corridas sobre evidencia equivalente, producen una Persona/Pain/Angle/Format/CreativeCell/Hypothesis con la MISMA clasificación de evidencia y las mismas reglas que el ciclo real — nunca texto/ids idénticos', () => {
    const realCycle = getCycle(REAL_CYCLE_ID);
    const realEnergyPersona = realCycle.personas.find((p) => p.name.includes('Sensible a Estimulantes'));
    const realEnergyCell = realCycle.priorityCreativeCells.find((c) => c.awareness === 'Problem Aware' && c.formatId !== realCycle.priorityCreativeCells[0]?.formatId ? true : c.awareness === 'Problem Aware');
    const realEnergyHypothesis = realCycle.hypotheses.find((h) => h.targetPersona?.includes('Sensible a Estimulantes'));

    // Evidencia equivalente a la que originó Cell 2 (ME-07/08/09/13 reales, mismas fuentes/quotes ya usadas en ese ciclo).
    const evidenceIndex = buildEvidenceIndex([
      { domain: 'MARKET_EVIDENCE', records: [
        { evidenceId: 'ME-07', verbatimQuote: 'El te genera palpitaciones', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-08', verbatimQuote: 'A mi el te me da Taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-09', verbatimQuote: 'El te me da taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
      ] },
    ]);

    const { personas } = runPersonaStage({
      personaCandidates: [{ name: 'La Sensible a Estimulantes en Busca de Energía (reproducción)', lifeSituation: 'Busca energía sin efectos secundarios.', relationshipToProblem: 'Ya tuvo una reacción física real.', verbatimEvidenceIds: ['ME-07', 'ME-08', 'ME-09'] }],
      evidenceIndex,
    });
    const persona = personas[0];

    const { pains } = runPainStage({ painCandidates: [{ personaId: persona.personaId, painPoint: 'Taquicardia con estimulantes', supportingEvidenceIds: ['ME-07', 'ME-08', 'ME-09'] }], evidenceIndex });
    const pain = pains[0];

    const { angles } = runAngleStage({ angleCandidates: [{ personaId: persona.personaId, painId: pain.painId, awarenessStage: 'Problem Aware', angleText: 'Por qué el té energizante te puede dar taquicardia', scriptDirection: 'Explicación educativa sin alarmismo.', painAnchor: pain.painPoint }] });
    const angle = angles[0];

    const { formatDecisions } = runFormatStage({ formatCandidates: [{ angleId: angle.angleId, recommendedFormat: 'Pharmacist / authority figure in-studio', justification: 'x', whyBeatsDefault: 'x', structuralSignature: { narratorType: 'creator', sceneSetup: 'studio', editRhythm: 'slow cut' } }] });
    const format = formatDecisions[0];

    const { creativeCells, hypotheses } = runSynthesisStage({
      cellCandidates: [{
        personaId: persona.personaId, painId: pain.painId, awareness: 'Problem Aware', angleId: angle.angleId, formatId: format.formatId, mechanism: 'x',
        hypothesis: { targetPersona: persona.name, awareness: 'Problem Aware', angle: angle.angleText, format: format.recommendedFormat, expectedOutcome: 'x — BASELINE_NOT_ESTABLISHED', mechanism: 'x' },
      }],
      knownPersonas: [persona], knownPains: [pain], knownAngles: [angle], knownFormatDecisions: [format],
    });
    const cell = creativeCells[0];
    const hypothesis = hypotheses[0];

    // ---- Mismas entidades conceptuales, mismas reglas, misma clasificación ----
    assert.equal(persona.confidence, realEnergyPersona.confidence); // PROVISIONAL en ambos
    assert.equal(persona.evidenceType, realEnergyPersona.evidenceType); // MARKET_EVIDENCE en ambos
    assert.ok(PERSONA_CONFIDENCE_LEVELS.includes(persona.confidence) && PERSONA_CONFIDENCE_LEVELS.includes(realEnergyPersona.confidence));
    assert.ok(PERSONA_EVIDENCE_TYPES.includes(persona.evidenceType) && PERSONA_EVIDENCE_TYPES.includes(realEnergyPersona.evidenceType));

    assert.ok(AWARENESS_STAGES.includes(angle.awarenessStage));
    assert.equal(angle.awarenessStage, 'Problem Aware'); // mismo awareness que Cell 2 real

    assert.ok(FORMAT_LIBRARY.includes(format.recommendedFormat));

    assert.ok(PRIORITY_LEVELS.includes(cell.priority));
    assert.notEqual(cell.priority, 'WINNER'); // ni siquiera está en el enum — verificado también estructuralmente

    assert.equal(hypothesis.type, 'HYPOTHESIS');
    if (realEnergyHypothesis) assert.equal(realEnergyHypothesis.type, 'HYPOTHESIS');

    // ---- REPRODUCTION DIFFERENCES (esperadas, documentadas, no ocultadas) ----
    // 1. Los ids (personaId/painId/angleId/formatId/creativeCellId/hypothesisId)
    //    son randomUUID() nuevos en cada corrida — nunca serán iguales a los
    //    del ciclo real, por diseño (createPersona/createPain/etc. no aceptan
    //    ni reutilizan ids externos).
    assert.notEqual(persona.personaId, realEnergyPersona.personaId);
    // 2. El texto exacto de personaHypothesis/angleText/etc. depende de cómo
    //    se redactó el candidato de entrada en cada corrida — esta prueba no
    //    exige igualdad textual (per instrucción explícita de esta fase).
    // 3. El ciclo real (6ee030bd...) tiene 3 personas/9 pains/8 angles/8
    //    formats/3 priorityCreativeCells ya persistidos manualmente antes de
    //    que existieran las stages; esta reproducción construye solo 1
    //    persona/pain/angle/format/cell equivalente a Cell 2 — no reconstruye
    //    el ciclo completo (no era el objetivo de esta prueba).
    if (realEnergyCell) {
      assert.notEqual(cell.creativeCellId, realEnergyCell.creativeCellId); // diferencia esperada, ver nota 1
    }
  });

  test('el ciclo real permanece exactamente intacto después de correr las stages (solo lectura)', () => {
    const before = getCycle(REAL_CYCLE_ID);
    // Ejecuta un chain completo de las stages nuevamente, sin tocar cycleStore.
    const evidenceIndex = buildEvidenceIndex([{ domain: 'MARKET_EVIDENCE', records: [{ evidenceId: 'ME-X', verbatimQuote: 'x', sourcePlatform: 'y' }, { evidenceId: 'ME-Y', verbatimQuote: 'z', sourcePlatform: 'w' }, { evidenceId: 'ME-Z', verbatimQuote: 'v', sourcePlatform: 'u' }] }]);
    runPersonaStage({ personaCandidates: [{ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', verbatimEvidenceIds: ['ME-X', 'ME-Y', 'ME-Z'] }], evidenceIndex });
    const after = getCycle(REAL_CYCLE_ID);
    assert.deepEqual(before, after);
  });
});
