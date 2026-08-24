import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runPersonaStage } from '../orchestrator/stages/personaStage.js';
import { buildEvidenceIndex } from '../orchestrator/stages/evidenceIndex.js';

function marketEvidenceIndex() {
  return buildEvidenceIndex([
    {
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-01', verbatimQuote: 'no he bajado mucho', sourcePlatform: 'doctoralia.com.mx' },
        { evidenceId: 'ME-02', verbatimQuote: 'nunca dejaron sus dulces bebidas y pan blanco', sourcePlatform: 'bajardepeso.fitness' },
        { evidenceId: 'ME-03', verbatimQuote: 'me dió una alergia', sourcePlatform: 'bajardepeso.fitness' },
      ],
    },
    { domain: 'COMPETITIVE_EVIDENCE', records: [{ evidenceId: 'AR-06', competitor: 'Fuxion' }] },
  ]);
}

function validCandidate(overrides = {}) {
  return {
    name: 'La Repetidora Agotada de Peso',
    lifeSituation: 'Ha probado múltiples productos de control de peso sin sostener resultados.',
    relationshipToProblem: 'Está en medio de un intento actual de control de peso.',
    whatTheyFear: 'Que el próximo producto tampoco funcione.',
    whatTheyWant: 'Bajar de peso de forma sostenible.',
    verbatimEvidenceIds: ['ME-01', 'ME-02', 'ME-03'],
    ...overrides,
  };
}

describe('personaStage — construcción a partir de evidencia real', () => {
  test('construye una Persona real con confidence PROVISIONAL / evidenceType MARKET_EVIDENCE', () => {
    const { personas, warnings } = runPersonaStage({ personaCandidates: [validCandidate()], evidenceIndex: marketEvidenceIndex() });
    assert.equal(warnings.length, 0);
    assert.equal(personas.length, 1);
    assert.equal(personas[0].confidence, 'PROVISIONAL');
    assert.equal(personas[0].evidenceType, 'MARKET_EVIDENCE');
    assert.deepEqual([...personas[0].evidenceIds], ['ME-01', 'ME-02', 'ME-03']);
  });

  test('la frase verbatim viene literalmente del registro citado — nunca texto libre del candidato', () => {
    const { personas } = runPersonaStage({ personaCandidates: [validCandidate()], evidenceIndex: marketEvidenceIndex() });
    assert.equal(personas[0].verbatimPhrases[0].phrase, 'no he bajado mucho');
    assert.match(personas[0].verbatimPhrases[0].sourceCitation, /ME-01/);
  });

  test('rechaza citar evidencia competitiva como base de una Persona — aísla como warning, no rompe el lote', () => {
    const candidate = validCandidate({ verbatimEvidenceIds: ['ME-01', 'ME-02', 'AR-06'] });
    const { personas, warnings } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: marketEvidenceIndex() });
    assert.equal(personas.length, 0);
    assert.equal(warnings[0].type, 'PERSONA_CANDIDATE_REJECTED');
    assert.match(warnings[0].reason, /COMPETITIVE_EVIDENCE/);
  });

  test('rechaza citar un evidenceId que no existe — nunca inventa procedencia', () => {
    const candidate = validCandidate({ verbatimEvidenceIds: ['ME-01', 'ME-02', 'ME-99-NO-EXISTE'] });
    const { personas, warnings } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: marketEvidenceIndex() });
    assert.equal(personas.length, 0);
    assert.match(warnings[0].reason, /no existe en el evidenceBatch/);
  });

  test('CUSTOMER_VALIDATED solo se otorga si TODA la evidencia citada es CUSTOMER_EVIDENCE y se solicita explícitamente', () => {
    const customerIndex = buildEvidenceIndex([
      { domain: 'CUSTOMER_EVIDENCE', records: [
        { evidenceId: 'CE-01', verbatimQuote: 'x', sourcePlatform: 'whatsapp' },
        { evidenceId: 'CE-02', verbatimQuote: 'y', sourcePlatform: 'whatsapp' },
        { evidenceId: 'CE-03', verbatimQuote: 'z', sourcePlatform: 'whatsapp' },
      ] },
    ]);
    const candidate = validCandidate({ verbatimEvidenceIds: ['CE-01', 'CE-02', 'CE-03'], requestCustomerValidated: true });
    const { personas } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: customerIndex });
    assert.equal(personas[0].confidence, 'CUSTOMER_VALIDATED');
    assert.equal(personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
  });

  test('mezcla MARKET_EVIDENCE + CUSTOMER_EVIDENCE nunca produce CUSTOMER_VALIDATED, aunque se solicite', () => {
    const mixedIndex = buildEvidenceIndex([
      { domain: 'MARKET_EVIDENCE', records: [{ evidenceId: 'ME-X', verbatimQuote: 'x', sourcePlatform: 'y' }] },
      { domain: 'CUSTOMER_EVIDENCE', records: [{ evidenceId: 'CE-X', verbatimQuote: 'z', sourcePlatform: 'whatsapp' }, { evidenceId: 'CE-Y', verbatimQuote: 'w', sourcePlatform: 'whatsapp' }] },
    ]);
    const candidate = validCandidate({ verbatimEvidenceIds: ['ME-X', 'CE-X', 'CE-Y'], requestCustomerValidated: true });
    const { personas } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: mixedIndex });
    assert.equal(personas[0].confidence, 'PROVISIONAL');
  });

  test('reporta INSUFFICIENT_DATA cuando ningún candidato produce una Persona válida', () => {
    const candidate = validCandidate({ verbatimEvidenceIds: ['AR-06'] }); // 1 sola cita, y competitiva
    const { personas, warnings } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: marketEvidenceIndex() });
    assert.equal(personas.length, 0);
    assert.ok(warnings.some((w) => w.type === 'INSUFFICIENT_DATA'));
  });

  test('detecta sub-persona split cuando se proveen señales', () => {
    const candidate = validCandidate({ subPersonaSplitSignals: { multipleEmotionalWounds: true, multipleFailureModes: true } });
    const { subPersonaDecisions } = runPersonaStage({ personaCandidates: [candidate], evidenceIndex: marketEvidenceIndex() });
    assert.equal(subPersonaDecisions[0].decision.shouldSplit, true);
  });

  test('rechaza un lote vacío', () => {
    assert.throws(() => runPersonaStage({ personaCandidates: [], evidenceIndex: marketEvidenceIndex() }));
  });
});
