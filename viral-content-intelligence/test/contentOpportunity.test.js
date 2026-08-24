import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentOpportunity } from '../src/contentOpportunity.js';

function base(overrides = {}) {
  return {
    market_pattern: { description: 'Pregunta directa aparece en 2/5 videos seleccionados.', dimension: 'HOOK', frequency: 0.4, scope: 'selected_youtube_sample', inference_id: 'inf-1' },
    source_observation_ids: ['obs-1', 'obs-2'],
    hypothesis: { hypothesis_id: 'hyp-1', text: 'El patrón "pregunta directa" podría tener algún efecto, pero es especulativo.' },
    vida_divina_relevance: { relation_to_primary_context: 'TéDivina podría abrir contenido educativo con una pregunta directa sobre desintoxicación, como hacen 2/5 videos de la muestra.', product_ref: 'TéDivina' },
    ...overrides,
  };
}

describe('ContentOpportunity — estructura y trazabilidad', () => {
  test('crea una oportunidad válida con requires_human_review=true fijo', () => {
    const opp = createContentOpportunity(base());
    assert.equal(opp.requires_human_review, true);
    assert.ok(opp.content_opportunity_id);
    assert.equal(opp.market_pattern.dimension, 'HOOK');
  });

  test('requires_human_review no puede sobreescribirse — no es un parámetro de entrada real', () => {
    const opp = createContentOpportunity({ ...base(), requires_human_review: false });
    assert.equal(opp.requires_human_review, true, 'un intento de pasar false debe ser ignorado');
  });

  test('rechaza sin market_pattern.description — nunca una oportunidad sin patrón descrito', () => {
    assert.throws(() => createContentOpportunity(base({ market_pattern: { dimension: 'HOOK' } })));
  });

  test('rechaza sin source_observation_ids no vacío — nunca una oportunidad sin evidencia real', () => {
    assert.throws(() => createContentOpportunity(base({ source_observation_ids: [] })));
  });

  test('rechaza sin hypothesis.hypothesis_id — nunca inventa una hipótesis nueva dentro de la oportunidad', () => {
    assert.throws(() => createContentOpportunity(base({ hypothesis: { text: 'sin id' } })));
  });

  test('rechaza sin vida_divina_relevance.relation_to_primary_context — la relevancia es una inferencia separada obligatoria', () => {
    assert.throws(() => createContentOpportunity(base({ vida_divina_relevance: { product_ref: 'TéDivina' } })));
  });

  test('performance_signal es opcional (null válido), pero si se incluye debe traer metric_value numérico real', () => {
    const withNull = createContentOpportunity(base({ performance_signal: null }));
    assert.equal(withNull.performance_signal, null);

    assert.throws(() => createContentOpportunity(base({ performance_signal: { metric_value: 'no-es-un-numero' } })));

    const withSignal = createContentOpportunity(base({ performance_signal: { observation_id: 'obs-perf-1', metric: 'views', metric_value: 474512 } }));
    assert.equal(withSignal.performance_signal.metric_value, 474512);
  });

  test('nunca afirma causalidad: el texto de ejemplo del test no contiene frases prohibidas (control de disciplina del propio test)', () => {
    const opp = createContentOpportunity(base());
    const serialized = JSON.stringify(opp).toLowerCase();
    for (const forbidden of ['esto hace viral', 'garantiza ventas', 'convierte mejor']) {
      assert.doesNotMatch(serialized, new RegExp(forbidden));
    }
  });
});
