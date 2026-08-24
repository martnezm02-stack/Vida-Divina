// trend.js — Detección de TREND: compara la frecuencia de un mismo patrón
// (dimension+pattern) entre corridas de análisis distintas en el tiempo.
//
// Requiere al menos DOS corridas históricas con ese patrón para producir una
// dirección real. Con una sola corrida se reporta 'insufficient_data'
// explícitamente — nunca se inventa una tendencia con un solo punto de datos.
// Las Inferencias (Etapa B, src/pipeline/inference.js) YA SON el mecanismo de
// detección de PATTERN de la taxonomía; TREND es un nivel más: comparar esos
// patrones a través del tiempo, reutilizando las Inferencias ya calculadas.

import { randomUUID } from 'node:crypto';

export function detectTrends(allHistoricalInferences) {
  const byKey = new Map(); // `${dimension}::${pattern}` -> [{retrieved_at, frequency, inference_id}]

  for (const inference of allHistoricalInferences) {
    const key = `${inference.dimension}::${inference.pattern}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({
      retrieved_at: inference.retrieved_at,
      frequency: inference.frequency,
      inference_id: inference.inference_id,
    });
  }

  const trends = [];
  for (const [key, points] of byKey) {
    const [dimension, pattern] = key.split('::');

    if (points.length < 2) {
      trends.push({
        trend_id: randomUUID(),
        dimension,
        pattern,
        direction: 'insufficient_data',
        note: 'Se requiere más de una corrida en el tiempo para calcular una tendencia — esta es la primera corrida registrada para este patrón.',
        based_on_inference_ids: points.map((p) => p.inference_id),
        retrieved_at: new Date().toISOString(),
      });
      continue;
    }

    points.sort((a, b) => new Date(a.retrieved_at) - new Date(b.retrieved_at));
    const first = points[0].frequency;
    const last = points[points.length - 1].frequency;

    let direction = 'stable';
    if (last - first > 0.05) direction = 'up';
    else if (first - last > 0.05) direction = 'down';

    trends.push({
      trend_id: randomUUID(),
      dimension,
      pattern,
      direction,
      previous_frequency: first,
      current_frequency: last,
      based_on_inference_ids: points.map((p) => p.inference_id),
      retrieved_at: new Date().toISOString(),
    });
  }

  return trends;
}
