// productCoverage.test.js — Fase 19 (Creative Intelligence Product
// Coverage, alcance controlado a 9 productos físicamente disponibles).
// Documenta como regresión real el estado de cobertura auditado en esta
// fase -- nunca fabrica una CreativeCell nueva; solo verifica el
// comportamiento real y determinista ya existente (campaignMode.js) contra
// los hechos reales de cada producto (docs/productos/).
//
// Fase 4B (Creative Gate Enforcement): los 2 ciclos reales persistidos en
// creative-intelligence/data/cycles/ tienen gateStatus.strategyAndBriefApproval
// = 'PENDING' -- resolveCampaignCreativeCell() ya no ignora ese gate, así
// que NINGUNO de los 9 productos llega hoy a PROPOSAL_READY vía datos
// reales (antes, 3 de ellos sí llegaban porque el gate no se verificaba).
// Esto es el comportamiento correcto tras la corrección (instrucción
// explícita: no es una regresión). La distinción real que esta fase
// documentaba sigue siendo cierta y se sigue probando aquí, solo que ahora
// se ve en el diagnóstico del error (candidatesTried/gatedCandidate), no en
// un status de éxito:
//   - PRODUCTOS_CON_MATCH_REAL: SÍ existe un CreativeCell real cuyo score
//     alcanza el umbral (MissingStrategicMatchError.gatedCandidate real).
//   - PRODUCTOS_SIN_MATCH_REAL: ningún CreativeCell alcanza el umbral, con
//     o sin gate (MissingStrategicMatchError.gatedCandidate === null).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCampaignCreativeCell, MissingStrategicMatchError } from '../src/campaignMode.js';
import { loadProductFacts } from '../src/productFactsLoader.js';
import { buildCreativeProposal } from '../src/autonomousCreate.js';

// Score real >= MIN_MATCH_SCORE contra un CreativeCell real ya persistido,
// pero bloqueado por gateStatus.strategyAndBriefApproval='PENDING' (Fase 4B).
const PRODUCTOS_CON_MATCH_REAL = Object.freeze(['sculpt-tongkat-ali', 'tedivina', 'mars-capsules']);
// INSUFFICIENT_PRODUCT_DATA real: tienen hechos reales completos, pero
// ningún CreativeCell real ya persistido comparte suficientes palabras
// clave -- no se fabricó ninguna CreativeCell nueva para "arreglar" esto
// (requeriría evidencia real de investigación de cliente que no existe en
// el proyecto para estos productos). El gate de Fase 4B no cambia esto:
// seguían sin match aun cuando el gate no se verificaba.
const PRODUCTOS_SIN_MATCH_REAL = Object.freeze(['cappuccino', 'sculpt-black', 'venus-capsules', 'ripped-capsules', 'extracto-tremella']);

function resolveOrCaptureError(productId) {
  try {
    return { resolved: resolveCampaignCreativeCell({ productId }), err: null };
  } catch (err) {
    return { resolved: null, err };
  }
}

