import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrganoGoldEvidenceStatus, buildHerbalifeEvidenceStatus,
  buildOmnilifeAdLibraryEvidence, buildFuxionAdLibraryEvidence, buildTotalLifeChangesAdLibraryEvidence,
  buildAR06, buildAR07, buildAR08, buildPendingAbstractionRecordStubs,
  buildPattern01, buildCatalogedPatterns, buildLearning01, buildLearning02, buildLearning02DeclaredClaim,
  buildOpportunity01, buildOpportunity02, buildOpportunity03,
  buildH1, buildH2, buildH3,
  buildVidaDivinaMentionByFuxion, buildFuxionVideo1Engagement, buildFuxionVideo2Engagement, buildOmnilifeTikTokEngagementStatus,
  buildFuxionTikTokVideo1Provenance, FUXION_TIKTOK_VIDEO_1_ID,
  buildCompetitiveEvidencePreliminaryManifest, CATALOGED_FINDING,
  INVESTIGATION_DATE,
} from '../src/competitiveEvidencePreliminary.js';
import { assertNotCompetitiveSourceForCustomerEvidence, assertProvenancePreserved, CUSTOMER_EVIDENCE_REQUIRED } from '../src/evidenceProvenance.js';
import { PUBLIC_OBSERVED_ENGAGEMENT, PUBLIC_OBSERVED_ENGAGEMENT_TOTAL } from '../src/publicEngagement.js';
import { OBSERVED_COMPETITIVE_DATA, describeMarketRepresentativeness, buildCreativeCellEvidenceFromOpportunity } from '../src/competitivePipeline.js';
import { assertOpportunityReadyForCreativeCell } from '../src/competitiveAbstraction.js';
import { createCreativeCell } from '../src/creativeCell.js';

// 1. Competitive evidence nunca se convierte automáticamente en Customer evidence.
describe('1. Competitive evidence ≠ Customer evidence', () => {
  test('assertNotCompetitiveSourceForCustomerEvidence rechaza una cita que menciona a un competidor conocido', () => {
    assert.throws(() => assertNotCompetitiveSourceForCustomerEvidence('Observado en TikTok de Omnilife'), /competidor/);
    assert.throws(() => assertNotCompetitiveSourceForCustomerEvidence('Fuxion Ad Library'), /competidor/);
  });

  test('una cita real de cliente de Vida Divina pasa el guard sin problema', () => {
    assert.equal(assertNotCompetitiveSourceForCustomerEvidence('Conversación de WhatsApp con clienta real, 2026-08-10'), true);
  });

  test('el módulo no expone ninguna función que convierta Opportunity/AbstractionRecord en Persona/Pain de Vida Divina', async () => {
    const mod = await import('../src/competitiveEvidencePreliminary.js');
    const suspiciousNames = Object.keys(mod).filter((k) => /toPersona|toPain|createPersonaFrom|createPainFrom/i.test(k));
    assert.deepEqual(suspiciousNames, []);
  });
});

// 2. Competitive evidence nunca se convierte automáticamente en Own Performance.
describe('2. Competitive evidence ≠ Own Performance', () => {
  test('ningún objeto de esta incorporación tiene un campo performanceSnapshotId/publishedContentId real', () => {
    const opp = buildOpportunity01();
    assert.equal('performanceSnapshotId' in opp, false);
    assert.equal('publishedContentId' in opp, false);
    const { pattern } = buildPattern01();
    assert.equal(pattern.domain, 'COMPETITIVE');
  });

  test('el módulo no expone ninguna función que convierta evidencia competitiva en OwnPerformanceSnapshot', async () => {
    const mod = await import('../src/competitiveEvidencePreliminary.js');
    const suspiciousNames = Object.keys(mod).filter((k) => /toOwnPerformance|toPerformanceSnapshot/i.test(k));
    assert.deepEqual(suspiciousNames, []);
  });
});

// 3. Public engagement nunca se convierte automáticamente en sales evidence.
describe('3. Public engagement ≠ sales evidence', () => {
  test('las métricas y el total nunca tienen campos sales/roas/cpa/conversion/winner', () => {
    const { metrics, total } = buildFuxionVideo1Engagement();
    for (const metric of metrics) {
      assert.equal(metric.type, PUBLIC_OBSERVED_ENGAGEMENT);
      for (const forbidden of ['sales', 'roas', 'cpa', 'conversion', 'winner', 'revenue']) {
        assert.equal(forbidden in metric, false);
      }
    }
    assert.equal(total.label, PUBLIC_OBSERVED_ENGAGEMENT_TOTAL);
    for (const forbidden of ['salesScore', 'winnerScore', 'performanceScore', 'conversionScore', 'sales', 'roas']) {
      assert.equal(forbidden in total, false);
    }
  });

  test('el total es la suma real de componentes numéricos presentes (23+4+2+2=31)', () => {
    const { total } = buildFuxionVideo1Engagement();
    assert.equal(total.total, 31);
    assert.deepEqual([...total.componentsIncluded].sort(), ['comments', 'likes', 'saves', 'shares']);
  });
});

