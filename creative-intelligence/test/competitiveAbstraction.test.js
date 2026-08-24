import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCompetitorCreativeRecord, createAbstractionRecord, abstractFromRawRecord,
  assertNotCopy, createOpportunity, computeEvidenceStrength, FIELD_KIND,
} from '../src/competitiveAbstraction.js';
import { createDataPoint, createObservation, createPattern } from '../src/evidenceTaxonomy.js';

function rawRecord(overrides = {}) {
  return createCompetitorCreativeRecord({
    competitorId: 'competitor-A',
    accountId: '@marca_competidora',
    platforms: ['instagram'],
    permalink: 'https://instagram.com/p/xyz',
    mediaType: 'VIDEO',
    caption: 'El secreto que tu doctor no te dice sobre la hinchazón #bienestar',
    hook: '¿Sabías que la hinchazón no es normal?',
    structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' },
    longevity: '45 días',
    sourceType: 'PAID',
    ...overrides,
  });
}

describe('Competitive abstraction validation', () => {
  test('CompetitorCreativeRecord exige caption real (evidencia cruda) y sourceType ORGANIC/PAID', () => {
    assert.throws(() => rawRecord({ caption: '' }));
    assert.throws(() => rawRecord({ sourceType: 'BOTH' }));
    const record = rawRecord();
    assert.ok(record.competitorCreativeRecordId);
  });

  test('FIELD_KIND clasifica caption/transcript como OBSERVED y persona/pain/awareness hypothesis como INFERRED', () => {
    assert.equal(FIELD_KIND.caption, 'OBSERVED');
    assert.equal(FIELD_KIND.personaHypothesis, 'INFERRED');
    assert.equal(FIELD_KIND.structuralSignature, 'INFERRED');
  });

  test('AbstractionRecord nunca acepta caption/transcript/hook literal — la forma del objeto no tiene esos campos', () => {
    const record = createAbstractionRecord({
      personaHypothesis: 'Persona escéptica de la medicina tradicional',
      painHypothesis: 'Desconfianza en diagnósticos genéricos',
      awareness: 'Problem Aware',
      angle: 'Reencuadre autoridad vs. desconfianza',
      mechanismFraming: 'autoridad clínica como puente de confianza',
      format: 'Pharmacist / authority figure in-studio',
      narrativeStructure: 'autoridad → reencuadre → revelación',
      observedEvidenceRef: { recordId: 'raw-1', summary: 'cluster de 2 anuncios activos 40+ días' },
      confidence: 'medium',
    });
    assert.equal('caption' in record, false);
    assert.equal('transcript' in record, false);
    assert.equal('hook' in record, false);
  });

  test('síntesis ciega: abstractFromRawRecord nunca copia caption/transcript hacia el resultado', () => {
    const raw = rawRecord();
    const abstraction = abstractFromRawRecord(raw, {
      personaHypothesis: 'Persona escéptica de la medicina tradicional',
      painHypothesis: 'Desconfianza en diagnósticos genéricos',
      awareness: 'Problem Aware',
      angle: 'Reencuadre autoridad vs. desconfianza',
      mechanismFraming: 'autoridad clínica como puente de confianza',
      format: 'Pharmacist / authority figure in-studio',
      narrativeStructure: 'autoridad → reencuadre → revelación',
      evidenceSummary: 'anuncio único, 45 días activo, narrador experto en estudio',
      confidence: 'low',
    });
    const serialized = JSON.stringify(abstraction);
    assert.equal(serialized.includes(raw.caption), false, 'el caption literal del competidor no debe aparecer en el AbstractionRecord serializado');
    assert.equal(serialized.includes(raw.hook), false);
    assert.equal(abstraction.observedEvidenceRef.recordId, raw.competitorCreativeRecordId);
  });

  test('abstractFromRawRecord exige evidenceSummary (referencia, no el texto crudo)', () => {
    assert.throws(() => abstractFromRawRecord(rawRecord(), {
      personaHypothesis: 'x', painHypothesis: 'x', awareness: 'Problem Aware', angle: 'x',
      mechanismFraming: 'x', format: 'x', narrativeStructure: 'x', evidenceSummary: '', confidence: 'low',
    }));
  });
});