describe('Creative Intelligence Product Coverage (Fase 19) — 9 productos objetivo', () => {
  for (const productId of PRODUCTOS_CON_MATCH_REAL) {
    test(`${productId}: tiene hechos reales Y un CreativeCell real que alcanza el umbral -- bloqueado por el gate (Fase 4B), nunca "sin evidencia"`, () => {
      const facts = loadProductFacts(productId);
      assert.ok(facts.nombreComercial);
      const { err } = resolveOrCaptureError(productId);
      assert.ok(err instanceof MissingStrategicMatchError);
      assert.ok(err.gatedCandidate, `${productId} debe reportar un gatedCandidate real (score suficiente, gate PENDING)`);
      assert.ok(err.gatedCandidate.score >= 2);
      assert.equal(err.gatedCandidate.strategyAndBriefApproval, 'PENDING');
    });
  }

  for (const productId of PRODUCTOS_SIN_MATCH_REAL) {
    test(`${productId}: tiene hechos reales pero NINGÚN CreativeCell real alcanza el umbral -- INSUFFICIENT_PRODUCT_DATA, nunca se fabrica un match (con o sin gate)`, () => {
      const facts = loadProductFacts(productId);
      assert.ok(facts.nombreComercial, 'debe tener hechos reales -- si esto falla, el gap real es de catálogo, no de Creative Intelligence');
      const { err } = resolveOrCaptureError(productId);
      assert.ok(err instanceof MissingStrategicMatchError);
      assert.equal(err.gatedCandidate, null, `${productId} nunca debe reportar un gatedCandidate -- su falta de match es por score, no por gate`);
    });
  }

  test('Tongkat Ali (a secas) -- CATALOG_GAP real: ningún archivo de docs/productos/ documenta este producto de forma independiente (agotado: catalogo 2026.pdf 54/54 páginas, docs/proceso_de_venta/recursos/precios.md, docs/COMMERCIAL_CATALOG.md)', () => {
    assert.throws(() => loadProductFacts('Tongkat Ali'), /no existe ningún archivo real/);
    assert.throws(() => loadProductFacts('tongkat-ali'), /no existe ningún archivo real/);
  });

  test('Sculpt Tongkat Ali y Café Divina Tongkat Ali (tongkat-ali-cafe) son productos independientes -- nunca se fusionan', () => {
    const sculpt = loadProductFacts('sculpt-tongkat-ali');
    const cafe = loadProductFacts('tongkat-ali-cafe');
    assert.notEqual(sculpt.nombreComercial, cafe.nombreComercial);
    assert.equal(sculpt.nombreComercial, 'Café Divina Sculpt Tongkat Ali');
    assert.equal(cafe.nombreComercial, 'Café Divina Tongkat Ali');
  });

  test('no hay contaminación cruzada: cada producto identifica su PROPIO CreativeCell real bloqueado (gatedCandidate), nunca el mismo texto de otro producto', () => {
    const sculpt = resolveOrCaptureError('sculpt-tongkat-ali').err;
    const tedivina = resolveOrCaptureError('tedivina').err;
    const mars = resolveOrCaptureError('mars-capsules').err;
    const ids = [sculpt.gatedCandidate.creativeCellId, tedivina.gatedCandidate.creativeCellId, mars.gatedCandidate.creativeCellId];
    assert.equal(new Set(ids).size, 3, 'los 3 productos deben identificar CreativeCells reales distintos como bloqueados');
  });

  test('Té Divina identifica el mismo CreativeCell real ya conocido de fases anteriores como su gatedCandidate -- no se duplicó ni se creó uno nuevo en esta fase', () => {
    const { err } = resolveOrCaptureError('tedivina');
    assert.equal(err.gatedCandidate.creativeCellId, 'a3da440f-16c7-40c4-9c45-7bebe15b3901');
  });

  // Fase 16 (Marketing Creative Playbook + Hypothesis Testing Integration):
  // los 9 productos de esta suite tienen Product Facts reales (verificado
  // línea arriba con loadProductFacts() para cada uno) -- sin importar si
  // EVIDENCE_BASED falla por gate (PRODUCTOS_CON_MATCH_REAL) o por score
  // insuficiente (PRODUCTOS_SIN_MATCH_REAL), ambos grupos ahora entran a
  // HYPOTHESIS_TESTING en vez de detenerse. La distinción real entre los
  // dos grupos (gatedCandidate presente o no) sigue intacta y sigue
  // probada arriba, a nivel de resolveCampaignCreativeCell() -- no cambia
  // en absoluto; solo cambia lo que autonomousCreate.js hace DESPUÉS de
  // recibir ese error.
  test('buildCreativeProposal end-to-end: los 3 productos con CreativeCell real de score suficiente (bloqueados por el gate, Fase 4B) entran a HYPOTHESIS_EXPERIMENT_READY -- nunca PROPOSAL_READY fabricado, EVIDENCE_BASED sigue intacto', async () => {
    for (const productId of PRODUCTOS_CON_MATCH_REAL) {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para generar interés', productId });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY', `${productId} debería producir un experimento de hipótesis real mientras el gate EVIDENCE_BASED esté PENDING`);
      assert.equal(proposal.product.productId, productId);
      assert.notEqual(proposal.status, 'PROPOSAL_READY');
    }
  });

  test('buildCreativeProposal end-to-end: los productos sin cobertura real de Creative Intelligence, pero con Product Facts reales, entran a HYPOTHESIS_EXPERIMENT_READY -- nunca inventan una CreativeCell ni una propuesta validada', async () => {
    for (const productId of PRODUCTOS_SIN_MATCH_REAL) {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para generar interés', productId });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.equal(proposal.product.productId, productId);
      assert.notEqual(proposal.status, 'PROPOSAL_READY');
    }
  });

  test('un producto futuro (nunca visto) que tenga hechos reales pero sin CreativeCell -- el mecanismo funciona sin ningún hardcode de nombres de producto', () => {
    // Prueba de generalidad: extracto-tremella nunca se mencionó en la
    // construcción original de campaignMode.js/productMatcher.js (ambos
    // archivos ya existían antes de que esta fase evaluara este producto)
    // -- si resuelve sus hechos reales y evalúa candidatos sin fallar por
    // "producto desconocido", confirma que el mecanismo es genérico.
    const facts = loadProductFacts('extracto-tremella');
    assert.equal(facts.nombreComercial, 'Divina Extracto de Tremella (Tremella fuciformis) — Pure Extract Powder');
    let err;
    try { resolveCampaignCreativeCell({ productId: 'extracto-tremella' }); } catch (e) { err = e; }
    assert.ok(err instanceof MissingStrategicMatchError);
    assert.ok(err.candidatesTried.length > 0, 'evaluó candidatos reales, nunca fabricó uno');
  });
});
