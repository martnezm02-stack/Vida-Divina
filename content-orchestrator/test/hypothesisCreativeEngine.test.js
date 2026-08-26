import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { resolveCampaignCreativeCell, MissingStrategicMatchError, MIN_MATCH_SCORE } from '../src/campaignMode.js';
import {
  buildHypothesisExperiment, isHypothesisTestingViable, extractGroundedFacts, DEFAULT_VARIANT_COUNT,
} from '../src/hypothesisCreativeEngine.js';

describe('Regresión — Evidence-Based / Creative Matcher sin cambios (Fase 16, Parte 2; Creative Quality Fase 18)', () => {
  test('MIN_MATCH_SCORE sigue siendo 2', () => {
    assert.equal(MIN_MATCH_SCORE, 2);
  });

  test('resolveCampaignCreativeCell("ripped-capsules") sigue lanzando MissingStrategicMatchError -- este archivo no toca campaignMode.js', () => {
    assert.throws(() => resolveCampaignCreativeCell({ productId: 'ripped-capsules' }), MissingStrategicMatchError);
  });
});

describe('isHypothesisTestingViable / extractGroundedFacts', () => {
  test('null/undefined -> no viable', () => {
    assert.equal(isHypothesisTestingViable(null), false);
    assert.equal(isHypothesisTestingViable(undefined), false);
  });

  test('un producto real con Product Facts (Ripped) -> viable', () => {
    const evidence = buildProductGroundedEvidence('ripped-capsules');
    assert.equal(isHypothesisTestingViable(evidence), true);
  });

  test('extractGroundedFacts extrae nombreComercial/problema/beneficios/ingredientes reales, nunca inventados', () => {
    const evidence = buildProductGroundedEvidence('ripped-capsules');
    const facts = extractGroundedFacts(evidence);
    assert.equal(facts.nombreComercial, 'Divina Ripped Capsules');
    assert.match(facts.problema, /masa muscular/i);
  });

  test('sin problema ni beneficios reales (evidencia sintética vacía) -> NO viable, nunca se inventa', () => {
    const evidenciaVacia = {
      productId: 'x', nombreComercial: 'X', evidenceType: 'PRODUCT_EVIDENCE', confidence: 'PROVISIONAL',
      sourceEvidence: [{ type: 'PACKAGING_FACT', field: 'Presentación', value: '30 cápsulas', source: 'x.md' }],
      limitations: [],
    };
    assert.equal(isHypothesisTestingViable(evidenciaVacia), false);
  });
});

describe('buildHypothesisExperiment — caso NOT_VIABLE (Fase 16, Parte 3: MISSING_CREATIVE_MATCH sigue existiendo)', () => {
  test('sin Product Facts reales -> HYPOTHESIS_TESTING_NOT_VIABLE, nunca lanza, nunca fabrica', () => {
    const result = buildHypothesisExperiment({ productGroundedEvidence: null });
    assert.equal(result.status, 'HYPOTHESIS_TESTING_NOT_VIABLE');
    assert.ok(result.reason.length > 0);
  });
});

