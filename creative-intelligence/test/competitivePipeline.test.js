import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveDataPointFromCompetitorRecord, deriveCompetitiveObservation, deriveCompetitivePattern,
  deriveCompetitiveLearning, deriveCompetitiveRecommendation, buildCreativeCellEvidenceFromOpportunity,
  computeStrategicPriority, summarizeEvidenceAndPriority, selectPriorityCreativeCells,
} from '../src/competitivePipeline.js';
import { createCompetitorCreativeRecord, createAbstractionRecord, abstractFromRawRecord, assertNotCopy, createOpportunity, computeEvidenceStrength } from '../src/competitiveAbstraction.js';
import { createDataPoint, createPattern, createObservation, FORBIDDEN_INFERRED_METRICS } from '../src/evidenceTaxonomy.js';
import { createCreativeCell } from '../src/creativeCell.js';
import { computeAndromedaRisk } from '../src/format.js';

function competitorRecord(overrides = {}) {
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

function abstraction(overrides = {}) {
  return createAbstractionRecord({
    personaHypothesis: 'Persona escéptica de la medicina tradicional',
    painHypothesis: 'Desconfianza en diagnósticos genéricos',
    awareness: 'Problem Aware',
    angle: 'Reencuadre autoridad vs. desconfianza',
    mechanismFraming: 'autoridad clínica como puente de confianza',
    format: 'Pharmacist / authority figure in-studio',
    narrativeStructure: 'autoridad → reencuadre → revelación',
    observedEvidenceRef: { recordId: 'raw-1', summary: 'cluster de 2 anuncios activos 40+ días' },
    confidence: 'medium',
    ...overrides,
  });
}

// 1-2-3. competitor evidence ≠ sales evidence / no produce ROAS / no produce CPA
describe('1-3. Competitor evidence nunca produce sales/ROAS/CPA', () => {
  test('deriveDataPointFromCompetitorRecord rechaza construir un DataPoint desde un campo INFERRED', () => {
    const record = competitorRecord();
    assert.throws(() => deriveDataPointFromCompetitorRecord(record, 'personaHypothesis'), /no es un campo OBSERVED/);
    assert.throws(() => deriveDataPointFromCompetitorRecord(record, 'structuralSignature'), /no es un campo OBSERVED/);
  });

  test('createDataPoint rechaza sales/roas/cpa/conversions/realAudience para COMPETITIVE salvo UNKNOWN', () => {
    for (const field of FORBIDDEN_INFERRED_METRICS) {
      assert.throws(() => createDataPoint({ domain: 'COMPETITIVE', field, value: 3.1, source: 'x' }));
    }
  });

  test('un Learning basado solo en evidencia COMPETITIVE que afirma "vende"/ROAS/CPA es rechazado', () => {
    const record1 = competitorRecord();
    const record2 = competitorRecord({ permalink: 'https://instagram.com/p/otro' });
    const obs1 = deriveCompetitiveObservation(record1, 'Anuncio A activo 45 días', ['longevity']);
    const obs2 = deriveCompetitiveObservation(record2, 'Anuncio B activo 45 días', ['longevity']);
    const pattern = deriveCompetitivePattern([obs1, obs2], 'Longevidad alta se repite entre competidores');
    assert.throws(() => deriveCompetitiveLearning([pattern], 'este anuncio vende muy bien'), /Meta no expone performance real/);
    assert.throws(() => deriveCompetitiveLearning([pattern], 'genera un ROAS excelente'), /Meta no expone performance real/);
    assert.throws(() => deriveCompetitiveLearning([pattern], 'tiene un CPA bajo'), /Meta no expone performance real/);
  });

  test('una Recommendation basada en Learning solo-COMPETITIVE tampoco puede afirmar resultado de negocio', () => {
    const record1 = competitorRecord();
    const record2 = competitorRecord({ permalink: 'https://instagram.com/p/otro' });
    const obs1 = deriveCompetitiveObservation(record1, 'a', ['longevity']);
    const obs2 = deriveCompetitiveObservation(record2, 'b', ['longevity']);
    const pattern = deriveCompetitivePattern([obs1, obs2], 'patrón real');
    const learning = deriveCompetitiveLearning([pattern], 'la estructura merece consideración estratégica');
    assert.throws(() => deriveCompetitiveRecommendation(learning, 'esto vende muy bien'), /Meta no expone performance real/);
    const rec = deriveCompetitiveRecommendation(learning, 'explorar una hipótesis propia inspirada en el patrón');
    assert.equal(rec.autoExecutes, false);
  });
});

// 4. AbstractionRecord no requiere creative literal
describe('4. AbstractionRecord no requiere el creativo literal', () => {
  test('la forma del objeto no tiene caption/transcript/hook', () => {
    const record = abstraction();
    assert.equal('caption' in record, false);
    assert.equal('transcript' in record, false);
    assert.equal('hook' in record, false);
  });

  test('abstractFromRawRecord nunca copia el caption/hook original hacia el resultado', () => {
    const raw = competitorRecord();
    const abs = abstractFromRawRecord(raw, {
      personaHypothesis: 'x', painHypothesis: 'y', awareness: 'Problem Aware', angle: 'z',
      mechanismFraming: 'm', format: 'Pharmacist / authority figure in-studio', narrativeStructure: 'n',
      evidenceSummary: 'resumen no literal', confidence: 'low',
    });
    const serialized = JSON.stringify(abs);
    assert.equal(serialized.includes(raw.caption), false);
    assert.equal(serialized.includes(raw.hook), false);
  });
});

// 5. Opportunity no equivale a copy
describe('5. Opportunity no equivale a copy', () => {
  test('assertNotCopy rechaza un concepto idéntico al texto literal', () => {
    assert.throws(() => assertNotCopy({ conceptText: 'X', sourceLiteralText: 'X' }));
  });

  test('createOpportunity exige whyDifferentFromSource — nunca es solo el texto original', () => {
    assert.throws(() => createOpportunity({
      description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: '',
    }));
  });
});

// 6-7. Opportunity puede alimentar CreativeCell / CreativeCell mantiene Persona/Pain/Awareness/Angle/Format
describe('6-7. Opportunity alimenta una CreativeCell que mantiene Persona/Pain/Awareness/Angle/Format', () => {
  test('buildCreativeCellEvidenceFromOpportunity produce evidence utilizable por createCreativeCell', () => {
    const opp = createOpportunity({
      description: 'Explorar autoridad clínica para Vida Divina en digestión',
      basedOnAbstractionRecords: [{ abstractionRecordId: '1' }],
      whyDifferentFromSource: 'Usa evidencia de ingredientes en vez de reencuadre de miedo',
    });

    const evidence = buildCreativeCellEvidenceFromOpportunity(opp);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].type, 'OPPORTUNITY');
    assert.equal(evidence[0].opportunityId, opp.opportunityId);

    // La CreativeCell sigue exigiendo Persona/Pain/Awareness/Angle/Format
    // REALES de Vida Divina — la Opportunity nunca los reemplaza, solo se
    // adjunta como evidencia (regla central de esta fase).
    const cell = createCreativeCell({
      personaId: 'persona-vd-1', painId: 'pain-vd-1', awareness: 'Problem Aware',
      angleId: 'angle-vd-1', formatId: 'format-vd-1', mechanism: 'autoridad clínica',
      evidence,
    });
    assert.equal(cell.personaId, 'persona-vd-1');
    assert.equal(cell.painId, 'pain-vd-1');
    assert.equal(cell.awareness, 'Problem Aware');
    assert.equal(cell.angleId, 'angle-vd-1');
    assert.equal(cell.formatId, 'format-vd-1');
    assert.equal(cell.evidence[0].opportunityId, opp.opportunityId);
  });

  test('buildCreativeCellEvidenceFromOpportunity rechaza una Opportunity inventada (sin level real)', () => {
    assert.throws(() => buildCreativeCellEvidenceFromOpportunity({ description: 'x' }), /Opportunity real/);
  });

  test('createCreativeCell sigue rechazando la ausencia de Persona/Pain/Angle/Format aunque haya evidencia competitiva', () => {
    const opp = createOpportunity({
      description: 'x', basedOnAbstractionRecords: [{ abstractionRecordId: '1' }], whyDifferentFromSource: 'y',
    });
    const evidence = buildCreativeCellEvidenceFromOpportunity(opp);
    assert.throws(() => createCreativeCell({
      // sin personaId real
      painId: 'pain-1', awareness: 'Problem Aware', angleId: 'angle-1', formatId: 'format-1',
      mechanism: 'x', evidence,
    }));
  });
});

