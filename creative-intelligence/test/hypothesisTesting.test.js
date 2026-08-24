// hypothesisTesting.test.js — Fase 5: AI-Assisted Customer Research +
// Hypothesis-Driven Creative Testing. Cubre MODE A (EVIDENCE_BASED,
// analyzeCustomerEvidence) y MODE B (HYPOTHESIS_TESTING, createPersonaHypothesis/
// createPainHypothesis/createCreativeVariant/createExperiment), estrictamente
// separados de Persona/Pain/CreativeCell reales (persona.js/pain.js/
// creativeCell.js, sin tocar).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESEARCH_MODES, HYPOTHESIS_BASIS_TYPES,
  createPersonaHypothesis, createPainHypothesis, createCreativeVariant, createExperiment,
  analyzeCustomerEvidence, DEFAULT_MIN_CUSTOMER_EVIDENCE_RECORDS,
} from '../src/hypothesisTesting.js';
import { buildEvidenceIndex } from '../orchestrator/stages/evidenceIndex.js';
import { createPersona } from '../src/persona.js';
import { createPain } from '../src/pain.js';

function productFactBasis(overrides = {}) {
  return [{ type: 'PRODUCT_FACT', ref: 'beneficios', detail: 'Aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro.', ...overrides }];
}

describe('Fase 2: los dos modos son un vocabulario estructurado real, no un comentario', () => {
  test('RESEARCH_MODES contiene exactamente EVIDENCE_BASED y HYPOTHESIS_TESTING', () => {
    assert.deepEqual([...RESEARCH_MODES], ['EVIDENCE_BASED', 'HYPOTHESIS_TESTING']);
  });

  test('toda entidad de hipótesis expone su propio campo "mode", consultable directamente', () => {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    assert.equal(persona.mode, 'HYPOTHESIS_TESTING');
  });
});

describe('Requisito 3/5: toda hipótesis está marcada HYPOTHESIS, nunca CUSTOMER_VALIDATED', () => {
  test('createPersonaHypothesis siempre produce status:HYPOTHESIS, sin campo confidence ni evidenceType (nunca puede parecer una Persona real validada)', () => {
    const persona = createPersonaHypothesis({ name: 'La Interesada en Fuerza', lifeSituation: 'Busca recuperar masa muscular.', relationshipToProblem: 'Nota pérdida de fuerza con la edad.', basis: productFactBasis() });
    assert.equal(persona.status, 'HYPOTHESIS');
    assert.ok(!('confidence' in persona));
    assert.ok(!('evidenceType' in persona));
    assert.ok(!('verbatimPhrases' in persona));
    assert.match(persona.disclaimer, /NO representa conocimiento validado del cliente/);
  });

  test('createPainHypothesis siempre produce status:HYPOTHESIS, sin verbatimQuote/sourcePlatform (nunca puede parecer un Pain real)', () => {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    const pain = createPainHypothesis({ personaHypothesisId: persona.personaHypothesisId, painPoint: 'Podría existir preocupación por perder masa muscular con la edad', basis: productFactBasis() });
    assert.equal(pain.status, 'HYPOTHESIS');
    assert.ok(!('verbatimQuote' in pain));
    assert.ok(!('sourcePlatform' in pain));
    assert.ok(!('confidence' in pain));
  });

  test('imposible obtener confidence:CUSTOMER_VALIDATED de ninguna función de este módulo -- ningún parámetro lo acepta', () => {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis(), confidence: 'CUSTOMER_VALIDATED' });
    assert.ok(!('confidence' in persona), 'un intento de inyectar "confidence" se ignora -- el campo ni siquiera existe en la forma de PersonaHypothesis');
  });
});

describe('Requisito 6: Product Facts pueden alimentar hipótesis', () => {
  test('basis con type PRODUCT_FACT es aceptado', () => {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    assert.equal(persona.basis[0].type, 'PRODUCT_FACT');
    assert.equal(persona.basis[0].detail, 'Aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro.');
  });
});

