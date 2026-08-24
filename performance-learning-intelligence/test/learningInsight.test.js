import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLearningInsight, createStrategyInput } from '../src/learningInsight.js';

function base(overrides = {}) {
  return {
    dimension: 'FORMAT', pattern: 'slideshow', evidence: 'Los posts con formato slideshow muestran mayor mediana de views que el baseline de Instagram dentro de este corpus.',
    based_on_content_ids: ['c1', 'c2'], based_on_performance_observation_ids: ['po1', 'po2'], based_on_signal_ids: ['sig1', 'sig2'],
    scope: 'own_content_sample (N=10)', direction: 'ABOVE_BASELINE', confidence: 0.6, confidence_basis: 'frecuencia observada en la muestra',
    ...overrides,
  };
}

describe('LearningInsight — contrato y disciplina anti-causalidad (§6)', () => {
  test('crea un insight válido con basis INFERENCIA y requires_human_review=true', () => {
    const insight = createLearningInsight(base());
    assert.equal(insight.basis, 'INFERENCIA');
    assert.equal(insight.requires_human_review, true);
  });

  test('rechaza evidence con lenguaje causal prohibido ("causa", "garantiza", "convierte mejor", "hace viral")', () => {
    assert.throws(() => createLearningInsight(base({ evidence: 'El hook de pregunta causa más ventas.' })));
    assert.throws(() => createLearningInsight(base({ evidence: 'Este formato garantiza más views.' })));
    assert.throws(() => createLearningInsight(base({ evidence: 'Esto hace viral el contenido.' })));
  });

  test('rechaza sin evidencia trazable (arreglos vacíos de content/observation/signal ids)', () => {
    assert.throws(() => createLearningInsight(base({ based_on_content_ids: [] })));
    assert.throws(() => createLearningInsight(base({ based_on_performance_observation_ids: [] })));
    assert.throws(() => createLearningInsight(base({ based_on_signal_ids: [] })));
  });

  test('direction debe ser uno de los signal_type válidos, nunca "VIRAL"', () => {
    assert.throws(() => createLearningInsight(base({ direction: 'VIRAL' })));
    const insight = createLearningInsight(base({ direction: 'BELOW_BASELINE' }));
    assert.equal(insight.direction, 'BELOW_BASELINE');
  });

  test('acepta external_reference hacia viral_content_intelligence (§8), sin duplicar ContentOpportunity — solo referencia por id', () => {
    const insight = createLearningInsight(base({ external_reference: { source_module: 'viral_content_intelligence', content_opportunity_id: 'opp-123' } }));
    assert.equal(insight.external_reference.content_opportunity_id, 'opp-123');
  });

  test('rechaza un source_module distinto de viral_content_intelligence en external_reference', () => {
    assert.throws(() => createLearningInsight(base({ external_reference: { source_module: 'marketing_intelligence', content_opportunity_id: 'x' } })));
  });
});

describe('createStrategyInput — §9, combina patrón externo + aprendizaje propio sin generar en masa', () => {
  test('produce un strategy_input trazable a ambas fuentes, marcado como HIPOTESIS (recomendación, no garantía)', () => {
    const insight = createLearningInsight(base());
    const strategyInput = createStrategyInput({
      external_pattern: { description: 'hook pregunta aparece en 2/5 videos externos', content_opportunity_id: 'opp-999' },
      own_insight: insight,
    });
    assert.equal(strategyInput.basis, 'HIPOTESIS');
    assert.equal(strategyInput.requires_human_review, true);
    assert.equal(strategyInput.based_on_insight_id, insight.insight_id);
    assert.equal(strategyInput.based_on_external_pattern.content_opportunity_id, 'opp-999');
    assert.match(strategyInput.strategy_input, /experimental/);
  });

  test('rechaza un own_insight que no sea un LearningInsight real (nunca inventa uno)', () => {
    assert.throws(() => createStrategyInput({ external_pattern: { description: 'x' }, own_insight: { pattern: 'sin insight_id' } }));
  });
});