// 4-6. WEAK/MODERATE/UNKNOWN permanecen sin inflarse.
describe('4-6. Confidence declarado se conserva exacto, nunca se infla', () => {
  test('Pattern-01 permanece MODERATE (valor exacto dado por la investigación)', () => {
    const { pattern } = buildPattern01();
    assert.equal(pattern.confidence, 'MODERATE');
  });

  test('Pattern-03/05/06 permanecen WEAK; Pattern-02/04 permanecen MODERATE — ninguno se elevó', () => {
    const cataloged = buildCatalogedPatterns();
    const byLabel = Object.fromEntries(cataloged.map((p) => [p.label, p.confidence]));
    assert.equal(byLabel['Pattern-02'], 'MODERATE');
    assert.equal(byLabel['Pattern-03'], 'WEAK');
    assert.equal(byLabel['Pattern-04'], 'MODERATE');
    assert.equal(byLabel['Pattern-05'], 'WEAK');
    assert.equal(byLabel['Pattern-06'], 'WEAK');
  });

  test('H3 permanece WEAK (Pattern-03 es WEAK) — H1/H2 permanecen MODERATE', () => {
    assert.equal(buildH1().confidence, 'MODERATE');
    assert.equal(buildH2().confidence, 'MODERATE');
    assert.equal(buildH3().confidence, 'WEAK');
  });

  test('Omnilife TikTok engagement, sin cifras dadas, no se inventa — status UNKNOWN', () => {
    assert.equal(buildOmnilifeTikTokEngagementStatus().engagement, 'UNKNOWN');
  });
});

// 7. Ausencia de datos no se convierte en ausencia del fenómeno.
describe('7. Ausencia de datos ≠ ausencia del fenómeno', () => {
  test('Organo Gold queda UNKNOWN/INSUFFICIENT_PRELIMINARY_EVIDENCE, con nota explícita de que esto no implica ausencia de publicidad', () => {
    const status = buildOrganoGoldEvidenceStatus();
    assert.equal(status.status, 'UNKNOWN');
    assert.equal(status.reason, 'INSUFFICIENT_PRELIMINARY_EVIDENCE');
    assert.match(status.note, /no se interpreta como ausencia de publicidad/i);
  });

  test('Herbalife queda INSUFFICIENT_DATA en vez de fabricar ids', () => {
    const status = buildHerbalifeEvidenceStatus();
    assert.equal(status.status, 'INSUFFICIENT_DATA');
  });
});

// 8-9. Opportunity → CreativeCell solo con Persona/Pain reales; si no, CUSTOMER_EVIDENCE_REQUIRED.
describe('8-9. Opportunity competitiva solo alimenta CreativeCell con evidencia de cliente real', () => {
  test('Opportunity-01 está marcada customerEvidenceRequired — sin Persona/Pain reales, assertOpportunityReadyForCreativeCell lanza CUSTOMER_EVIDENCE_REQUIRED', () => {
    const opp = buildOpportunity01();
    assert.equal(opp.customerEvidenceRequired, true);
    assert.throws(() => assertOpportunityReadyForCreativeCell(opp), new RegExp(CUSTOMER_EVIDENCE_REQUIRED));
  });

  test('con Persona/Pain reales (ids) provistos, assertOpportunityReadyForCreativeCell pasa y la Opportunity puede alimentar una CreativeCell real', () => {
    const opp = buildOpportunity01();
    assert.equal(assertOpportunityReadyForCreativeCell(opp, { realPersonaId: 'persona-vd-real-1', realPainId: 'pain-vd-real-1' }), true);

    const evidence = buildCreativeCellEvidenceFromOpportunity(opp);
    const cell = createCreativeCell({
      personaId: 'persona-vd-real-1', painId: 'pain-vd-real-1', awareness: 'Solution Aware',
      angleId: 'angle-vd-1', formatId: 'format-vd-1', mechanism: 'distribuidor propio como narrador', evidence,
    });
    assert.equal(cell.personaId, 'persona-vd-real-1');
    assert.equal(cell.evidence[0].opportunityId, opp.opportunityId);
  });
});