describe('Barrera anti-copia — COPY / PATTERN / INSIGHT / OPPORTUNITY', () => {
  test('assertNotCopy rechaza un concepto idéntico al texto literal de origen', () => {
    assert.throws(() => assertNotCopy({ conceptText: 'El secreto que tu doctor no te dice', sourceLiteralText: 'El secreto que tu doctor no te dice' }));
    assert.equal(assertNotCopy({ conceptText: 'Una narrativa distinta sobre confianza médica', sourceLiteralText: 'El secreto que tu doctor no te dice' }), true);
  });

  test('createOpportunity exige explicar por qué es distinta del original', () => {
    assert.throws(() => createOpportunity({ description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: '' }));
    const opp = createOpportunity({ description: 'Explorar autoridad clínica para Vida Divina en digestión', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: 'Usa mecanismo distinto (evidencia de ingredientes) en vez de reencuadre de miedo' });
    assert.equal(opp.level, 'OPPORTUNITY');
  });

  test('computeEvidenceStrength escala con repetición entre competidores, nunca con 1 sola pieza como "high"', () => {
    const single = computeEvidenceStrength([{ structuralSignature: { a: 1 } }]);
    assert.equal(single.strength, 'low');
    const multiple = computeEvidenceStrength([{ structuralSignature: { a: 1 } }, { structuralSignature: { a: 2 } }, { structuralSignature: { a: 3 } }, { structuralSignature: { a: 4 } }]);
    assert.equal(multiple.strength, 'high');
    assert.equal(computeEvidenceStrength([]).strength, 'INSUFFICIENT_DATA');
  });
});

describe('AbstractionRecord — señales estructurales adicionales (Fase: Preparar Competitive Intelligence)', () => {
  function baseFields() {
    return {
      personaHypothesis: 'Persona escéptica de la medicina tradicional',
      painHypothesis: 'Desconfianza en diagnósticos genéricos',
      awareness: 'Problem Aware',
      angle: 'Reencuadre autoridad vs. desconfianza',
      mechanismFraming: 'autoridad clínica como puente de confianza',
      format: 'Pharmacist / authority figure in-studio',
      narrativeStructure: 'autoridad → reencuadre → revelación',
      observedEvidenceRef: { recordId: 'raw-1', summary: 'cluster de 2 anuncios activos 40+ días' },
      confidence: 'medium',
    };
  }

  test('acepta hookStructure/narratorType/sceneSetup/editRhythm válidos, todos opcionales', () => {
    const record = createAbstractionRecord({
      ...baseFields(),
      hookStructure: 'revelación de autoridad en los primeros 3 segundos',
      narratorType: 'expert',
      sceneSetup: 'studio',
      editRhythm: 'slow cut',
    });
    assert.equal(record.hookStructure, 'revelación de autoridad en los primeros 3 segundos');
    assert.equal(record.narratorType, 'expert');
    assert.equal(record.sceneSetup, 'studio');
    assert.equal(record.editRhythm, 'slow cut');
  });

  test('narratorType/sceneSetup/editRhythm quedan null cuando no aplican (ej. anuncio estático) — nunca inventados', () => {
    const record = createAbstractionRecord(baseFields());
    assert.equal(record.hookStructure, null);
    assert.equal(record.narratorType, null);
    assert.equal(record.sceneSetup, null);
    assert.equal(record.editRhythm, null);
  });

  test('rechaza narratorType/sceneSetup/editRhythm fuera de los enums de format.js', () => {
    assert.throws(() => createAbstractionRecord({ ...baseFields(), narratorType: 'robot' }));
    assert.throws(() => createAbstractionRecord({ ...baseFields(), sceneSetup: 'space' }));
    assert.throws(() => createAbstractionRecord({ ...baseFields(), editRhythm: 'no cuts' }));
  });

  test('abstractFromRawRecord rechaza hookStructure idéntico al hook literal del competidor', () => {
    const raw = createCompetitorCreativeRecord({
      competitorId: 'competitor-A', accountId: '@marca_competidora', platforms: ['instagram'],
      permalink: 'https://instagram.com/p/xyz', mediaType: 'VIDEO',
      caption: 'texto de ejemplo', hook: '¿Sabías que la hinchazón no es normal?',
      sourceType: 'PAID',
    });
    assert.throws(() => abstractFromRawRecord(raw, {
      ...baseFields(), hookStructure: '¿Sabías que la hinchazón no es normal?',
      evidenceSummary: 'resumen', confidence: 'low',
    }), /idéntico al hook literal/);
  });

  test('abstractFromRawRecord infiere narratorType/sceneSetup/editRhythm desde structuralSignature cuando no se dan explícitos', () => {
    const raw = createCompetitorCreativeRecord({
      competitorId: 'competitor-A', accountId: '@marca_competidora', platforms: ['instagram'],
      permalink: 'https://instagram.com/p/xyz', mediaType: 'VIDEO', caption: 'texto',
      structuralSignature: { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'fast cut' },
      sourceType: 'ORGANIC',
    });
    const abstraction = abstractFromRawRecord(raw, { ...baseFields(), evidenceSummary: 'resumen', confidence: 'low' });
    assert.equal(abstraction.narratorType, 'creator');
    assert.equal(abstraction.sceneSetup, 'home');
    assert.equal(abstraction.editRhythm, 'fast cut');
  });
});