// 8. structural diversity sigue funcionando
describe('8. Structural diversity (Andromeda) sigue funcionando sin cambios', () => {
  test('computeAndromedaRisk sigue calculando LOW/MEDIUM/HIGH sobre FormatDecisions de Vida Divina', () => {
    const sig = { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'fast cut' };
    const decisions = [
      { structuralSignature: sig }, { structuralSignature: sig }, { structuralSignature: sig }, { structuralSignature: sig },
    ];
    const risk = computeAndromedaRisk(decisions);
    assert.equal(risk.risk, 'HIGH'); // 1 sola signature distinta
    assert.equal(risk.needsStructuralBreak, true);
  });
});

// 9. Evidence Strength y Strategic Priority permanecen separadas
describe('9. Evidence Strength y Strategic Priority permanecen separadas (nunca un solo score)', () => {
  test('computeStrategicPriority nunca calcula un número mezclado con evidence strength', () => {
    const priority = computeStrategicPriority({
      painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: false,
      formatIsExecutable: true, isStrategicOpportunity: false,
    });
    assert.deepEqual(priority.criteriaMet, ['pain_matches_real_pain', 'persona_is_underserved', 'format_is_executable']);
    assert.equal(priority.count, 3);
  });

  test('summarizeEvidenceAndPriority devuelve los 2 ejes documentados por separado, nunca multiplicados', () => {
    const strength = computeEvidenceStrength([{ structuralSignature: { a: 1 } }, { structuralSignature: { a: 2 } }]);
    const priority = computeStrategicPriority({
      painMatchesRealPain: true, personaIsUnderserved: false, structurallyDiverse: true,
      formatIsExecutable: true, isStrategicOpportunity: true,
    });
    const summary = summarizeEvidenceAndPriority(strength, priority);
    assert.equal(summary.evidenceStrength.strength, strength.strength);
    assert.equal(summary.strategicPriority.count, priority.count);
    assert.ok(summary.evidenceStrength.meaning);
    assert.ok(summary.strategicPriority.meaning);
    // Nunca se combinan en un campo numérico único.
    assert.equal('score' in summary, false);
    assert.equal('combined' in summary, false);
  });

  test('summarizeEvidenceAndPriority exige resultados reales de ambas funciones', () => {
    assert.throws(() => summarizeEvidenceAndPriority(null, { criteriaMet: [] }));
    assert.throws(() => summarizeEvidenceAndPriority({ strength: 'high' }, null));
  });
});

