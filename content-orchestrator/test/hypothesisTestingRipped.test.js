// hypothesisTestingRipped.test.js — Fase 5, Fase 11: Ripped como caso de
// prueba. NO se crea Customer Evidence ficticia para Ripped, NO se crea una
// Persona/Pain real ni un CreativeCell real -- solo se demuestra que Ripped
// puede recorrer el pipeline HYPOTHESIS_TESTING (creative-intelligence/src/
// hypothesisTesting.js) usando exclusivamente sus Product Facts reales
// (docs/productos/07-rendimiento-fisico.md, vía productFactsLoader.js, sin
// cambios), mientras el pipeline EVIDENCE_BASED (campaignMode.js) sigue
// devolviendo MISSING_CREATIVE_MATCH exactamente igual que antes de esta
// fase -- ambos pipelines coexisten, ninguno se bloquea al otro.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadProductFacts } from '../src/productFactsLoader.js';
import { resolveCampaignCreativeCell, MissingStrategicMatchError } from '../src/campaignMode.js';
import {
  createPersonaHypothesis, createPainHypothesis, createCreativeVariant, createExperiment,
} from '../../creative-intelligence/src/hypothesisTesting.js';

describe('Ripped — EVIDENCE_BASED sigue MISSING_CREATIVE_MATCH (sin cambios, Fase 4B)', () => {
  test('resolveCampaignCreativeCell(ripped-capsules) sigue rechazando -- este pipeline no se toca en esta fase', () => {
    assert.throws(() => resolveCampaignCreativeCell({ productId: 'ripped-capsules' }), MissingStrategicMatchError);
  });
});

describe('Ripped — HYPOTHESIS_TESTING (Fase 5) construido exclusivamente con Product Facts reales', () => {
  test('las hipótesis y el experimento se construyen solo desde docs/productos/07-rendimiento-fisico.md real, nunca de evidencia fabricada', () => {
    const facts = loadProductFacts('ripped-capsules');
    assert.equal(facts.nombreComercial, 'Divina Ripped Capsules');

    // Product Facts reales -> basis de la hipótesis (Fase 10: nunca se
    // convierten en Customer Evidence, solo alimentan una hipótesis).
    const productBasis = [
      { type: 'PRODUCT_FACT', ref: 'problema', detail: facts.problema },
      { type: 'PRODUCT_FACT', ref: 'beneficios', detail: facts.beneficios },
    ];

    const personaHypothesis = createPersonaHypothesis({
      name: 'El Interesado en Recuperar Fuerza (hipótesis)',
      lifeSituation: 'Nota pérdida de masa muscular y energía asociada a la edad.',
      relationshipToProblem: 'Busca una alternativa real para recuperar fuerza física.',
      basis: productBasis,
    });
    const painHypothesis = createPainHypothesis({
      personaHypothesisId: personaHypothesis.personaHypothesisId,
      painPoint: `Hipótesis: podría preocupar "${facts.problema}"`,
      basis: productBasis,
    });

    const variantA = createCreativeVariant({
      personaHypothesisId: personaHypothesis.personaHypothesisId, painHypothesisId: painHypothesis.painHypothesisId,
      awareness: 'Problem Aware', angleText: 'Por qué se pierde masa muscular con la edad', hook: '¿Notas que ya no tienes la misma fuerza?',
      format: 'Educational walk-and-talk', mechanism: 'explicar el mecanismo de Tongkat Ali + Ganoderma sin claims médicos',
    });
    const variantB = createCreativeVariant({
      personaHypothesisId: personaHypothesis.personaHypothesisId, painHypothesisId: painHypothesis.painHypothesisId,
      awareness: 'Solution Aware', angleText: 'Una alternativa natural para el aumento muscular', hook: 'Esto es lo que uso para recuperar fuerza',
      format: 'POV personal story', mechanism: 'presentación en primera persona del beneficio real del producto',
    });
    const variantC = createCreativeVariant({
      personaHypothesisId: personaHypothesis.personaHypothesisId, painHypothesisId: painHypothesis.painHypothesisId,
      awareness: 'Product Aware', angleText: 'Comparación de alternativas para fuerza y musculatura', hook: 'Esto es lo que diferencia a Ripped',
      format: 'Static comparison frames', mechanism: 'comparación estructurada de ingredientes reales',
    });

    const experiment = createExperiment({ productBasis, variants: [variantA, variantB, variantC] });

    assert.equal(experiment.mode, 'HYPOTHESIS_TESTING');
    assert.equal(experiment.variants.length, 3);
    assert.equal(experiment.gateStatus.strategyApproval, 'PENDING'); // nunca aprobado automáticamente
    for (const v of experiment.variants) {
      assert.equal(v.status, 'HYPOTHESIS');
      assert.equal(v.mode, 'HYPOTHESIS_TESTING');
    }
    // Ninguna pieza de este experimento tiene forma de Customer Evidence real.
    assert.ok(!('verbatimQuote' in personaHypothesis));
    assert.ok(!('evidenceIds' in personaHypothesis));
    assert.ok(!('confidence' in personaHypothesis));
  });

  test('el experimento de Ripped NO interfiere con ni sustituye al MISSING_CREATIVE_MATCH real de campaignMode.js -- ambos pipelines son independientes', () => {
    assert.throws(() => resolveCampaignCreativeCell({ productId: 'ripped-capsules' }), MissingStrategicMatchError);
  });
});
