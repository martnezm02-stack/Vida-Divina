import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AFFILIATE_FIELD_KIND, deriveDataPointFromAffiliateRecord, deriveAffiliateObservation,
  deriveAffiliatePattern, deriveAffiliateLearning, collectComplianceRiskClaims, assertNoComplianceRiskClaimReused,
} from '../src/affiliatePipeline.js';
import {
  createDataPoint, createLearning, createRecommendation, assertNoUnverifiedBusinessClaim,
  EVIDENCE_DOMAINS, FORBIDDEN_INFERRED_METRICS, UNKNOWN,
} from '../src/evidenceTaxonomy.js';
import { createOpportunity, createAbstractionRecord } from '../src/competitiveAbstraction.js';
import { getEvidenceSnapshot } from '../orchestrator/cycleStore.js';

// Fuente real, ya persistida en la fase "Ingesta del Affiliate Evidence
// Batch" — NUNCA reconstruida a mano aquí, se lee del snapshot real en
// disco (AE-001..AE-007, página "Aumenta tu potencia masculina").
const REAL_SNAPSHOT_HASH = '3d992b38a777bc42dc33bbc8c44505af85c88546b07585503f0e24a61d6fd5b5';

function realAffiliateRecords() {
  const snapshot = getEvidenceSnapshot(REAL_SNAPSHOT_HASH);
  const block = snapshot.evidenceBatch.find((b) => b.domain === 'AFFILIATE_EVIDENCE');
  return block.records;
}

function recordById(records, evidenceId) {
  const record = records.find((r) => r.evidenceId === evidenceId);
  if (!record) throw new Error(`fixture de test rota: no se encontró ${evidenceId} en el snapshot real`);
  return record;
}

describe('A. EVIDENCE_DOMAINS incluye AFFILIATE', () => {
  test('AFFILIATE es un dominio válido de evidenceTaxonomy.js', () => {
    assert.ok(EVIDENCE_DOMAINS.includes('AFFILIATE'));
  });
});

describe('B. AFFILIATE respeta FORBIDDEN_INFERRED_METRICS, igual que COMPETITIVE', () => {
  test('createDataPoint rechaza sales/roas/cpa/conversions/realAudience para domain AFFILIATE', () => {
    for (const field of FORBIDDEN_INFERRED_METRICS) {
      assert.throws(
        () => createDataPoint({ domain: 'AFFILIATE', field, value: 500, source: 'AE-001' }),
        /nunca se infiere/,
        `se esperaba que "${field}" fuera rechazado para AFFILIATE`
      );
    }
  });

  test('sigue aceptándose si se declara honestamente UNKNOWN', () => {
    const dp = createDataPoint({ domain: 'AFFILIATE', field: 'sales', value: UNKNOWN, source: null });
    assert.equal(dp.value, UNKNOWN);
  });
});

describe('C. Learning de dominio AFFILIATE no puede afirmar resultado de negocio sin evidencia OWN_PERFORMANCE', () => {
  function affiliatePattern() {
    const records = realAffiliateRecords();
    const obs1 = deriveAffiliateObservation(recordById(records, 'AE-002'), 'hookStructure CONTRAST en AE-002', ['hookStructure']);
    const obs2 = deriveAffiliateObservation(recordById(records, 'AE-004'), 'hookStructure CONTRAST en AE-004', ['hookStructure']);
    return deriveAffiliatePattern([obs1, obs2], 'CONTRAST se repite como hookStructure');
  }

  test('rechaza un Learning solo-AFFILIATE que afirma "esto vende muy bien"', () => {
    const pattern = affiliatePattern();
    const learning = createLearning({ description: 'este hook vende muy bien', basedOnPatterns: [pattern] });
    assert.throws(() => assertNoUnverifiedBusinessClaim(learning), /evidencia AFFILIATE/);
  });

  test('permite un Learning solo-AFFILIATE que describe el patrón sin afirmar resultado de negocio', () => {
    const pattern = affiliatePattern();
    const learning = createLearning({ description: 'el patrón merece consideración estratégica para testing propio', basedOnPatterns: [pattern] });
    assert.equal(assertNoUnverifiedBusinessClaim(learning), true);
  });
});