// 10. sin datos competitivos reales no se generan patrones ficticios
describe('10. Sin datos competitivos reales, no se generan patrones ni selecciones ficticias', () => {
  test('deriveCompetitivePattern exige ≥2 Observations reales (heredado de evidenceTaxonomy.js)', () => {
    const record = competitorRecord();
    const obs = deriveCompetitiveObservation(record, 'única observación', ['longevity']);
    assert.throws(() => deriveCompetitivePattern([obs], 'patrón inventado de 1 sola observación'));
  });

  test('selectPriorityCreativeCells nunca fabrica candidatos sin evidencia real', () => {
    assert.deepEqual(selectPriorityCreativeCells([]), []);
    assert.deepEqual(selectPriorityCreativeCells(undefined), []);
  });

  test('selectPriorityCreativeCells descarta candidatos con INSUFFICIENT_DATA y nunca los marca como ganadores', () => {
    const cell = createCreativeCell({
      personaId: 'p1', painId: 'pa1', awareness: 'Problem Aware', angleId: 'a1', formatId: 'f1', mechanism: 'x',
    });
    const insufficient = { creativeCell: cell, evidenceStrength: { strength: 'INSUFFICIENT_DATA' }, strategicPriority: { count: 5 } };
    assert.deepEqual(selectPriorityCreativeCells([insufficient]), []);

    const real = { creativeCell: cell, evidenceStrength: { strength: 'high' }, strategicPriority: { count: 4 } };
    const selected = selectPriorityCreativeCells([real]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].status, 'PRIORITY_HYPOTHESIS_FOR_TESTING');
    assert.notEqual(selected[0].status, 'WINNER');
  });

  test('selectPriorityCreativeCells respeta "max" y ordena por evidence strength primero, luego strategic priority', () => {
    const cellA = createCreativeCell({ personaId: 'p1', painId: 'pa1', awareness: 'Problem Aware', angleId: 'a1', formatId: 'f1', mechanism: 'x' });
    const cellB = createCreativeCell({ personaId: 'p2', painId: 'pa2', awareness: 'Problem Aware', angleId: 'a2', formatId: 'f2', mechanism: 'y' });
    const cellC = createCreativeCell({ personaId: 'p3', painId: 'pa3', awareness: 'Problem Aware', angleId: 'a3', formatId: 'f3', mechanism: 'z' });

    const candidates = [
      { creativeCell: cellA, evidenceStrength: { strength: 'medium' }, strategicPriority: { count: 5 } },
      { creativeCell: cellB, evidenceStrength: { strength: 'high' }, strategicPriority: { count: 1 } },
      { creativeCell: cellC, evidenceStrength: { strength: 'high' }, strategicPriority: { count: 4 } },
    ];
    const selected = selectPriorityCreativeCells(candidates, { max: 2 });
    assert.equal(selected.length, 2);
    assert.equal(selected[0].creativeCellId, cellC.creativeCellId); // high + count 4 gana a high + count 1
    assert.equal(selected[1].creativeCellId, cellB.creativeCellId); // high desempata sobre medium
  });
});