// 10. Competitive Learning no puede afirmar ventas/ROAS/CPA/revenue sin evidencia específica.
describe('10. Competitive Learning nunca afirma resultado de negocio sin evidencia específica', () => {
  test('Learning-02 real (grounded en Pattern-01) no contiene lenguaje de ventas/ROAS/CPA', () => {
    const learning = buildLearning02();
    assert.doesNotMatch(learning.description, /\b(vende|ventas|sales|roas|cpa|revenue)\b/i);
  });

  test('intentar forzar un Learning competitivo con lenguaje de ventas sobre Pattern-01 sigue siendo rechazado', async () => {
    const { deriveCompetitiveLearning } = await import('../src/competitivePipeline.js');
    const { pattern } = buildPattern01();
    assert.throws(() => deriveCompetitiveLearning([pattern], 'este enfoque genera muchas ventas', 'MODERATE'), /Meta no expone performance real/);
  });
});

// 11-12. Procedencia e IDs originales sobreviven a los mappings.
describe('11-12. Fuente, fecha e IDs originales permanecen después de todos los mappings', () => {
  test('AR-06.observedEvidenceRef.recordId apunta al provenanceId real, y el provenance conserva competitor/source/fecha/videoId', () => {
    const provenance = buildFuxionTikTokVideo1Provenance();
    const ar06 = buildAR06();
    assert.equal(ar06.observedEvidenceRef.recordId, provenance.originalEvidenceId);
    assert.equal(provenance.competitor, 'Fuxion');
    assert.equal(provenance.videoId, FUXION_TIKTOK_VIDEO_1_ID);
    assert.equal(provenance.contentDate, '2024-07-26');
    assert.equal(provenance.observedAt, INVESTIGATION_DATE);
  });

  test('assertProvenancePreserved confirma que un mapping que copia los campos clave no pierde procedencia', () => {
    const original = buildFuxionTikTokVideo1Provenance();
    const mapped = { ...original }; // simula un mapping que preserva los campos
    assert.equal(assertProvenancePreserved(original, mapped), true);
  });

  test('assertProvenancePreserved detecta cuando un mapping SÍ pierde procedencia', () => {
    const original = buildFuxionTikTokVideo1Provenance();
    const broken = { ...original, competitor: 'OTRO' };
    assert.throws(() => assertProvenancePreserved(original, broken), /competitor/);
  });

  test('los Ad Library IDs originales se conservan exactos en los AdLibraryRawRecord', () => {
    const omnilife = buildOmnilifeAdLibraryEvidence();
    assert.equal(omnilife.length, 6);
    assert.ok(omnilife.some((r) => r.adLibraryId === '3070356446508098'));
    const fuxion = buildFuxionAdLibraryEvidence();
    assert.deepEqual(fuxion.map((r) => r.adLibraryId).sort(), ['1638827230548335', '795592699680452'].sort());
    const tlc = buildTotalLifeChangesAdLibraryEvidence();
    assert.equal(tlc[0].adLibraryId, '26420591114238877');
  });
});

// 13. La abstracción no contiene copy literal del competidor.
describe('13. AbstractionRecord (AR-06/07/08) no contiene copy/caption/hook literal', () => {
  test('la forma de los 3 AR reales no tiene caption/transcript/hook', () => {
    for (const ar of [buildAR06(), buildAR07(), buildAR08()]) {
      assert.equal('caption' in ar, false);
      assert.equal('transcript' in ar, false);
      assert.equal('hook' in ar, false);
    }
  });
});

// 14-15. Las hipótesis permanecen PRIORITY_HYPOTHESIS_FOR_TESTING; nunca WINNER/VALIDATED/PROVEN.
describe('14-15. H1/H2/H3 permanecen PRIORITY_HYPOTHESIS_FOR_TESTING; WINNER/VALIDATED/PROVEN nunca aparecen', () => {
  test('las 3 hipótesis preliminares tienen status PRIORITY_HYPOTHESIS_FOR_TESTING', () => {
    for (const h of [buildH1(), buildH2(), buildH3()]) {
      assert.equal(h.status, 'PRIORITY_HYPOTHESIS_FOR_TESTING');
    }
  });

  test('el manifest completo, serializado, nunca contiene WINNER/VALIDATED/PROVEN', () => {
    const manifest = buildCompetitiveEvidencePreliminaryManifest();
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, /\bWINNER\b/);
    assert.doesNotMatch(serialized, /\bVALIDATED\b/);
    assert.doesNotMatch(serialized, /\bPROVEN\b/);
  });
});

// 16. La mención de Vida Divina por Fuxion permanece como OBSERVED DATA.
describe('16. Mención de Vida Divina permanece como OBSERVED_COMPETITIVE_DATA', () => {
  test('la mención no infiere awareness/percepción/cuota de mercado — solo describe lo observado', () => {
    const mention = buildVidaDivinaMentionByFuxion();
    assert.equal(mention.type, OBSERVED_COMPETITIVE_DATA);
    assert.equal(mention.mentionedBrand, 'Vida Divina');
    assert.equal(mention.mentioningCompetitor, 'Fuxion');
    for (const forbidden of ['awareness', 'perception', 'percepcion', 'marketShare', 'cuotaDeMercado', 'purchaseIntent']) {
      assert.equal(forbidden in mention, false);
    }
  });
});