describe('D. Recommendation derivada de un Learning solo-AFFILIATE respeta el mismo guard', () => {
  test('createRecommendation rechaza un claim de negocio no sustentado', () => {
    const records = realAffiliateRecords();
    const obs1 = deriveAffiliateObservation(recordById(records, 'AE-003'), 'a', ['hookStructure']);
    const obs2 = deriveAffiliateObservation(recordById(records, 'AE-006'), 'b', ['hookStructure']);
    const pattern = deriveAffiliatePattern([obs1, obs2], 'SOCIAL_PROOF se repite como hookStructure');
    const learning = deriveAffiliateLearning([pattern], 'el patrón SOCIAL_PROOF merece exploración propia');
    assert.throws(
      () => createRecommendation({ description: 'esto convierte de forma comprobada', basedOnLearning: learning }),
      /evidencia AFFILIATE/
    );
    // Una recomendación que no afirma resultado de negocio sí se acepta.
    const rec = createRecommendation({ description: 'Explorar SOCIAL_PROOF como hipótesis propia de hookStructure', basedOnLearning: learning });
    assert.equal(rec.autoExecutes, false);
  });
});

describe('E. Opportunity.informedByPattern acepta AFFILIATE (además de COMPETITIVE)', () => {
  function abstractionRecord() {
    return createAbstractionRecord({
      personaHypothesis: 'hipótesis interna de trabajo',
      painHypothesis: 'hipótesis interna de trabajo',
      awareness: 'problem_aware',
      angle: 'ángulo hipotético a testear',
      mechanismFraming: 'framing hipotético, no literal',
      format: 'Video corto',
      narrativeStructure: 'estructura hipotética',
      observedEvidenceRef: { recordId: 'placeholder-record-id' },
      confidence: 'low',
    });
  }

  test('acepta un Pattern real de dominio AFFILIATE', () => {
    const records = realAffiliateRecords();
    const obs1 = deriveAffiliateObservation(recordById(records, 'AE-001'), 'a', ['leadMechanism']);
    const obs2 = deriveAffiliateObservation(recordById(records, 'AE-002'), 'b', ['leadMechanism']);
    const pattern = deriveAffiliatePattern([obs1, obs2], 'WhatsApp se repite como leadMechanism');
    const opportunity = createOpportunity({
      description: 'Explorar WhatsApp como CTA explícito para una Persona/Pain real de Vida Divina (pendiente de validar)',
      basedOnAbstractionRecords: [abstractionRecord()],
      whyDifferentFromSource: 'No reproduce ningún texto/imagen del afiliado, solo el mecanismo estructural observado',
      informedByPattern: pattern,
      customerEvidenceRequired: true,
    });
    assert.equal(opportunity.informedByPattern.patternId, pattern.patternId);
  });

  test('rechaza un Pattern de dominio distinto a COMPETITIVE/AFFILIATE (ej. inventado o de otro dominio)', () => {
    const fakePattern = { type: 'PATTERN', domain: 'CUSTOMER_RESEARCH', patternId: 'x', description: 'x' };
    assert.throws(() =>
      createOpportunity({
        description: 'x',
        basedOnAbstractionRecords: [abstractionRecord()],
        whyDifferentFromSource: 'x',
        informedByPattern: fakePattern,
      })
    , /COMPETITIVE o AFFILIATE/);
  });
});

describe('F. affiliatePipeline deriva correctamente campos OBSERVED', () => {
  test('deriveDataPointFromAffiliateRecord acepta hookStructure/format/cta/leadMechanism', () => {
    const record = recordById(realAffiliateRecords(), 'AE-002');
    const dp = deriveDataPointFromAffiliateRecord(record, 'hookStructure');
    assert.equal(dp.domain, 'AFFILIATE');
    assert.equal(dp.value, 'CONTRAST');
    assert.equal(dp.source, 'AE-002');
  });

  test('rechaza un registro sin evidenceId real', () => {
    assert.throws(() => deriveDataPointFromAffiliateRecord({ hookStructure: 'CONTRAST' }, 'hookStructure'), /evidenceId/);
  });

  test('rechaza un campo que el registro no tiene', () => {
    const record = recordById(realAffiliateRecords(), 'AE-007');
    assert.throws(() => deriveDataPointFromAffiliateRecord(record, 'campoInexistente'));
  });
});

describe('G. claimClassification (y confidence/notes) se tratan como INFERRED, nunca como OBSERVED', () => {
  test('AFFILIATE_FIELD_KIND clasifica claimClassification/confidence/notes como INFERRED', () => {
    assert.equal(AFFILIATE_FIELD_KIND.claimClassification, 'INFERRED');
    assert.equal(AFFILIATE_FIELD_KIND.confidence, 'INFERRED');
    assert.equal(AFFILIATE_FIELD_KIND.notes, 'INFERRED');
  });

  test('deriveDataPointFromAffiliateRecord rechaza construir un DataPoint desde claimClassification', () => {
    const record = recordById(realAffiliateRecords(), 'AE-002');
    assert.throws(() => deriveDataPointFromAffiliateRecord(record, 'claimClassification'), /no es un campo OBSERVED/);
  });

  test('deriveDataPointFromAffiliateRecord rechaza construir un DataPoint desde confidence', () => {
    const record = recordById(realAffiliateRecords(), 'AE-002');
    assert.throws(() => deriveDataPointFromAffiliateRecord(record, 'confidence'), /no es un campo OBSERVED/);
  });
});

