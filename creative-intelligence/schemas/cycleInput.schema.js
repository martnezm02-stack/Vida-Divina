// cycleInput.schema.js — Contrato de entrada para un ciclo del Creative
// Intelligence Orchestrator (Fase: Implementar primera etapa del
// Orchestrator, autorizada explícitamente — solo contratos + persistencia,
// NUNCA reglas de negocio).
//
// Este archivo NO reimplementa ninguna regla de Persona/Pain/Angle/Format/
// Andromeda/Evidence Taxonomy — esas viven exclusivamente en
// creative-intelligence/src/. Solo valida la FORMA del paquete de entrada
// que arranca un ciclo, y delega cualquier validación de contenido de
// evidencia a los constructores reales (createDataPoint, createPersona,
// etc.) en la etapa que corresponda — todavía no implementada en esta fase.
//
// CYCLE_EVIDENCE_DOMAINS es una clasificación de NIVEL DE CICLO (qué tipo
// de lote de evidencia se está alimentando), deliberadamente distinta de
// EVIDENCE_DOMAINS en evidenceTaxonomy.js (['COMPETITIVE','OWN_PERFORMANCE',
// 'CUSTOMER_RESEARCH'], el dominio de un DataPoint individual) y de
// PERSONA_EVIDENCE_TYPES en persona.js (['MARKET_EVIDENCE','CUSTOMER_EVIDENCE',
// 'AFFILIATE_EVIDENCE_CONTEXTUAL','UNKNOWN'], la procedencia declarada de
// una Persona ya construida). Los tres vocabularios coexisten a propósito,
// en capas distintas — mismo criterio ya usado en el proyecto para
// vocabularios de confianza paralelos (ver evidenceProvenance.js).

import { randomUUID } from 'node:crypto';

export const CYCLE_OBJECTIVES = Object.freeze([
  'PROCESS_NEW_EVIDENCE',
  'GENERATE_CREATIVE_CELLS',
  'INGEST_PERFORMANCE',
]);

export const CYCLE_EVIDENCE_DOMAINS = Object.freeze([
  'MARKET_EVIDENCE',
  // Agregado en Fase 4A (Customer Evidence Contract): faltaba en esta lista
  // aunque personaStage.js/painStage.js ya lo aceptaban y verificaban desde
  // antes -- sin esta entrada, un evidenceBatch con domain:'CUSTOMER_EVIDENCE'
  // era rechazado aquí mismo, en el primer paso de validación, antes de
  // llegar nunca a esas stages. Distinto de 'MARKET_EVIDENCE' (verbatims
  // públicos sobre la categoría/problema en general, ej. foros de salud) --
  // 'CUSTOMER_EVIDENCE' es evidencia confirmada de clientes/prospectos
  // reales de Vida Divina (reviews, llamadas de venta, tickets de soporte).
  'CUSTOMER_EVIDENCE',
  'COMPETITIVE_EVIDENCE',
  'AFFILIATE_EVIDENCE',
  'OWN_PERFORMANCE_EVIDENCE',
  'BRAND_CONTEXT',
]);

/**
 * Valida la forma de una entrada de evidenceBatch. Deliberadamente
 * superficial: exige que cada record sea un objeto real no vacío — la
 * validación profunda de contenido (verbatimQuote, sourcePlatform,
 * confidence, etc.) es responsabilidad de los constructores reales de
 * src/ cuando la etapa correspondiente consuma cada record, no de este
 * contrato de entrada.
 */
function assertValidEvidenceBatchEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`CycleInput: evidenceBatch[${index}] debe ser un objeto { domain, records }.`);
  }
  if (!CYCLE_EVIDENCE_DOMAINS.includes(entry.domain)) {
    throw new Error(`CycleInput: evidenceBatch[${index}].domain inválido "${entry.domain}" (válidos: ${CYCLE_EVIDENCE_DOMAINS.join(', ')}).`);
  }
  if (!Array.isArray(entry.records) || entry.records.length === 0) {
    throw new Error(`CycleInput: evidenceBatch[${index}].records debe ser un arreglo con al menos 1 elemento real — nunca un dominio declarado sin evidencia real detrás.`);
  }
  entry.records.forEach((record, recordIndex) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`CycleInput: evidenceBatch[${index}].records[${recordIndex}] debe ser un objeto real — estructura incompatible con los contratos de evidencia existentes (evidenceTaxonomy.js/competitiveAbstraction.js/publicEngagement.js).`);
    }
  });
}

/**
 * Construye y valida un CycleInput. Lanza ante cualquier violación —
 * nunca arranca un ciclo con una entrada silenciosamente inválida.
 */
export function createCycleInput({
  cycleId = randomUUID(),
  objective,
  evidenceBatch,
  previousCycleId = null,
  categoryScope = null,
}) {
  assertValidCycleInputShape({ cycleId, objective, evidenceBatch, previousCycleId, categoryScope });

  return Object.freeze({
    cycleId,
    generatedAt: new Date().toISOString(),
    objective,
    evidenceBatch: Object.freeze(evidenceBatch.map((entry) => Object.freeze({ domain: entry.domain, records: Object.freeze([...entry.records]) }))),
    previousCycleId,
    categoryScope: categoryScope ? Object.freeze([...categoryScope]) : null,
  });
}

function assertValidCycleInputShape({ cycleId, objective, evidenceBatch, previousCycleId, categoryScope }) {
  if (!cycleId?.trim?.()) throw new Error('CycleInput: "cycleId" es obligatorio.');
  if (!CYCLE_OBJECTIVES.includes(objective)) {
    throw new Error(`CycleInput: "objective" inválido "${objective}" (válidos: ${CYCLE_OBJECTIVES.join(', ')}).`);
  }
  if (!Array.isArray(evidenceBatch) || evidenceBatch.length === 0) {
    throw new Error('CycleInput: "evidenceBatch" es obligatorio y debe tener al menos 1 entrada real — nunca se arranca un ciclo sin evidencia.');
  }
  evidenceBatch.forEach((entry, index) => assertValidEvidenceBatchEntry(entry, index));
  if (previousCycleId !== null && typeof previousCycleId !== 'string') {
    throw new Error('CycleInput: "previousCycleId" debe ser un string o null.');
  }
  if (categoryScope !== null) {
    if (!Array.isArray(categoryScope) || categoryScope.some((c) => typeof c !== 'string' || !c.trim())) {
      throw new Error('CycleInput: "categoryScope", si se provee, debe ser un arreglo de strings no vacíos.');
    }
  }
}

/** Revalida un CycleInput ya construido — útil para objetos que llegan de disco (cycleStore) sin pasar por createCycleInput(). */
export function validateCycleInput(input) {
  assertValidCycleInputShape({
    cycleId: input?.cycleId,
    objective: input?.objective,
    evidenceBatch: input?.evidenceBatch ? [...input.evidenceBatch] : input?.evidenceBatch,
    previousCycleId: input?.previousCycleId ?? null,
    categoryScope: input?.categoryScope ?? null,
  });
  return true;
}
