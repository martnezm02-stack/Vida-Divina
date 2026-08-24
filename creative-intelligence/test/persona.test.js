import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPersona, validatePersona, evaluateSubPersonaSplit, validateSubPersona, PERSONA_CONFIDENCE_LEVELS, PERSONA_EVIDENCE_TYPES } from '../src/persona.js';

const VALID_PHRASES = [
  { phrase: 'Ya no aguanto sentirme hinchada todos los días', sourceCitation: 'review:amazon:2026-05-01' },
  { phrase: 'He probado de todo y nada me funciona', sourceCitation: 'sales_call:2026-05-02' },
  { phrase: 'Me da miedo que sea otra estafa más', sourceCitation: 'reddit:r/wellness:2026-05-03' },
];

function baseArgs(overrides = {}) {
  return {
    name: 'Madre trabajadora con digestión lenta',
    lifeSituation: 'Trabaja tiempo completo, cuida a sus hijos, apenas tiene tiempo para cocinar sano',
    relationshipToProblem: 'Lleva 2 años con hinchazón crónica después de comer, ya consultó a un médico general',
    verbatimPhrases: VALID_PHRASES,
    ...overrides,
  };
}

describe('Persona validation — Pillar 1', () => {
  test('crea una Persona válida con todos los campos requeridos', () => {
    const persona = createPersona(baseArgs());
    assert.ok(persona.personaId);
    assert.equal(persona.coverageState, 'UNKNOWN');
    assert.equal(persona.verbatimPhrases.length, 3);
  });

  test('un persona NO puede definirse por awareness — lifeSituation como awareness stage se rechaza', () => {
    assert.throws(
      () => createPersona(baseArgs({ lifeSituation: 'Problem Aware' })),
      /awareness level/i
    );
  });

  test('un persona NO puede definirse por awareness — relationshipToProblem como awareness stage se rechaza', () => {
    assert.throws(
      () => createPersona(baseArgs({ relationshipToProblem: 'Most Aware' })),
      /awareness level/i
    );
  });

  test('rechaza una persona sin relationshipToProblem (no puede ser solo demografía)', () => {
    assert.throws(() => createPersona(baseArgs({ relationshipToProblem: '' })), /relationshipToProblem/);
  });

  test('rechaza verbatimPhrases sin sourceCitation', () => {
    assert.throws(
      () => createPersona(baseArgs({ verbatimPhrases: [{ phrase: 'algo', sourceCitation: '' }, ...VALID_PHRASES.slice(1)] })),
      /sourceCitation/
    );
  });

  test('rechaza menos de 3 verbatim phrases', () => {
    assert.throws(() => createPersona(baseArgs({ verbatimPhrases: VALID_PHRASES.slice(0, 2) })), /verbatimPhrases/);
  });

  test('rechaza coverageState fuera del enum del framework', () => {
    assert.throws(() => createPersona(baseArgs({ coverageState: 'Winning' })), /coverageState/);
  });

  test('validatePersona revalida un objeto ya construido', () => {
    const persona = createPersona(baseArgs());
    assert.equal(validatePersona(persona), true);
  });
});

describe('Sub-Persona Split Check — Prompt 2', () => {
  test('evaluateSubPersonaSplit recomienda split cuando hay múltiples señales', () => {
    const result = evaluateSubPersonaSplit({ multipleEmotionalWounds: true, multipleFailureModes: true, multipleLanguagePatterns: false, multipleRelationshipsToProblem: false });
    assert.equal(result.shouldSplit, true);
    assert.deepEqual(result.reasons, ['multiple emotional wounds', 'multiple failure modes']);
  });

  test('evaluateSubPersonaSplit no recomienda split sin señales', () => {
    const result = evaluateSubPersonaSplit({});
    assert.equal(result.shouldSplit, false);
  });

  test('validateSubPersona exige subPersonaOf y que coincida con el padre esperado', () => {
    const parent = createPersona(baseArgs());
    const sub = createPersona(baseArgs({ name: 'Sub-persona: la escéptica', subPersonaOf: parent.personaId }));
    assert.equal(validateSubPersona(sub, parent.personaId), true);
    assert.throws(() => validateSubPersona(sub, 'otro-id-cualquiera'));
  });
});

describe('Persona confidence/evidenceType — Fase Creative Intelligence: Integración + Primer Ciclo', () => {
  test('por defecto, confidence y evidenceType quedan UNKNOWN — nunca PROVISIONAL/MARKET_EVIDENCE sin declararlo', () => {
    const persona = createPersona(baseArgs());
    assert.equal(persona.confidence, 'UNKNOWN');
    assert.equal(persona.evidenceType, 'UNKNOWN');
    assert.deepEqual([...persona.evidenceIds], []);
  });

  test('acepta confidence PROVISIONAL con evidenceType MARKET_EVIDENCE y evidenceIds reales', () => {
    const persona = createPersona(baseArgs({ confidence: 'PROVISIONAL', evidenceType: 'MARKET_EVIDENCE', evidenceIds: ['ME-01', 'ME-02'] }));
    assert.equal(persona.confidence, 'PROVISIONAL');
    assert.deepEqual([...persona.evidenceIds], ['ME-01', 'ME-02']);
  });

  test('rechaza confidence/evidenceType fuera de los enums', () => {
    assert.throws(() => createPersona(baseArgs({ confidence: 'PROVEN' })));
    assert.throws(() => createPersona(baseArgs({ evidenceType: 'CUSTOMER_MESSAGES' })));
  });

  test('rechaza CUSTOMER_VALIDATED si evidenceType no es CUSTOMER_EVIDENCE real — nunca declarar validación de cliente sobre Market/Affiliate Evidence', () => {
    assert.throws(
      () => createPersona(baseArgs({ confidence: 'CUSTOMER_VALIDATED', evidenceType: 'MARKET_EVIDENCE' })),
      /CUSTOMER_VALIDATED/
    );
    assert.throws(
      () => createPersona(baseArgs({ confidence: 'CUSTOMER_VALIDATED', evidenceType: 'AFFILIATE_EVIDENCE_CONTEXTUAL' })),
      /CUSTOMER_VALIDATED/
    );
    // Con evidenceType CUSTOMER_EVIDENCE real, sí se permite.
    const persona = createPersona(baseArgs({ confidence: 'CUSTOMER_VALIDATED', evidenceType: 'CUSTOMER_EVIDENCE' }));
    assert.equal(persona.confidence, 'CUSTOMER_VALIDATED');
  });

  test('los enums exportados contienen exactamente los valores esperados', () => {
    assert.deepEqual([...PERSONA_CONFIDENCE_LEVELS], ['PROVISIONAL', 'CUSTOMER_VALIDATED', 'UNKNOWN']);
    assert.deepEqual([...PERSONA_EVIDENCE_TYPES], ['MARKET_EVIDENCE', 'CUSTOMER_EVIDENCE', 'AFFILIATE_EVIDENCE_CONTEXTUAL', 'UNKNOWN']);
  });
});
