import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectTrends } from '../src/pipeline/trend.js';

function inference({ dimension, pattern, frequency, retrieved_at, inference_id }) {
  return { dimension, pattern, frequency, retrieved_at, inference_id };
}

describe('detectTrends — nunca inventa una tendencia con un solo punto de datos', () => {
  test('con una sola corrida, reporta insufficient_data explícitamente', () => {
    const trends = detectTrends([
      inference({ dimension: 'HOOK', pattern: 'pregunta', frequency: 0.5, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'a' }),
    ]);
    assert.equal(trends.length, 1);
    assert.equal(trends[0].direction, 'insufficient_data');
    assert.match(trends[0].note, /más de una corrida/);
  });

  test('con dos corridas donde la frecuencia sube, reporta direction: up', () => {
    const trends = detectTrends([
      inference({ dimension: 'HOOK', pattern: 'pregunta', frequency: 0.2, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'a' }),
      inference({ dimension: 'HOOK', pattern: 'pregunta', frequency: 0.6, retrieved_at: '2026-08-05T00:00:00.000Z', inference_id: 'b' }),
    ]);
    assert.equal(trends[0].direction, 'up');
    assert.equal(trends[0].previous_frequency, 0.2);
    assert.equal(trends[0].current_frequency, 0.6);
  });

  test('con dos corridas donde la frecuencia baja, reporta direction: down', () => {
    const trends = detectTrends([
      inference({ dimension: 'CTA', pattern: 'llamada_a_la_accion', frequency: 0.8, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'a' }),
      inference({ dimension: 'CTA', pattern: 'llamada_a_la_accion', frequency: 0.3, retrieved_at: '2026-08-05T00:00:00.000Z', inference_id: 'b' }),
    ]);
    assert.equal(trends[0].direction, 'down');
  });

  test('con diferencia mínima, reporta stable en vez de un falso positivo', () => {
    const trends = detectTrends([
      inference({ dimension: 'URGENCY', pattern: 'urgencia_o_escasez', frequency: 0.30, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'a' }),
      inference({ dimension: 'URGENCY', pattern: 'urgencia_o_escasez', frequency: 0.31, retrieved_at: '2026-08-05T00:00:00.000Z', inference_id: 'b' }),
    ]);
    assert.equal(trends[0].direction, 'stable');
  });

  test('patrones distintos se evalúan de forma independiente', () => {
    const trends = detectTrends([
      inference({ dimension: 'HOOK', pattern: 'pregunta', frequency: 0.5, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'a' }),
      inference({ dimension: 'CTA', pattern: 'llamada_a_la_accion', frequency: 0.5, retrieved_at: '2026-08-01T00:00:00.000Z', inference_id: 'b' }),
    ]);
    assert.equal(trends.length, 2);
  });
});
