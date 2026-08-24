// inference.js — Etapa B del pipeline: Inferencia agregada sobre N observaciones.
//
// Nunca se genera una inferencia sin declarar su "scope" (cuántos registros la
// sustentan) — una inferencia sin alcance declarado es indistinguible de una
// opinión suelta, y eso es exactamente lo que este diseño prohíbe. Ejemplo del
// documento de arquitectura: "Las aperturas interrogativas aparecen con
// frecuencia en esta categoría" (INFERENCIA), nunca "las preguntas funcionan"
// como afirmación sin base.

import { randomUUID } from 'node:crypto';

export function aggregateInferences(observations, { scopeLabel } = {}) {
  const total = observations.length;
  if (total === 0) return [];

  const groups = new Map(); // `${dimension}::${value}` -> observation_ids[]
  for (const obs of observations) {
    const key = `${obs.dimension}::${obs.value}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(obs.observation_id);
  }

  const inferences = [];
  for (const [key, observationIds] of groups) {
    const [dimension, value] = key.split('::');
    inferences.push({
      inference_id: randomUUID(),
      dimension,
      pattern: value,
      basis: 'INFERENCIA',
      scope: scopeLabel ?? `N=${total} observaciones de la corrida actual`,
      frequency: Number((observationIds.length / total).toFixed(2)),
      based_on_observation_ids: observationIds,
      retrieved_at: new Date().toISOString(),
    });
  }
  return inferences;
}