describe('Integración: pipeline completo Observed Data → ... → Opportunity con evidencia real', () => {
  test('el flujo completo produce una Opportunity trazable a un Pattern real de dominio COMPETITIVE', () => {
    const record1 = competitorRecord();
    const record2 = competitorRecord({ permalink: 'https://instagram.com/p/otro-competidor' });

    const obs1 = deriveCompetitiveObservation(record1, 'Competidor A usa narrador experto en estudio', ['mediaType']);
    const obs2 = deriveCompetitiveObservation(record2, 'Competidor B usa narrador experto en estudio', ['mediaType']);
    const pattern = deriveCompetitivePattern([obs1, obs2], 'El formato experto-en-estudio se repite entre competidores');

    const abs1 = abstractFromRawRecord(record1, {
      personaHypothesis: 'x', painHypothesis: 'y', awareness: 'Problem Aware', angle: 'z',
      mechanismFraming: 'm', format: 'Pharmacist / authority figure in-studio', narrativeStructure: 'n',
      evidenceSummary: 'resumen', confidence: 'medium',
    });

    const opportunity = createOpportunity({
      description: 'Explorar autoridad clínica para Vida Divina',
      basedOnAbstractionRecords: [abs1],
      whyDifferentFromSource: 'Usa mecanismo de ingredientes en vez de reencuadre de miedo',
      informedByPattern: pattern,
    });

    assert.equal(opportunity.informedByPattern.patternId, pattern.patternId);
    assert.equal(opportunity.level, 'OPPORTUNITY');
  });
});
