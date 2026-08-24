// mockPerformanceSource.js — Fase 17, §8-9. NO crea un nuevo contrato de
// observación: reutiliza createPerformanceObservation tal cual existe desde
// la Fase 12 (performance-learning-intelligence). "published_content_id"/
// "captured_at" del enunciado conceptual del encargo corresponden EXACTAMENTE
// a los campos "content_id"/"observed_at" que ese contrato ya usa — auditado
// antes de escribir código (§1), no se duplican con nombres nuevos.
//
// MockPerformanceSource EXTIENDE PerformanceSource (performance-learning-
// intelligence, sin modificarla) — es un motor más detrás de la misma
// interfaz que ManualPerformanceSource ya usa, nunca un sistema paralelo.

import { PerformanceSource } from '../../performance-learning-intelligence/src/performanceSource.js';
import { createPerformanceObservation } from '../../performance-learning-intelligence/src/performanceObservation.js';

/**
 * Contrato #3 (de los ≤3 permitidos): un motor de prueba que entrega
 * métricas FIJAS, explícitamente sintéticas — nunca simula tráfico real, ni
 * llama a ninguna API. `fixtureMetrics` se pasa en el constructor, siempre
 * a cargo del llamador — este archivo nunca inventa un número por su cuenta.
 */
export class MockPerformanceSource extends PerformanceSource {
  constructor(fixtureMetrics = {}) {
    super();
    this._fixtureMetrics = fixtureMetrics;
  }

  get name() {
    return 'mock_performance_source';
  }

  async fetch() {
    return this._fixtureMetrics;
  }
}

/**
 * Convierte las métricas fijas del mock en PerformanceObservation reales
 * (createPerformanceObservation sin modificar), una por métrica, ancladas al
 * content_id REAL de un PublishedContent ya persistido — nunca a un id
 * inventado. source SIEMPRE "synthetic_fixture" — nunca se mezcla con
 * "platform_observed".
 */
export async function collectMockPerformanceObservations({ publishedContent, source, observedAt = new Date().toISOString() }) {
  const metrics = await source.fetch();
  const observations = [];
  for (const [metric, value] of Object.entries(metrics)) {
    observations.push(createPerformanceObservation({
      content_id: publishedContent.content_id,
      platform: publishedContent.platform,
      metric,
      value,
      observed_at: observedAt,
      confidence: 0.5,
      confidence_basis: `Dato de ${source.name} — fixture sintético fijo, nunca una métrica real de plataforma.`,
      source: 'synthetic_fixture',
    }));
  }
  return observations;
}