describe('CompetitorCreativeRecord — campos de Meta Ad Library (opcionales, null/UNKNOWN por defecto)', () => {
  test('acepta landingDestination/spendRange/impressionRange/activeStatus/mediaReference', () => {
    const record = createCompetitorCreativeRecord({
      competitorId: 'competitor-A', accountId: 'Marca Competidora MX', platforms: ['facebook'],
      permalink: 'https://www.facebook.com/ads/library/?id=1', mediaType: 'VIDEO', caption: 'copy real',
      sourceType: 'PAID', landingDestination: 'https://marca.mx/oferta', spendRange: '$100-499',
      impressionRange: '1K-5K', activeStatus: 'ACTIVE', mediaReference: 'https://cdn/media.mp4',
    });
    assert.equal(record.landingDestination, 'https://marca.mx/oferta');
    assert.equal(record.spendRange, '$100-499');
    assert.equal(record.impressionRange, '1K-5K');
    assert.equal(record.activeStatus, 'ACTIVE');
    assert.equal(record.mediaReference, 'https://cdn/media.mp4');
  });

  test('sin esos campos, quedan null/UNKNOWN por defecto — nunca inventados', () => {
    const record = createCompetitorCreativeRecord({
      competitorId: 'competitor-A', accountId: '@marca', platforms: ['instagram'],
      permalink: 'https://instagram.com/p/xyz', mediaType: 'IMAGE', caption: 'copy real', sourceType: 'ORGANIC',
    });
    assert.equal(record.landingDestination, null);
    assert.equal(record.spendRange, 'UNKNOWN');
    assert.equal(record.impressionRange, 'UNKNOWN');
    assert.equal(record.activeStatus, 'UNKNOWN');
    assert.equal(record.mediaReference, null);
  });

  test('FIELD_KIND clasifica los 5 campos nuevos como OBSERVED_OR_UNKNOWN, nunca INFERRED', () => {
    for (const field of ['landingDestination', 'spendRange', 'impressionRange', 'activeStatus', 'mediaReference']) {
      assert.equal(FIELD_KIND[field], 'OBSERVED_OR_UNKNOWN');
    }
  });
});

describe('Opportunity — informedByPattern (Competitor Evidence → Abstraction → Pattern → Opportunity)', () => {
  function competitivePattern() {
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'format', value: 'Podcast clip', source: 'ad_library' });
    const obs1 = createObservation({ domain: 'COMPETITIVE', description: 'Competidor A usa podcast clip', basedOnData: [data] });
    const obs2 = createObservation({ domain: 'COMPETITIVE', description: 'Competidor B usa podcast clip', basedOnData: [data] });
    return createPattern({ domain: 'COMPETITIVE', description: 'Formato podcast clip se repite entre competidores', basedOnObservations: [obs1, obs2] });
  }

  test('acepta un Pattern real de dominio COMPETITIVE', () => {
    const pattern = competitivePattern();
    const opp = createOpportunity({
      description: 'Explorar formato podcast clip para Vida Divina',
      basedOnAbstractionRecords: [{ abstractionRecordId: '1' }],
      whyDifferentFromSource: 'Usa mecanismo de ingredientes distinto',
      informedByPattern: pattern,
    });
    assert.equal(opp.informedByPattern.patternId, pattern.patternId);
  });

  test('sin informedByPattern, queda null — nunca inventado', () => {
    const opp = createOpportunity({
      description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: 'y',
    });
    assert.equal(opp.informedByPattern, null);
  });

  test('rechaza informedByPattern que no sea un Pattern real de dominio COMPETITIVE', () => {
    assert.throws(() => createOpportunity({
      description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: 'y',
      informedByPattern: { domain: 'OWN_PERFORMANCE', type: 'PATTERN', patternId: 'p1' },
    }));
    assert.throws(() => createOpportunity({
      description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: 'y',
      informedByPattern: { foo: 'bar' },
    }));
  });
});
