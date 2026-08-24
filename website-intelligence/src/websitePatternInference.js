// websitePatternInference.js — Etapa B: Inferencia agregada sobre N
// WebsitePatternObservation de sitios de referencia distintos.
//
// DECISIÓN DE DISEÑO: esta función es, deliberadamente, una copia mínima e
// independiente de la misma idea ya implementada en
// marketing-intelligence/src/pipeline/inference.js — no se importa desde
// allí. Ambos módulos deben poder evolucionar y reemplazarse por separado
// (principio de la Fase 6: ningún módulo depende permanentemente de otro);
// duplicar 20 líneas de una función pura y genérica es más barato que acoplar
// dos sistemas que deben seguir siendo independientemente reemplazables.
//
// Nunca se genera una inferencia sin declarar su alcance (scope) — cuántos
// sitios de referencia la sustentan.

import { randomUUID } from 'node:crypto';

export function aggregateWebsitePatternInferences(observations, { scopeLabel } = {}) {
  const total = observations.length;
  if (total === 0) return [];

  const groups = new Map();
  for (const obs of observations) {
    const key = `${obs.dimension}::${obs.value}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(obs.observation_id);
  }

  const inferences = [];
  for (const [key, observationIds] of groups) {
    const [dimension, pattern] = key.split('::');
    inferences.push({
      inference_id: randomUUID(),
      dimension,
      pattern,
      basis: 'INFERENCIA',
      scope: scopeLabel ?? `N=${total} observaciones de la corrida actual`,
      frequency: Number((observationIds.length / total).toFixed(2)),
      based_on_observation_ids: observationIds,
      retrieved_at: new Date().toISOString(),
    });
  }
  return inferences;
}