describe('Requisito 7: Product Facts nunca se convierten automáticamente en Customer Evidence', () => {
  test('una PersonaHypothesis basada en Product Facts nunca puede pasar createPersona() (constructor real de Persona) sin fabricar verbatims', () => {
    const personaHypothesis = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    // Intentar reusar los campos de la hipótesis para construir una Persona
    // real falla exactamente porque no hay verbatimPhrases reales -- prueba
    // estructural de que basis (Product Fact) no puede colarse como
    // evidencia de cliente real.
    assert.throws(() => createPersona({
      name: personaHypothesis.name, lifeSituation: personaHypothesis.lifeSituation, relationshipToProblem: personaHypothesis.relationshipToProblem,
      verbatimPhrases: [], evidenceType: 'CUSTOMER_EVIDENCE', confidence: 'CUSTOMER_VALIDATED',
    }), /verbatimPhrases/);
  });

  test('createCustomerEvidenceRecord (Fase 4C) rechaza un objeto con forma de basis PRODUCT_FACT -- no tiene evidenceId/verbatimQuote/sourcePlatform', async () => {
    const { createCustomerEvidenceRecord } = await import('../src/customerEvidenceRecord.js');
    assert.throws(() => createCustomerEvidenceRecord(productFactBasis()[0]), /evidenceId|verbatimQuote|sourcePlatform/);
  });
});

describe('Requisito 8/9: Market Evidence puede alimentar hipótesis, pero evidenceIds inexistentes se rechazan', () => {
  function marketEvidenceIndex() {
    return buildEvidenceIndex([{ domain: 'MARKET_EVIDENCE', records: [{ evidenceId: 'ME-HYP-01', verbatimQuote: 'ya no tengo la fuerza de antes', sourcePlatform: 'foro-salud-real.example' }] }]);
  }

  test('basis con type MARKET_EVIDENCE citando un evidenceId real (verificado contra un evidenceIndex real) es aceptado', () => {
    const persona = createPersonaHypothesis({
      name: 'x', lifeSituation: 'y', relationshipToProblem: 'z',
      basis: [{ type: 'MARKET_EVIDENCE', ref: 'ME-HYP-01', detail: 'ya no tengo la fuerza de antes' }],
      evidenceIndex: marketEvidenceIndex(),
    });
    assert.equal(persona.basis[0].ref, 'ME-HYP-01');
  });

  test('basis con type MARKET_EVIDENCE citando un evidenceId que NO existe en el evidenceIndex se rechaza -- nunca se fabrica un evidenceId', () => {
    assert.throws(() => createPersonaHypothesis({
      name: 'x', lifeSituation: 'y', relationshipToProblem: 'z',
      basis: [{ type: 'MARKET_EVIDENCE', ref: 'ME-NO-EXISTE', detail: 'texto inventado' }],
      evidenceIndex: marketEvidenceIndex(),
    }), /no existe en el evidenceIndex/);
  });

  test('un type de basis fuera del vocabulario (ej. CUSTOMER_EVIDENCE) se rechaza -- eso sería evidencia real, no una hipótesis', () => {
    assert.throws(() => createPersonaHypothesis({
      name: 'x', lifeSituation: 'y', relationshipToProblem: 'z',
      basis: [{ type: 'CUSTOMER_EVIDENCE', ref: 'CE-01', detail: 'x' }],
    }), /type inválido/);
    assert.ok(!HYPOTHESIS_BASIS_TYPES.includes('CUSTOMER_EVIDENCE'));
    assert.ok(!HYPOTHESIS_BASIS_TYPES.includes('CUSTOMER_RESEARCH'));
  });
});

describe('Requisito 4: las variantes de un Experiment son realmente diferentes', () => {
  function twoDistinctVariants() {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    const pain = createPainHypothesis({ personaHypothesisId: persona.personaHypothesisId, painPoint: 'p', basis: productFactBasis() });
    const variantA = createCreativeVariant({ personaHypothesisId: persona.personaHypothesisId, painHypothesisId: pain.painHypothesisId, awareness: 'Problem Aware', angleText: 'Angle A', hook: 'Hook A', format: 'Educational walk-and-talk', mechanism: 'mech A' });
    const variantB = createCreativeVariant({ personaHypothesisId: persona.personaHypothesisId, painHypothesisId: pain.painHypothesisId, awareness: 'Problem Aware', angleText: 'Angle B', hook: 'Hook B', format: 'POV personal story', mechanism: 'mech B' });
    return { persona, pain, variantA, variantB };
  }

  test('2 variantes con angle/hook/format distintos forman un Experiment válido', () => {
    const { variantA, variantB } = twoDistinctVariants();
    const experiment = createExperiment({ productBasis: productFactBasis(), variants: [variantA, variantB] });
    assert.equal(experiment.variants.length, 2);
  });

  test('2 variantes IDÉNTICAS (mismo angle+hook+format) se rechazan -- no son "diversidad", son la misma variante con distinto id', () => {
    const { variantA } = twoDistinctVariants();
    const variantACopy = { ...variantA, variantId: 'otro-id-pero-mismo-contenido' };
    assert.throws(() => createExperiment({ productBasis: productFactBasis(), variants: [variantA, variantACopy] }), /realmente diferentes/);
  });

  test('menos del mínimo de variantes se rechaza -- HYPOTHESIS_TESTING nunca genera una sola variante por defecto', () => {
    const { variantA } = twoDistinctVariants();
    assert.throws(() => createExperiment({ productBasis: productFactBasis(), variants: [variantA] }), /al menos 2/);
  });

  test('minVariants es configurable y respeta el límite pedido explícitamente', () => {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    const pain = createPainHypothesis({ personaHypothesisId: persona.personaHypothesisId, painPoint: 'p', basis: productFactBasis() });
    const variants = ['A', 'B', 'C'].map((label) => createCreativeVariant({
      personaHypothesisId: persona.personaHypothesisId, painHypothesisId: pain.painHypothesisId, awareness: 'Problem Aware',
      angleText: `Angle ${label}`, hook: `Hook ${label}`, format: 'Educational walk-and-talk', mechanism: `mech ${label}`,
    }));
    assert.throws(() => createExperiment({ productBasis: productFactBasis(), variants, minVariants: 5 }), /al menos 5/);
    assert.doesNotThrow(() => createExperiment({ productBasis: productFactBasis(), variants, minVariants: 3 }));
  });
});

