// autonomousCreate.test.js — Bloque 1 (Content Generation más autónomo).
// Usa datos REALES ya persistidos (creative-intelligence/data/cycles/,
// docs/productos/tedivina.md) -- ningún fixture inventado, mismo criterio
// que campaignMode.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreativeProposal } from '../src/autonomousCreate.js';
import { DeterministicCopyProvider } from '../src/copyGenerationProvider.js';

describe('buildCreativeProposal — userIntent real -> Creative Proposal real', () => {
  // Fase 4B (Creative Gate Enforcement): los 2 ciclos reales persistidos en
  // creative-intelligence/data/cycles/ tienen gateStatus.strategyAndBriefApproval
  // = 'PENDING' -- resolveCampaignCreativeCell() ya no ignora ese gate, así
  // que TéDivina (y Mars, y Sculpt Tongkat Ali) dejan de llegar a
  // PROPOSAL_READY hasta que un humano apruebe alguno de esos ciclos.
  //
  // Fase 16 (Marketing Creative Playbook + Hypothesis Testing Integration):
  // TéDivina SÍ tiene Product Facts reales (docs/productos/) -- por tanto,
  // cuando EVIDENCE_BASED falla, ya no se detiene en MISSING_CREATIVE_MATCH:
  // entra a HYPOTHESIS_TESTING (hypothesisCreativeEngine.js) y produce un
  // Experiment real de hipótesis. Esto es el comportamiento correcto,
  // explícitamente pedido (CASO 1 del encargo de Fase 16), no una
  // regresión -- el producto se sigue identificando perfectamente.
  test('resuelve TéDivina real desde una intención en prosa libre, sin inventar hechos — identidad correcta, HYPOTHESIS_EXPERIMENT_READY (Product Facts reales disponibles, EVIDENCE_BASED bloqueado por gate PENDING)', async () => {
    const proposal = await buildCreativeProposal({
      userIntent: 'Necesito un Reel para TéDivina para generar interés y llevar personas a WhatsApp, dirigido a personas con problemas digestivos.',
    });
    assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(proposal.product.productId, 'tedivina');
    assert.equal(proposal.product.nombreComercial, 'TéDivina');
    assert.ok(proposal.evidenceBasedAttempt.candidatesTried.length > 0, 'evaluó CreativeCells reales primero, nunca fabricó un match');
    assert.equal(proposal.experiment.mode, 'HYPOTHESIS_TESTING');
    assert.equal(proposal.experiment.gateStatus.strategyApproval, 'PENDING');
    assert.ok(proposal.variantsDetail.length >= 3, 'produce 3+ variantes reales, nunca una sola');
    for (const v of proposal.variantsDetail) {
      assert.equal(v.creativeVariant.status, 'HYPOTHESIS');
      assert.ok(!('verbatimQuote' in v.painHypothesis), 'nunca fabrica Customer Evidence');
    }
  });

  test('un producto no mencionado en el userIntent -> MISSING_PRODUCT, nunca asume uno', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Quiero vender algo por WhatsApp, no sé qué.' });
    assert.equal(proposal.status, 'MISSING_PRODUCT');
    assert.deepEqual(proposal.missingFields, ['productId']);
  });

  test('userIntent vacío -> VALIDATION_FAILED', async () => {
    const proposal = await buildCreativeProposal({ userIntent: '   ' });
    assert.equal(proposal.status, 'VALIDATION_FAILED');
  });

  // Corrección raíz (Fase 17): "Crear Autónomo" debe poder resolver un
  // producto real por identidad estructurada (ej. selección real en el
  // dashboard, mismo productId que ya expone /api/products) sin depender
  // de que el texto libre mencione literalmente el nombre comercial.
  describe('buildCreativeProposal — productId estructurado (identidad, no texto libre)', () => {
    test('productId real (slug de assets/products/, distinto del slug de docs/productos/) resuelve TéDivina real, ignorando el texto libre para la identidad del producto — HYPOTHESIS_EXPERIMENT_READY (Fase 16, Product Facts reales disponibles), identidad intacta', async () => {
      const proposal = await buildCreativeProposal({
        userIntent: 'Crear una campaña para generar interés y llevar personas a WhatsApp',
        productId: 'te-divina',
      });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.equal(proposal.product.productId, 'te-divina');
      assert.equal(proposal.product.nombreComercial, 'TéDivina');
    });

    // Corrección de identidad (Fase 18): las 3 fotos reales que vivían en
    // assets/products/"Tongkat ali"/ pertenecen al producto real "Café
    // Divina Tongkat Ali" (confirmado por evidencia fotográfica: el
    // empaque real dice "Café Tongkat Ali") -- la carpeta ya se renombró
    // a su productId canónico real (tongkat-ali-cafe).
    test('productId real "tongkat-ali-cafe" (Café Divina Tongkat Ali, carpeta de assets ya vinculada correctamente) -- el producto SÍ se identifica correctamente (ya no MISSING_PRODUCT); sin CreativeCell real usable, pero CON Product Facts reales -> HYPOTHESIS_EXPERIMENT_READY (Fase 16)', async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para generar interés', productId: 'tongkat-ali-cafe' });
      // Hallazgo real, separado de la corrección de identidad (Fase 18): los
      // 9 CreativeCell reales ya persistidos (creative-intelligence/data/
      // cycles/) fueron construidos para personas/pains de TéDivina (peso,
      // sensibilidad a estimulantes, estreñimiento) -- ninguno relacionado
      // con este producto real, así que ninguno alcanza el score mínimo
      // (EVIDENCE_BASED honestamente no tiene match). Pero el producto SÍ
      // tiene Product Facts reales documentados -- por tanto (Fase 16) el
      // sistema no se detiene ahí: construye un Experiment de hipótesis
      // real, grounded exclusivamente en esos hechos, nunca fabrica un
      // CreativeCell para que "funcione".
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.equal(proposal.product.productId, 'tongkat-ali-cafe');
      assert.equal(proposal.product.nombreComercial, 'Café Divina Tongkat Ali');
      assert.ok(proposal.evidenceBasedAttempt.candidatesTried.length > 0, 'evaluó CreativeCells reales, nunca fabricó un match');
      assert.ok(proposal.variantsDetail.length >= 3);
    });

    test('"Tongkat Ali" a secas NUNCA resuelve como producto independiente -- MISSING_PRODUCT explícito, nunca sustituye por Café Divina Tongkat Ali ni por ningún otro producto real relacionado', async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Crear una campaña para el producto Tongkat Ali', productId: 'Tongkat Ali' });
      assert.equal(proposal.status, 'MISSING_PRODUCT');
      assert.match(proposal.errors[0], /docs\/productos/);
    });

    test('productId real de un producto SIN hechos reales en docs/productos/ -> MISSING_PRODUCT explícito, nunca sustituye ni asume otro producto', async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Campaña genérica', productId: 'producto-de-prueba-sin-catalogo-vinculado' });
      assert.equal(proposal.status, 'MISSING_PRODUCT');
      assert.match(proposal.errors[0], /docs\/productos/);
    });

    test('productId inválido/inexistente -> MISSING_PRODUCT explícito, nunca cae de vuelta a texto libre en silencio', async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Campaña de TéDivina', productId: 'producto-que-no-existe' });
      assert.equal(proposal.status, 'MISSING_PRODUCT');
    });

    test('sin productId -- compatibilidad intacta: sigue resolviendo por texto libre como antes (identidad correcta; HYPOTHESIS_EXPERIMENT_READY por Product Facts reales, Fase 16, gate EVIDENCE_BASED sigue PENDING desde Fase 4B)', async () => {
      const proposal = await buildCreativeProposal({ userIntent: 'Necesito un Reel para TéDivina para generar interés y llevar personas a WhatsApp.' });
      assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
      assert.equal(proposal.product.productId, 'tedivina');
    });
  });

  // Fase 16: el copyProvider inyectado (EVIDENCE_BASED) nunca se invoca
  // cuando el resultado real es HYPOTHESIS_EXPERIMENT_READY -- la
  // generación de copy de hipótesis usa exclusivamente
  // hypothesisCopyProvider.js (interno a hypothesisCreativeEngine.js),
  // nunca el copyProvider inyectado por quien llama. Se verifica pasando un
  // DeterministicCopyProvider real y confirmando que el status sigue
  // siendo el de hipótesis, no PROPOSAL_READY con ese copy.
  test('acepta un copyProvider inyectado explícitamente (mismo contrato) — no se usa para HYPOTHESIS_EXPERIMENT_READY (ese camino tiene su propio generador de copy, hypothesisCopyProvider.js), el parámetro se acepta sin error', async () => {
    const proposal = await buildCreativeProposal({
      userIntent: 'Campaña de TéDivina',
      copyProvider: new DeterministicCopyProvider(),
    });
    assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
  });

  // Fase 16: con los 2 ciclos reales en PENDING, TéDivina ya no llega a
  // PROPOSAL_READY (EVIDENCE_BASED sigue bloqueado, Fase 4B intacta) -- pero
  // ahora SÍ produce un Experiment de hipótesis real en vez de detenerse.
  // "proposal.hook" (forma EXCLUSIVA de PROPOSAL_READY) sigue siendo
  // undefined -- el shape de HYPOTHESIS_EXPERIMENT_READY es
  // deliberadamente distinto (experiment/variantsDetail), nunca reutiliza
  // los campos planos de una propuesta EVIDENCE_BASED.
  test('con el gate EVIDENCE_BASED en PENDING, nunca se llega a PROPOSAL_READY -- entra a HYPOTHESIS_EXPERIMENT_READY en su lugar (Fase 16), nunca confundido con una propuesta validada', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Campaña de TéDivina para bajar de peso' });
    assert.equal(proposal.status, 'HYPOTHESIS_EXPERIMENT_READY');
    assert.equal(proposal.hook, undefined);
    assert.notEqual(proposal.status, 'PROPOSAL_READY');
  });
});
