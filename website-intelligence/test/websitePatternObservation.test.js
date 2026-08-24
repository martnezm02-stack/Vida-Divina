import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';

function base(overrides = {}) {
  return {
    url: 'https://ejemplo-ficticio.test/pagina',
    page_id: 'site-fake::pagina',
    dimension: 'PAGE_STRUCTURE',
    value: 'hero_beneficios_cta',
    evidence: { method: 'dom', detail: 'orden de secciones observado' },
    confidence: 0.6,
    confidence_basis: 'fixture de prueba',
    ...overrides,
  };
}

describe('WebsitePatternObservation — campos obligatorios y tipos', () => {
  test('crea una observación válida con basis OBSERVADO y requires_human_review=true', () => {
    const obs = createWebsitePatternObservation(base());
    assert.equal(obs.basis, 'OBSERVADO');
    assert.equal(obs.requires_human_review, true);
    assert.ok(obs.observation_id);
    assert.ok(obs.retrieved_at);
  });

  test('rechaza sin url, sin page_id, sin dimension válida o sin value', () => {
    assert.throws(() => createWebsitePatternObservation({ ...base(), url: undefined }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), page_id: undefined }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), dimension: 'INVENTADA' }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), value: undefined }));
  });

  test('nunca acepta una observación sin evidencia, o con evidencia vacía/método inválido', () => {
    assert.throws(() => createWebsitePatternObservation({ ...base(), evidence: undefined }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), evidence: { method: 'dom', detail: '' } }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), evidence: { method: 'metodo_inventado', detail: 'x' } }));
  });

  test('confidence debe estar en [0,1] y confidence_basis es obligatorio', () => {
    assert.throws(() => createWebsitePatternObservation({ ...base(), confidence: 1.5 }));
    assert.throws(() => createWebsitePatternObservation({ ...base(), confidence_basis: undefined }));
  });

  test('viewport, cuando se especifica, debe ser desktop/tablet/mobile', () => {
    assert.throws(() => createWebsitePatternObservation({ ...base(), viewport: 'ultrawide' }));
    const ok = createWebsitePatternObservation({ ...base(), viewport: 'mobile' });
    assert.equal(ok.viewport, 'mobile');
  });
});

describe('WebsitePatternObservation — campos condicionales por dimensión', () => {
  test('INTERACTION_PATTERN exige el campo interaction (estado A/B)', () => {
    assert.throws(() => createWebsitePatternObservation({ ...base({ dimension: 'INTERACTION_PATTERN', value: 'accordion' }) }));
    const obs = createWebsitePatternObservation(base({
      dimension: 'INTERACTION_PATTERN', value: 'accordion',
      interaction: { trigger: 'click', state_before: { detail: 'colapsado' }, state_after: { detail: 'expandido' } },
    }));
    assert.equal(obs.interaction.trigger, 'click');
    assert.equal(obs.interaction.state_before.detail, 'colapsado');
    assert.equal(obs.interaction.state_after.detail, 'expandido');
  });

  test('RESPONSIVE_PATTERN exige el campo responsive', () => {
    assert.throws(() => createWebsitePatternObservation(base({ dimension: 'RESPONSIVE_PATTERN', value: 'nav_colapsa' })));
    const obs = createWebsitePatternObservation(base({
      dimension: 'RESPONSIVE_PATTERN', value: 'nav_colapsa',
      responsive: { viewport_from: 'desktop', viewport_to: 'mobile', change_detail: 'nav a hamburguesa' },
    }));
    assert.equal(obs.responsive.viewport_from, 'desktop');
    assert.equal(obs.responsive.viewport_to, 'mobile');
  });

  test('DESIGN_TOKEN exige el campo token, y el token es un HECHO observado (no una recomendación)', () => {
    assert.throws(() => createWebsitePatternObservation(base({ dimension: 'DESIGN_TOKEN', value: 'color_cta' })));
    const obs = createWebsitePatternObservation(base({
      dimension: 'DESIGN_TOKEN', value: 'color_cta',
      token: { token_type: 'color', observed_value: '#2563EB' },
    }));
    assert.equal(obs.token.observed_value, '#2563EB');
    assert.ok(!('recommended_value' in obs.token));
  });

  test('DESIGN_TOKEN rechaza estructuralmente cualquier campo que sugiera adopción automática', () => {
    assert.throws(
      () => createWebsitePatternObservation(base({
        dimension: 'DESIGN_TOKEN', value: 'color_cta',
        token: { token_type: 'color', observed_value: '#2563EB', recommended_value: '#2563EB' },
      })),
      /adopción automática/
    );
  });

  test('CONVERSION_FLOW exige el campo conversion_flow con la secuencia observada', () => {
    assert.throws(() => createWebsitePatternObservation(base({ dimension: 'CONVERSION_FLOW', value: 'x' })));
    const obs = createWebsitePatternObservation(base({
      dimension: 'CONVERSION_FLOW', value: 'problema_oferta_cta',
      conversion_flow: { sequence: ['problema', 'oferta', 'cta'] },
    }));
    assert.deepEqual(obs.conversion_flow.sequence, ['problema', 'oferta', 'cta']);
  });
});
