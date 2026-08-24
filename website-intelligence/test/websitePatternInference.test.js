import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';
import { aggregateWebsitePatternInferences } from '../src/websitePatternInference.js';
import { generateWebsitePatternHypotheses } from '../src/websitePatternHypothesis.js';

function conversionObservation(sequenceLabel) {
  return createWebsitePatternObservation({
    url: `https://ejemplo-ficticio.test/${sequenceLabel}`,
    page_id: `site::${sequenceLabel}`,
    dimension: 'CONVERSION_FLOW',
    value: sequenceLabel,
    evidence: { method: 'html_structure', detail: 'orden de secciones' },
    confidence: 0.6,
    confidence_basis: 'fixture',
    conversion_flow: { sequence: sequenceLabel.split('_') },
  });
}

describe('Etapa B — Inferencia agregada (Website Intelligence)', () => {
  test('agrega observaciones repetidas con alcance (scope) declarado', () => {
    const observations = [conversionObservation('problema_oferta_cta'), conversionObservation('problema_oferta_cta')];
    const inferences = aggregateWebsitePatternInferences(observations, { scopeLabel: 'N=2 sitios de referencia' });
    assert.equal(inferences.length, 1);
    assert.equal(inferences[0].basis, 'INFERENCIA');
    assert.equal(inferences[0].frequency, 1);
    assert.equal(inferences[0].scope, 'N=2 sitios de referencia');
  });

  test('sin observaciones, no genera ninguna inferencia (nunca inventa un patrón)', () => {
    assert.deepEqual(aggregateWebsitePatternInferences([]), []);
  });
});

describe('Etapa C — Hipótesis (Website Intelligence) nunca afirma causalidad', () => {
  test('toda hipótesis de CONVERSION_FLOW se redacta como especulativa, sin afirmar que convierte mejor', () => {
    const observations = [conversionObservation('problema_oferta_cta')];
    const inferences = aggregateWebsitePatternInferences(observations, { scopeLabel: 'N=1' });
    const hypotheses = generateWebsitePatternHypotheses(inferences);

    assert.equal(hypotheses.length, 1);
    assert.equal(hypotheses[0].basis, 'HIPOTESIS');
    assert.equal(hypotheses[0].requires_review, true);
    assert.match(hypotheses[0].hypothesis, /no está demostrado|no hay evidencia de rendimiento real/);
    assert.doesNotMatch(hypotheses[0].hypothesis, /convierte mejor\.|es superior\./);
  });
});