describe('H/I. Patterns reales derivados del snapshot 3d992b38... (AE-001..AE-007)', () => {
  test('Pattern A — CONTRAST como hookStructure (AE-002, AE-004, AE-005)', () => {
    const records = realAffiliateRecords();
    const observations = ['AE-002', 'AE-004', 'AE-005'].map((id) =>
      deriveAffiliateObservation(recordById(records, id), `hookStructure CONTRAST observado en ${id}`, ['hookStructure'])
    );
    const pattern = deriveAffiliatePattern(observations, 'CONTRAST se repite como hookStructure en 3 posts observados');
    assert.equal(pattern.domain, 'AFFILIATE');
    assert.equal(pattern.basedOnObservations.length, 3);
  });

  test('Pattern B — SOCIAL_PROOF como hookStructure (AE-003, AE-006, AE-007)', () => {
    const records = realAffiliateRecords();
    const observations = ['AE-003', 'AE-006', 'AE-007'].map((id) =>
      deriveAffiliateObservation(recordById(records, id), `hookStructure SOCIAL_PROOF observado en ${id}`, ['hookStructure'])
    );
    const pattern = deriveAffiliatePattern(observations, 'SOCIAL_PROOF se repite como hookStructure en 3 posts observados');
    assert.equal(pattern.basedOnObservations.length, 3);
  });

  test('Pattern C — WhatsApp como mecanismo de contacto (AE-001, AE-002, AE-004, AE-005) — basedOnObservations.length === 4', () => {
    const records = realAffiliateRecords();
    const observations = ['AE-001', 'AE-002', 'AE-004', 'AE-005'].map((id) =>
      deriveAffiliateObservation(recordById(records, id), `WhatsApp como leadMechanism observado en ${id}`, ['leadMechanism'])
    );
    const pattern = deriveAffiliatePattern(observations, 'WhatsApp aparece sistemáticamente como mecanismo de contacto');
    assert.equal(pattern.basedOnObservations.length, 4);

    // I. El Learning derivado no usa lenguaje de resultado de negocio y pasa el guard.
    const learning = deriveAffiliateLearning(
      [pattern],
      'Los posts observados de este afiliado utilizan predominantemente WhatsApp como mecanismo de contacto, independientemente del hook usado'
    );
    assert.deepEqual([...learning.evidenceDomains], ['AFFILIATE']);
  });

  test('Pattern D — comprobantes de envío como mecanismo de confianza (AE-003, AE-006)', () => {
    const records = realAffiliateRecords();
    const observations = ['AE-003', 'AE-006'].map((id) =>
      deriveAffiliateObservation(recordById(records, id), `comprobante de envío observado en ${id}`, ['contentTypeNote'])
    );
    const pattern = deriveAffiliatePattern(observations, 'Comprobantes de envío se repiten como mecanismo de confianza');
    assert.equal(pattern.basedOnObservations.length, 2);
  });
});

describe('J. Claims de riesgo de compliance nunca se reutilizan como recommendation/mechanism', () => {
  test('collectComplianceRiskClaims recolecta exactamente los observedClaim marcados de riesgo', () => {
    const records = realAffiliateRecords();
    const claims = collectComplianceRiskClaims(records);
    assert.ok(claims.includes('tadalafil/pastilla azul'));
    assert.ok(claims.includes('limpia arterias y venas'));
    assert.ok(claims.includes('corazón sano'));
    // AE-003/AE-006/AE-007 no tienen claimClassification de riesgo — no deben aparecer.
    assert.ok(!claims.some((c) => c?.toLowerCase().includes('ilegible')));
  });

  test('rechaza un mechanism/recommendation que reproduce un claim riesgoso observado', () => {
    const claims = collectComplianceRiskClaims(realAffiliateRecords());
    assert.throws(
      () => assertNoComplianceRiskClaimReused({ text: 'Usar como mecanismo: tadalafil/pastilla azul', riskyClaims: claims }),
      /claim de riesgo de compliance/
    );
  });

  test('acepta un mechanism/recommendation que NO reproduce ningún claim riesgoso', () => {
    const claims = collectComplianceRiskClaims(realAffiliateRecords());
    assert.equal(
      assertNoComplianceRiskClaimReused({ text: 'Explorar WhatsApp como CTA explícito, sin mecanismo de salud implícito', riskyClaims: claims }),
      true
    );
  });
});
