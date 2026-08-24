// pain.js — Pillar 2: Pain Points per Persona.
// Prompt 3 (Pain Point Extractor) + Prompt 4 (Pain Pressure Test).
//
// FRAMEWORK ORIGINAL, principio central: PAIN ≠ ANGLE. Pain = raw
// emotional trigger / emotional reality. Angle = narrative interpretation
// construida sobre el pain (ver angle.js). Un Pain nunca lleva campos de
// script direction ni awareness — esos viven exclusivamente en Angle,
// separación estructural, no solo documental.
//
// Regla no negociable: un Pain SIN verbatimQuote y sourcePlatform no es un
// Pain real — es una suposición. createPain() lo rechaza siempre.
//
// Nota de alcance: si el painPoint "suena a headline/positioning/marketing
// pulido" el framework pide re-extraer (Prompt 3) — es un juicio editorial
// humano, no algo que este módulo pueda decidir automáticamente; no se
// implementa un heurístico que finja resolverlo.

import { randomUUID } from 'node:crypto';

const HIGH_FREQUENCY_THRESHOLD = 3; // Prompt 3: "3+ apariciones → HIGH-FREQUENCY ANCHOR" — cifra dada por el framework, no inventada aquí.

export function createPain({
  personaId,
  painPoint,
  plainCustomerLanguage,
  verbatimQuote,
  sourcePlatform,
  frequency = 1,
  cluster = null,
  confidence = 'UNKNOWN',
}) {
  if (!personaId) throw new Error('Pain: "personaId" es obligatorio — un Pain siempre pertenece a una Persona.');
  if (!painPoint?.trim()) throw new Error('Pain: "painPoint" es obligatorio.');
  if (!verbatimQuote?.trim()) throw new Error('Pain: "verbatimQuote" es obligatorio — un pain requiere evidencia real, nunca se infiere sin cita (Prompt 3).');
  if (!sourcePlatform?.trim()) throw new Error('Pain: "sourcePlatform" es obligatorio — todo pain debe citar su fuente (Prompt 3).');
  if (typeof frequency !== 'number' || frequency < 1) throw new Error('Pain: "frequency" debe ser un número ≥ 1.');

  return Object.freeze({
    painId: randomUUID(),
    personaId,
    painPoint,
    plainCustomerLanguage: plainCustomerLanguage ?? null,
    verbatimQuote,
    sourcePlatform,
    frequency,
    highFrequencyAnchor: frequency >= HIGH_FREQUENCY_THRESHOLD,
    cluster,
    confidence,
    createdAt: new Date().toISOString(),
  });
}

export function validatePain(pain) {
  createPain(pain);
  return true;
}

/**
 * Prompt 4 — Pain Pressure Test: distingue root pain de surface symptom.
 * No decide automáticamente cuál es la raíz — estructura la comparación
 * para que un analista/humano complete el juicio, mismo criterio que
 * evaluateSubPersonaSplit en persona.js.
 */
export function comparePainDepth({ surfaceSymptom, rootPain }) {
  if (!surfaceSymptom?.trim() || !rootPain?.trim()) {
    throw new Error('comparePainDepth: se requieren "surfaceSymptom" y "rootPain" reales para comparar — nunca se asume cuál es la raíz sin ambos.');
  }
  return Object.freeze({ surfaceSymptom, rootPain, isSameText: surfaceSymptom.trim() === rootPain.trim() });
}

/**
 * Agrupa pains ya creados que comparten cluster — no clasifica, solo
 * organiza los que ya vienen etiquetados con el mismo cluster (Prompt 4:
 * "detectar clusters" es trabajo de research/análisis, no de este módulo).
 */
export function groupByCluster(pains) {
  const map = new Map();
  for (const pain of pains) {
    const key = pain.cluster ?? 'UNCLUSTERED';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(pain);
  }
  return map;
}