describe('buildHypothesisExperiment — caso real, Divina Ripped Capsules (benchmark de Creative Quality)', () => {
  const evidence = buildProductGroundedEvidence('ripped-capsules');
  const result = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 5 });

  test('status HYPOTHESIS_EXPERIMENT_READY, 5 variantes (no lanza -- todas pasan el Creative Quality Gate)', () => {
    assert.equal(result.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(result.variantsDetail.length, 5);
    assert.equal(result.product.productId, 'ripped-capsules');
    assert.equal(result.product.nombreComercial, 'Divina Ripped Capsules');
  });

  test('el Experiment real (createExperiment) tiene mode HYPOTHESIS_TESTING y gate PENDING', () => {
    assert.equal(result.experiment.mode, 'HYPOTHESIS_TESTING');
    assert.equal(result.experiment.gateStatus.strategyApproval, 'PENDING');
    assert.equal(result.experiment.variants.length, result.variantsDetail.length);
  });

  test('cada PersonaHypothesis/PainHypothesis real tiene mode/status de hipótesis, nunca CUSTOMER_VALIDATED ni verbatims', () => {
    for (const v of result.variantsDetail) {
      assert.equal(v.personaHypothesis.mode, 'HYPOTHESIS_TESTING');
      assert.equal(v.personaHypothesis.status, 'HYPOTHESIS');
      assert.equal(v.painHypothesis.mode, 'HYPOTHESIS_TESTING');
      assert.equal(v.painHypothesis.status, 'HYPOTHESIS');
      assert.ok(!('verbatimPhrases' in v.personaHypothesis));
      assert.ok(!('verbatimQuote' in v.painHypothesis));
    }
  });

  test('cada CreativeVariant real tiene status HYPOTHESIS (createExperiment ya lo garantiza, verificado aquí también)', () => {
    for (const v of result.variantsDetail) {
      assert.equal(v.creativeVariant.status, 'HYPOTHESIS');
      assert.equal(v.creativeVariant.mode, 'HYPOTHESIS_TESTING');
    }
  });

  test('las 5 variantes son estructuralmente distintas en persona/pain/angle/hook/awareness/format/copyStyle/ctaStrategy/visualStyle/scrollStoppingPattern (Fase de Creative Quality, benchmark obligatorio)', () => {
    const dims = {
      personaNames: result.variantsDetail.map((v) => v.personaHypothesis.name),
      pains: result.variantsDetail.map((v) => v.painHypothesis.painPoint),
      angles: result.variantsDetail.map((v) => v.creativeVariant.angleText),
      hooks: result.variantsDetail.map((v) => v.creativeVariant.hook),
      awarenesses: result.variantsDetail.map((v) => v.creativeVariant.awareness),
      formats: result.variantsDetail.map((v) => v.creativeVariant.format),
      copyStyles: result.variantsDetail.map((v) => v.copyStyle),
      ctaStrategies: result.variantsDetail.map((v) => v.ctaStrategy),
      visualScenes: result.variantsDetail.map((v) => v.visualDirection.sceneDescription),
      firstFrames: result.variantsDetail.map((v) => v.visualDirection.firstFrame),
      scrollStoppingPatterns: result.variantsDetail.map((v) => v.scrollStoppingPattern),
    };
    for (const [nombre, valores] of Object.entries(dims)) {
      assert.equal(new Set(valores).size, result.variantsDetail.length, `dimensión "${nombre}" no es única entre las 5 variantes reales`);
    }
  });

  test('cada variante recibe copy propio, realmente distinto, y CTA real y distinta entre sí (root cause real corregido)', () => {
    const hooks = new Set(result.variantsDetail.map((v) => v.copy.hook));
    const bodies = new Set(result.variantsDetail.map((v) => v.copy.primaryText));
    const ctas = new Set(result.variantsDetail.map((v) => v.copy.cta));
    const tones = new Set(result.variantsDetail.map((v) => v.copy.tone));
    assert.equal(hooks.size, result.variantsDetail.length);
    assert.equal(bodies.size, result.variantsDetail.length);
    assert.equal(ctas.size, result.variantsDetail.length);
    assert.equal(tones.size, result.variantsDetail.length);
  });

  test('cada variante recibe una dirección visual propia y coherente, con firstFrame/visualHook/motionDirection/textOverlayStyle reales (Fase de Creative Quality, Parte 9)', () => {
    for (const v of result.variantsDetail) {
      assert.ok(v.visualDirection.sceneDescription.length > 0);
      assert.ok(v.visualDirection.cameraDirection.length > 0);
      assert.ok(v.visualDirection.lightingDirection.length > 0);
      assert.ok(v.visualDirection.motionDirection.length > 0);
      assert.ok(v.visualDirection.textOverlayStyle.length > 0);
      assert.ok(v.visualDirection.firstFrame.length > 0);
      assert.ok(v.visualDirection.visualHook.length > 0);
      assert.ok(v.visualDirection.aspectRatio.length > 0);
      assert.equal(v.visualDirection.format, v.creativeVariant.format);
    }
  });

  test('ningún patrón visual afirma un resultado corporal/transformación (before/after prohibido, verificado en runtime)', () => {
    for (const v of result.variantsDetail) {
      assert.doesNotMatch(v.visualDirection.firstFrame, /antes y despu[eé]s de resultado|transformaci[oó]n corporal/i);
    }
  });

  test('el basis de cada hipótesis incluye PRODUCT_FACT real y MARKETING_PRINCIPLE (Fase 16, Parte 8), nunca CUSTOMER_EVIDENCE', () => {
    for (const v of result.variantsDetail) {
      const tipos = v.personaHypothesis.basis.map((b) => b.type);
      assert.ok(tipos.includes('PRODUCT_FACT'));
      assert.ok(tipos.includes('MARKETING_PRINCIPLE'));
      assert.ok(!tipos.includes('CUSTOMER_EVIDENCE'));
    }
  });

  test('cada variante trae su propio Creative Quality Gate real (passed:true -- si alguna fallara, buildHypothesisExperiment ya habría lanzado)', () => {
    for (const v of result.variantsDetail) {
      assert.equal(v.qualityGate.passed, true);
      assert.ok(typeof v.qualityGate.score === 'number');
      assert.ok(Array.isArray(v.qualityGate.issues));
      assert.ok(Array.isArray(v.qualityGate.warnings));
    }
  });

  test('experimentQualityGate real: diversidad de CTA a nivel de experimento completo, passed:true', () => {
    assert.equal(result.experimentQualityGate.passed, true);
    assert.equal(result.experimentQualityGate.checks.ctaDiversity.distinctCount, 5);
  });

  test('disclaimer real presente, experimento explícitamente marcado como hipótesis', () => {
    assert.match(result.disclaimer, /hipótesis/i);
    assert.match(result.disclaimer, /revisión humana/i);
  });

  test('variantCount configurable entre 3 y 50 (Creative Factory: generación masiva/incremental, ver marketingPlaybook.js#generateBlueprintAtIndex)', () => {
    const r3 = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 3 });
    assert.equal(r3.variantsDetail.length, 3);
    // 6 ya NO lanza (antes limitado a los 5 VARIANT_BLUEPRINTS curados a
    // mano) -- generateBlueprintAtIndex() cubre un espacio combinatorio
    // mucho más grande a partir del índice 5.
    const r6 = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 6 });
    assert.equal(r6.variantsDetail.length, 6);
    assert.throws(() => buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 2 }));
    assert.throws(() => buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 51 }));
  });
});

describe('buildHypothesisExperiment — Té Divina (regresión de Fase 16)', () => {
  test('Té Divina real produce un experimento de hipótesis válido, grounded en sus propios Product Facts', () => {
    const evidence = buildProductGroundedEvidence('te-divina');
    const result = buildHypothesisExperiment({ productGroundedEvidence: evidence });
    assert.equal(result.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(result.product.nombreComercial, 'TéDivina');
    // Nombre visible (UX cleanup, 2026-08-26): el copy real (lo que el
    // cliente lee) usa el nombre visible corto "Té Divina", nunca el
    // nombre técnico completo del catálogo -- ver productos/tedivina.md.
    assert.equal(result.product.nombreVisible, 'Té Divina');
    for (const v of result.variantsDetail) {
      assert.match(v.copy.primaryText, /Té Divina/);
      assert.equal(v.qualityGate.passed, true);
    }
  });
});
