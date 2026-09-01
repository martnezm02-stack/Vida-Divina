// productGroundedEvidence.test.js — Fase 20: Product-Grounded Creative
// Intelligence, camino separado de Persona/Pain/CreativeCell. Usa datos
// reales de docs/productos/, ningún fixture inventado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductGroundedEvidence, PRODUCT_EVIDENCE_TYPE, PRODUCT_GROUNDED_CONFIDENCE } from '../src/productGroundedEvidence.js';
import { buildCreativeProposal } from '../src/autonomousCreate.js';

const PRODUCTOS_OBJETIVO = Object.freeze(['cappuccino', 'sculpt-black', 'venus-capsules', 'ripped-capsules', 'extracto-tremella', 'reishi-capsules', 'sculpt-max']);

describe('buildProductGroundedEvidence — evidencia real de producto, nunca evidencia de cliente', () => {
  for (const productId of PRODUCTOS_OBJETIVO) {
    test(`${productId}: produce evidencia real con tipo/confianza correctos, nunca CUSTOMER_EVIDENCE`, () => {
      const ev = buildProductGroundedEvidence(productId);
      assert.ok(ev, `${productId} debe tener hechos reales`);
      assert.equal(ev.productId, productId);
      assert.equal(ev.evidenceType, 'PRODUCT_EVIDENCE');
      assert.notEqual(ev.evidenceType, 'CUSTOMER_EVIDENCE');
      assert.equal(ev.confidence, 'PROVISIONAL');
      assert.notEqual(ev.confidence, 'CUSTOMER_VALIDATED');
      assert.ok(ev.sourceEvidence.length > 0);
      assert.ok(ev.limitations.length > 0);
      for (const item of ev.sourceEvidence) {
        assert.ok(['PRODUCT_FACT', 'MARKETING_CLAIM', 'PACKAGING_FACT'].includes(item.type));
        assert.ok(item.source.includes('docs') && item.source.includes('productos'), 'la fuente debe ser real, trazable a docs/productos/');
      }
    });
  }

  test('un productId sin hechos reales -- null explícito, nunca inventa evidencia', () => {
    assert.equal(buildProductGroundedEvidence('producto-que-no-existe'), null);
    assert.equal(buildProductGroundedEvidence('Tongkat Ali'), null);
  });

  test('constantes exportadas son las declaradas -- nunca varían por producto (sin hardcode)', () => {
    assert.equal(PRODUCT_EVIDENCE_TYPE, 'PRODUCT_EVIDENCE');
    assert.equal(PRODUCT_GROUNDED_CONFIDENCE, 'PROVISIONAL');
  });
});

// Completar Product Knowledge — REISHI + Sculpt Max (2026-09-01): las
// carpetas de assets reales ya existían (assets/products/) pero su slug no
// coincidía con docs/productos/{reishi-capsules,sculpt-max}.md, por lo que
// quedaban "sin nombre comercial real" en el catálogo. Se renombraron las
// carpetas de assets (mismo assetId real por contenido, ninguna imagen
// modificada) y se agregó "Nombre visible" a ambas fichas -- docs/productos/
// sigue siendo la única fuente de verdad, ningún catálogo paralelo.
describe('Completar Product Knowledge — REISHI + Sculpt Max: nombreVisible exacto, sin claims inventados, Crear Autónomo desbloqueado', () => {
  test('nombreVisible EXACTO en Product Grounded Evidence -- sin variantes', () => {
    assert.equal(buildProductGroundedEvidence('reishi-capsules').nombreVisible, 'Cápsulas REISHI');
    assert.equal(buildProductGroundedEvidence('sculpt-max').nombreVisible, 'Cápsulas Sculpt Max');
  });

  test('dataQualityStatus VERIFIED, sin CONFLICT/INCOMPLETE/MISSING (packaging real corrobora Presentación/Ingredientes ya documentados)', () => {
    const reishi = buildProductGroundedEvidence('reishi-capsules');
    const sculptMax = buildProductGroundedEvidence('sculpt-max');
    assert.equal(reishi.dataQualityStatus, 'VERIFIED');
    assert.equal(reishi.dataQualityDetail, null);
    assert.equal(sculptMax.dataQualityStatus, 'VERIFIED');
    assert.equal(sculptMax.dataQualityDetail, null);
  });

  test('ningún claim/ingrediente/dosis inventado -- todo sourceEvidence es texto literal de docs/productos/, ninguno sintetizado', () => {
    const reishi = buildProductGroundedEvidence('reishi-capsules');
    const ingredientes = reishi.sourceEvidence.find((e) => e.field === 'Ingredientes principales');
    assert.equal(ingredientes.value, '500 mg Reishi (Ganoderma Lucidum).');
    assert.equal(ingredientes.type, 'PRODUCT_FACT');

    const sculptMax = buildProductGroundedEvidence('sculpt-max');
    const ingredientesSM = sculptMax.sourceEvidence.find((e) => e.field === 'Ingredientes principales');
    assert.equal(ingredientesSM.value, 'Nuciferine, enzimas lipilíticas, ácidos orgánicos.');
    assert.equal(ingredientesSM.type, 'PRODUCT_FACT');

    // Beneficios/Objetivo principal siguen clasificados MARKETING_CLAIM, nunca PRODUCT_FACT (clasificador existente, sin cambios).
    assert.equal(reishi.sourceEvidence.find((e) => e.field === 'Beneficios').type, 'MARKETING_CLAIM');
    assert.equal(sculptMax.sourceEvidence.find((e) => e.field === 'Beneficios').type, 'MARKETING_CLAIM');
  });

  test('Crear Autónomo ya NO bloquea Reishi/Sculpt Max por falta de ficha -- buildCreativeProposal resuelve el producto real', async () => {
    const reishi = await buildCreativeProposal({ userIntent: 'Crear contenido para Cápsulas REISHI', productId: 'reishi-capsules' });
    assert.notEqual(reishi.status, 'MISSING_PRODUCT');
    assert.ok(!reishi.errors?.some((e) => e.includes('no tiene hechos reales todavía')));

    const sculptMax = await buildCreativeProposal({ userIntent: 'Crear contenido para Cápsulas Sculpt Max', productId: 'sculpt-max' });
    assert.notEqual(sculptMax.status, 'MISSING_PRODUCT');
    assert.ok(!sculptMax.errors?.some((e) => e.includes('no tiene hechos reales todavía')));
  });
});