// 17. Likes/comments/saves/shares permanecen como PUBLIC_OBSERVED_ENGAGEMENT.
describe('17. Engagement público permanece tipado PUBLIC_OBSERVED_ENGAGEMENT', () => {
  test('las 4 métricas de cada video de Fuxion están correctamente tipadas y con los valores exactos dados', () => {
    const v1 = buildFuxionVideo1Engagement().metrics;
    const byName1 = Object.fromEntries(v1.map((m) => [m.metricName, m.value]));
    assert.deepEqual(byName1, { likes: 23, comments: 4, saves: 2, shares: 2 });
    for (const m of v1) assert.equal(m.type, PUBLIC_OBSERVED_ENGAGEMENT);

    const v2 = buildFuxionVideo2Engagement().metrics;
    const byName2 = Object.fromEntries(v2.map((m) => [m.metricName, m.value]));
    assert.deepEqual(byName2, { likes: 23, comments: 12, saves: 8, shares: 5 });
  });
});

// 18. El engagement público no modifica confidence por sí mismo.
describe('18. Engagement público no modifica confidence de Pattern/Learning por sí mismo', () => {
  test('Pattern-01 tiene MODERATE independientemente de las cifras de engagement de AR-06/AR-07', () => {
    buildFuxionVideo1Engagement();
    buildFuxionVideo2Engagement();
    const { pattern } = buildPattern01();
    assert.equal(pattern.confidence, 'MODERATE'); // no cambia por haber engagement alto/bajo
  });

  test('computePublicObservedEngagementTotal no expone ni consume ningún campo "confidence" agregado a partir de los valores', () => {
    const { total } = buildFuxionVideo1Engagement();
    assert.equal('confidence' in total, false);
  });
});

// 19. Un solo creativo no puede generar automáticamente un Pattern fuerte.
describe('19. Un solo creativo no genera un Pattern fuerte automáticamente', () => {
  test('Pattern-05/06 (1 sola Observation real disponible cada uno) quedan CATALOGED, no como Pattern "en vivo"', () => {
    const cataloged = buildCatalogedPatterns();
    const p05 = cataloged.find((p) => p.label === 'Pattern-05');
    const p06 = cataloged.find((p) => p.label === 'Pattern-06');
    assert.equal(p05.type, CATALOGED_FINDING);
    assert.equal(p06.type, CATALOGED_FINDING);
  });
});

// 20-21. Una sola cuenta no representa el mercado; un competidor dominante no monopoliza la síntesis.
describe('20-21. Representatividad de mercado — un competidor/cuenta no representa todo el mercado', () => {
  test('describeMarketRepresentativeness marca singleAccountOnly/singleCompetitorOnly para la evidencia que respalda Pattern-01', () => {
    const repr = describeMarketRepresentativeness([{ competitor: 'Fuxion' }, { competitor: 'Fuxion' }]);
    assert.equal(repr.singleCompetitorOnly, true);
    assert.ok(repr.caveat);
  });

  test('Learning-02 conserva el reclamo completo original ("2 de 4 competidores") como hallazgo declarado, con caveat explícito de que solo 1 competidor fue verificado en esta sesión', () => {
    const declared = buildLearning02DeclaredClaim();
    assert.match(declared.description, /al menos 2 de 4 competidores/);
    assert.match(declared.note, /un solo competidor/);
  });
});

// Auditabilidad general: el manifest completo se construye sin lanzar y es serializable.
describe('Auditabilidad general', () => {
  test('buildCompetitiveEvidencePreliminaryManifest construye sin lanzar y es 100% serializable', () => {
    const manifest = buildCompetitiveEvidencePreliminaryManifest();
    assert.doesNotThrow(() => JSON.stringify(manifest));
    assert.equal(manifest.investigationDate, INVESTIGATION_DATE);
  });

  test('AR-01..AR-05 quedan como stubs AWAITING_ANALYST_CONTENT, nunca fabricados como AbstractionRecord completo', () => {
    const stubs = buildPendingAbstractionRecordStubs();
    assert.equal(stubs.length, 5);
    for (const stub of stubs) assert.equal(stub.status, 'AWAITING_ANALYST_CONTENT');
  });

  test('Opportunity-02 queda catalogado (no real) por falta de AbstractionRecord real que lo respalde', () => {
    const opp02 = buildOpportunity02();
    assert.equal(opp02.type, CATALOGED_FINDING);
    assert.equal(opp02.kind, 'OPPORTUNITY');
  });
});