describe('Experiment — gate de aprobación humana (reutiliza el formato de Fase 4D, nunca lo duplica)', () => {
  function validExperimentArgs() {
    const persona = createPersonaHypothesis({ name: 'x', lifeSituation: 'y', relationshipToProblem: 'z', basis: productFactBasis() });
    const pain = createPainHypothesis({ personaHypothesisId: persona.personaHypothesisId, painPoint: 'p', basis: productFactBasis() });
    const variantA = createCreativeVariant({ personaHypothesisId: persona.personaHypothesisId, painHypothesisId: pain.painHypothesisId, awareness: 'Problem Aware', angleText: 'Angle A', hook: 'Hook A', format: 'Educational walk-and-talk', mechanism: 'mech A' });
    const variantB = createCreativeVariant({ personaHypothesisId: persona.personaHypothesisId, painHypothesisId: pain.painHypothesisId, awareness: 'Problem Aware', angleText: 'Angle B', hook: 'Hook B', format: 'POV personal story', mechanism: 'mech B' });
    return { productBasis: productFactBasis(), variants: [variantA, variantB] };
  }

  test('acepta gate legado (string) igual que CycleOutput', () => {
    const experiment = createExperiment({ ...validExperimentArgs(), gateStatus: { strategyApproval: 'PENDING' } });
    assert.equal(experiment.gateStatus.strategyApproval, 'PENDING');
  });

  test('acepta gate en formato nuevo (Fase 4D) con reviewedAt real', () => {
    const experiment = createExperiment({ ...validExperimentArgs(), gateStatus: { strategyApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T12:00:00.000Z', reviewedBy: 'operador-real' } } });
    assert.equal(experiment.gateStatus.strategyApproval.status, 'APPROVED');
  });

  test('un gate inválido (fuera del enum, o APPROVED sin reviewedAt en formato nuevo) se rechaza -- misma validación exacta que CycleOutput', () => {
    assert.throws(() => createExperiment({ ...validExperimentArgs(), gateStatus: { strategyApproval: 'MAYBE' } }), /inválido/);
    assert.throws(() => createExperiment({ ...validExperimentArgs(), gateStatus: { strategyApproval: { status: 'APPROVED' } } }), /reviewedAt/);
  });

  test('por defecto (sin gateStatus explícito), el experimento nace PENDING -- nunca aprobado automáticamente', () => {
    const experiment = createExperiment(validExperimentArgs());
    assert.equal(experiment.gateStatus.strategyApproval, 'PENDING');
  });
});

describe('Mode A — analyzeCustomerEvidence (EVIDENCE_BASED)', () => {
  test('Requisito 1: sin suficiente CUSTOMER_EVIDENCE real, devuelve INSUFFICIENT_EVIDENCE explícito, nunca inventa un borrador', () => {
    const index = buildEvidenceIndex([{ domain: 'CUSTOMER_EVIDENCE', records: [{ evidenceId: 'CE-01', verbatimQuote: 'x', sourcePlatform: 'y' }] }]);
    const result = analyzeCustomerEvidence({ evidenceIndex: index });
    assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(result.mode, 'EVIDENCE_BASED');
    assert.equal(result.availableCustomerEvidenceCount, 1);
    assert.equal(result.minRequired, DEFAULT_MIN_CUSTOMER_EVIDENCE_RECORDS);
  });

  test('Requisito 10: con suficiente CUSTOMER_EVIDENCE real, produce un DRAFT real citando los evidenceIds reales -- nunca CUSTOMER_VALIDATED', () => {
    const index = buildEvidenceIndex([{
      domain: 'CUSTOMER_EVIDENCE',
      records: [
        { evidenceId: 'CE-01', verbatimQuote: 'me ayudó de verdad', sourcePlatform: 'reseña real' },
        { evidenceId: 'CE-02', verbatimQuote: 'ya llevo 3 pedidos', sourcePlatform: 'reseña real' },
        { evidenceId: 'CE-03', verbatimQuote: 'lo recomiendo', sourcePlatform: 'reseña real' },
      ],
    }]);
    const result = analyzeCustomerEvidence({ evidenceIndex: index });
    assert.equal(result.status, 'DRAFT');
    assert.equal(result.mode, 'EVIDENCE_BASED');
    assert.deepEqual([...result.evidenceIds], ['CE-01', 'CE-02', 'CE-03']);
    assert.equal(result.verbatimQuotes.length, 3);
    assert.ok(!('confidence' in result));
    assert.match(result.disclaimer, /revisión humana/);
  });

  test('MARKET_EVIDENCE en el mismo índice no cuenta para el umbral de CUSTOMER_EVIDENCE -- nunca se mezclan dominios', () => {
    const index = buildEvidenceIndex([
      { domain: 'CUSTOMER_EVIDENCE', records: [{ evidenceId: 'CE-01', verbatimQuote: 'x', sourcePlatform: 'y' }] },
      { domain: 'MARKET_EVIDENCE', records: [{ evidenceId: 'ME-01', verbatimQuote: 'a', sourcePlatform: 'b' }, { evidenceId: 'ME-02', verbatimQuote: 'c', sourcePlatform: 'd' }] },
    ]);
    const result = analyzeCustomerEvidence({ evidenceIndex: index });
    assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(result.availableCustomerEvidenceCount, 1);
  });
});

describe('Requisito 11: EVIDENCE_BASED exige Human Review antes de CUSTOMER_VALIDATED', () => {
  test('el DRAFT de analyzeCustomerEvidence no es, por sí mismo, una Persona -- un humano debe construir el personaCandidate real y pasarlo por personaStage.js explícitamente', async () => {
    const { runPersonaStage } = await import('../orchestrator/stages/personaStage.js');
    const index = buildEvidenceIndex([{
      domain: 'CUSTOMER_EVIDENCE',
      records: [
        { evidenceId: 'CE-11-01', verbatimQuote: 'me ayudó de verdad', sourcePlatform: 'reseña real' },
        { evidenceId: 'CE-11-02', verbatimQuote: 'ya llevo 3 pedidos', sourcePlatform: 'reseña real' },
        { evidenceId: 'CE-11-03', verbatimQuote: 'lo recomiendo', sourcePlatform: 'reseña real' },
      ],
    }]);
    const draft = analyzeCustomerEvidence({ evidenceIndex: index });
    assert.equal(draft.status, 'DRAFT');
    // El DRAFT no es una Persona ni tiene confidence -- construirla exige
    // un paso humano explícito (redactar name/lifeSituation/etc.) que llame
    // a personaStage.js, sin cambios, con requestCustomerValidated explícito.
    const { personas } = runPersonaStage({
      personaCandidates: [{
        name: 'Clienta Confirmada (revisión humana)', lifeSituation: 'Ya es clienta real, confirma el resultado.', relationshipToProblem: 'Compró y reporta el efecto real.',
        verbatimEvidenceIds: [...draft.evidenceIds], requestCustomerValidated: true,
      }],
      evidenceIndex: index,
    });
    assert.equal(personas[0].confidence, 'CUSTOMER_VALIDATED');
    assert.equal(personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
  });
});

describe('Requisito 12: Performance Signals no se convierten automáticamente en Customer Evidence', () => {
  test('performance-learning-intelligence#createPerformanceSignal (reutilizado, no duplicado) nunca produce una forma de CustomerEvidenceRecord', async () => {
    const { createPerformanceSignal } = await import('../../performance-learning-intelligence/src/performanceSignal.js');
    const signal = createPerformanceSignal({ content_id: 'variant-A-real', metric: 'ctr', observed_value: 0.05, baseline: { baseline_value: 0.03, sample_size: 10, insufficient: false } });
    assert.ok(!('verbatimQuote' in signal));
    assert.ok(!('sourcePlatform' in signal));
    assert.ok(!('evidenceDomain' in signal));
    assert.ok(!('personaId' in signal));
    assert.equal(signal.requires_human_review, true);
    assert.notEqual(signal.signal_type, 'CUSTOMER_VALIDATED');
  });
});