describe('H: Product Grounding — dataQualityStatus real expuesto (Corrección "Limpieza y normalización del Product Knowledge")', () => {
  test('Café Tongkat Ali real (VERIFIED) -- Creative pipeline real recibe dataQualityStatus sin romper el resto del contrato real', () => {
    const ev = buildProductGroundedEvidence('tongkat-ali-cafe');
    assert.equal(ev.dataQualityStatus, 'VERIFIED');
    assert.equal(ev.dataQualityDetail, null);
    assert.ok(ev.nombreVisible);
  });

  test('Sculpt Black real (CONFLICT real ya detectado) -- se expone tal cual, nunca se oculta ni se corrige aquí', () => {
    const ev = buildProductGroundedEvidence('sculpt-black');
    assert.equal(ev.dataQualityStatus, 'CONFLICT');
    assert.match(ev.dataQualityDetail, /Garcinia/);
  });

  test('Venus Capsules real (VERIFIED tras la corrección real de ingredientes/beneficios, Paso 1/2 del encargo "Corrección integral") -- se expone tal cual', () => {
    const ev = buildProductGroundedEvidence('venus-capsules');
    assert.equal(ev.dataQualityStatus, 'VERIFIED');
  });
});

describe('buildCreativeProposal — productGroundedEvidence adjunta cuando EVIDENCE_BASED no resuelve', () => {
  // Fase 16 (Marketing Creative Playbook + Hypothesis Testing Integration):
  // los 5 productos de PRODUCTOS_OBJETIVO SÍ tienen Product Facts reales
  // (confirmado arriba, "produce evidencia real..."), así que cuando
  // EVIDENCE_BASED no resuelve, el sistema ya no se detiene en
  // MISSING_CREATIVE_MATCH -- construye un Experiment de hipótesis real
  // (HYPOTHESIS_EXPERIMENT_READY). productGroundedEvidence sigue
  // adjuntándose (ahora en AMBOS estados posibles cuando EVIDENCE_BASED
  // falla) -- nunca cambia a "hook/script/cta" reales de una propuesta
  // validada, eso sigue siendo estructuralmente imposible aquí.
  for (const productId of PRODUCTOS_OBJETIVO) {
    test(`${productId}: HYPOTHESIS_EXPERIMENT_READY real (Product Facts suficientes), con evidencia de producto adjunta, nunca con hook/script/cta de una propuesta EVIDENCE_BASED`, async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para generar interés', productId });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.ok(proposal.productGroundedEvidence);
      assert.equal(proposal.productGroundedEvidence.productId, productId);
      assert.ok(!('hook' in proposal));
      assert.ok(!('script' in proposal));
      assert.ok(!('cta' in proposal));
      assert.ok(proposal.variantsDetail.length >= 3);
    });
  }

  // Fase 4B (Creative Gate Enforcement): los ciclos reales que contenían el
  // CreativeCell real de Té Divina/Mars/Sculpt Tongkat Ali tienen
  // gateStatus.strategyAndBriefApproval='PENDING' -- ya no llegan a
  // PROPOSAL_READY hasta que un humano apruebe el ciclo (comportamiento
  // correcto, instrucción explícita: no es una regresión).
  //
  // Fase 16: al no tener un CreativeCell *usable* (aunque exista uno real
  // bloqueado por el gate), y SÍ tener Product Facts reales, ahora entran a
  // HYPOTHESIS_TESTING -- nunca PROPOSAL_READY fabricado, nunca se ignora
  // el gate de EVIDENCE_BASED.
  test('Té Divina, Mars, Sculpt Tongkat Ali -- bloqueados por el gate EVIDENCE_BASED (Fase 4B): HYPOTHESIS_EXPERIMENT_READY con productGroundedEvidence real, nunca PROPOSAL_READY fabricado', async () => {
    for (const productId of ['tedivina', 'mars-capsules', 'sculpt-tongkat-ali']) {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para generar interés', productId });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.ok(proposal.productGroundedEvidence);
      assert.equal(proposal.productGroundedEvidence.productId, productId);
      assert.equal(proposal.experiment.gateStatus.strategyApproval, 'PENDING');
    }
  });
});
