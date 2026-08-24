// contentExperiment.js — Contrato ContentExperiment (Fase 13, §4).
//
// UNA variable principal por experimento — enforzado estructuralmente
// (variable es un único string, nunca un arreglo) y explícitamente
// (control y variant deben ser distintos entre sí; no se permite declarar
// más de un cambio a la vez agregando campos extra de comparación).

import { randomUUID } from 'node:crypto';
// Reutiliza el vocabulario YA existente de Performance & Learning
// Intelligence — no se duplica un segundo enum de "señal esperada".
import { SIGNAL_TYPES } from '../../performance-learning-intelligence/src/performanceSignal.js';

const STATUSES = Object.freeze(['PROPOSED', 'RUNNING', 'COMPLETED']);

export function createContentExperiment({
  variable,
  control,
  variant,
  success_metric,
  baseline_reference = null,
  hypothesis_reference = null,
  expected_signal,
  sample_requirement = null,
  status = 'PROPOSED',
}) {
  if (!variable || typeof variable !== 'string') throw new Error('ContentExperiment: "variable" es obligatorio y debe ser un único string — un experimento prueba UNA variable, nunca varias a la vez.');
  if (!control) throw new Error('ContentExperiment: "control" es obligatorio.');
  if (!variant) throw new Error('ContentExperiment: "variant" es obligatorio.');
  if (control === variant) throw new Error('ContentExperiment: "control" y "variant" deben ser distintos — de lo contrario no hay nada que experimentar.');
  if (!success_metric) throw new Error('ContentExperiment: "success_metric" es obligatorio.');
  if (!SIGNAL_TYPES.includes(expected_signal)) throw new Error(`ContentExperiment: "expected_signal" inválido "${expected_signal}" (válidos: ${SIGNAL_TYPES.join(', ')})`);
  if (!STATUSES.includes(status)) throw new Error(`ContentExperiment: "status" inválido "${status}" (válidos: ${STATUSES.join(', ')})`);

  return Object.freeze({
    experiment_id: randomUUID(),
    variable,
    control,
    variant,
    success_metric,
    baseline_reference,
    hypothesis_reference,
    expected_signal,
    sample_requirement,
    status,
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}

export { STATUSES as EXPERIMENT_STATUSES };
