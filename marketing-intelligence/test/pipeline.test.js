import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRecord } from '../src/contract.js';
import { extractObservations } from '../src/pipeline/observation.js';
import { aggregateInferences } from '../src/pipeline/inference.js';
import { generateHypotheses } from '../src/pipeline/hypothesis.js';

function fixtureRecord(content, title = null) {
  return createRecord({ source: 'web', platform_object_type: 'article', url: 'https://fixture.test', title, content, access_method: 'specialized_tool' });
}

describe('pipeline — Observación (Etapa A)', () => {
  test('detecta una apertura con pregunta', () => {
    const record = fixtureRecord('¿Sabías que el 90% de las personas abandona la dieta? Sigue leyendo.');
    const observations = extractObservations(record);
    const hook = observations.find((o) => o.dimension === 'hook');
    assert.ok(hook, 'debe detectar el hook de apertura interrogativa');
    assert.equal(hook.basis, 'OBSERVADO');
    assert.match(hook.evidence_quote, /\?/);
    assert.equal(hook.source_record_id, record.record_id);
  });

  test('detecta un CTA explícito', () => {
    const record = fixtureRecord('Este producto es increíble. Compra ahora y recibe un descuento especial.');
    const observations = extractObservations(record);
    const cta = observations.find((o) => o.dimension === 'cta');
    assert.ok(cta);
    assert.match(cta.evidence_quote.toLowerCase(), /compra ahora/);
  });

  test('detecta un mecanismo de urgencia/escasez', () => {
    const record = fixtureRecord('Oferta válida solo hoy, no la dejes pasar.');
    const observations = extractObservations(record);
    const mechanism = observations.find((o) => o.dimension === 'mecanismo');
    assert.ok(mechanism);
  });

  test('no inventa observaciones cuando no hay patrones detectables', () => {
    const record = fixtureRecord('Texto neutro sin preguntas, sin llamadas a la acción, sin urgencia.');
    const observations = extractObservations(record);
    assert.equal(observations.length, 0);
  });
});

describe('pipeline — Inferencia (Etapa B)', () => {
  test('agrega observaciones repetidas y calcula frecuencia con scope declarado', () => {
    const recordA = fixtureRecord('¿Quieres saber el secreto?');
    const recordB = fixtureRecord('Otro texto. ¿Ya lo probaste?');
    const observations = [...extractObservations(recordA), ...extractObservations(recordB)];

    const inferences = aggregateInferences(observations, { scopeLabel: 'N=2 registros de prueba' });
    const hookInference = inferences.find((i) => i.dimension === 'hook');

    assert.ok(hookInference);
    assert.equal(hookInference.scope, 'N=2 registros de prueba');
    assert.equal(hookInference.frequency, 1);
    assert.equal(hookInference.based_on_observation_ids.length, 2);
  });

  test('devuelve arreglo vacío si no hay observaciones', () => {
    assert.deepEqual(aggregateInferences([]), []);
  });
});

describe('pipeline — Hipótesis (Etapa C)', () => {
  test('toda hipótesis queda marcada como no verificada y referencia su inferencia de origen', () => {
    const record = fixtureRecord('¿Sabías esto?');
    const observations = extractObservations(record);
    const inferences = aggregateInferences(observations, { scopeLabel: 'N=1' });
    const hypotheses = generateHypotheses(inferences);

    assert.equal(hypotheses.length, inferences.length);
    for (const h of hypotheses) {
      assert.equal(h.basis, 'HIPOTESIS');
      assert.equal(h.requires_review, true);
      assert.ok(inferences.some((i) => i.inference_id === h.based_on_inference_id));
    }
  });
});
