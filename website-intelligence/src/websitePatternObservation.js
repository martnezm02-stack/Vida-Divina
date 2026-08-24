// websitePatternObservation.js — Contrato de WebsitePatternObservation (Fase 7).
//
// Misma filosofía de 3 etapas que marketing-intelligence (OBSERVADO nunca se
// promueve solo a sí mismo a hecho): esta función solo construye la Etapa A
// (Observación). Ver websitePatternInference.js / websitePatternHypothesis.js
// para las etapas B/C.
//
// Toda observación DEBE responder: qué (dimension+value), dónde (url,
// page_id), en qué estado (page_state/viewport), y qué evidencia concreta la
// respalda (evidence.method + evidence.detail) — nunca se acepta una
// observación sin evidencia, y evidence.detail nunca es una copia extensa de
// contenido de terceros, solo el hecho mínimo verificable.

import { randomUUID } from 'node:crypto';
import { isValidDimension, VIEWPORTS, EVIDENCE_METHODS } from './taxonomy.js';

const FORBIDDEN_KEYS = ['recommended_value', 'adopted_value', 'should_adopt', 'vida_divina_value'];

function assertNoAdoptionLeakage(obj, path = '') {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      throw new Error(
        `WebsitePatternObservation: el campo "${path}${key}" sugiere adopción automática de un valor externo — ` +
        'observar un patrón NUNCA significa recomendar que Vida Divina lo use. Esa es una decisión de negocio independiente.'
      );
    }
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      assertNoAdoptionLeakage(obj[key], `${path}${key}.`);
    }
  }
}

export function createWebsitePatternObservation(fields) {
  const {
    url,
    page_id,
    viewport = null,
    page_state = 'default',
    dimension,
    value,
    evidence,
    confidence,
    confidence_basis,
    raw_id = null, // referencia al futuro RawStore de Website Intelligence — no implementado en esta fase
    interaction = null, // solo para INTERACTION_PATTERN — ver más abajo
    responsive = null, // solo para RESPONSIVE_PATTERN
    token = null, // solo para DESIGN_TOKEN
    conversion_flow = null, // solo para CONVERSION_FLOW
    content_flags = [],
  } = fields;

  if (!url) throw new Error('WebsitePatternObservation: "url" es obligatorio (¿dónde se observó?)');
  if (!page_id) throw new Error('WebsitePatternObservation: "page_id" es obligatorio (¿en qué página?)');
  if (!isValidDimension(dimension)) throw new Error(`WebsitePatternObservation: dimensión inválida "${dimension}"`);
  if (!value) throw new Error('WebsitePatternObservation: "value" es obligatorio (¿qué se observó?)');
  if (viewport !== null && !VIEWPORTS.includes(viewport)) throw new Error(`WebsitePatternObservation: viewport inválido "${viewport}"`);

  if (!evidence || typeof evidence !== 'object') {
    throw new Error('WebsitePatternObservation: "evidence" es obligatorio — no se permite ninguna observación sin evidencia.');
  }
  if (!EVIDENCE_METHODS.includes(evidence.method)) {
    throw new Error(`WebsitePatternObservation: evidence.method inválido "${evidence.method}"`);
  }
  if (!evidence.detail || typeof evidence.detail !== 'string' || evidence.detail.trim().length === 0) {
    throw new Error('WebsitePatternObservation: evidence.detail es obligatorio y no puede estar vacío.');
  }

  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new Error('WebsitePatternObservation: "confidence" debe ser un número entre 0 y 1.');
  }
  if (!confidence_basis) {
    throw new Error('WebsitePatternObservation: "confidence_basis" es obligatorio.');
  }

  if (dimension === 'INTERACTION_PATTERN' && !interaction) {
    throw new Error('WebsitePatternObservation: INTERACTION_PATTERN requiere el campo "interaction" (estado A → estado B).');
  }
  if (dimension === 'RESPONSIVE_PATTERN' && !responsive) {
    throw new Error('WebsitePatternObservation: RESPONSIVE_PATTERN requiere el campo "responsive".');
  }
  if (dimension === 'DESIGN_TOKEN' && !token) {
    throw new Error('WebsitePatternObservation: DESIGN_TOKEN requiere el campo "token".');
  }
  if (dimension === 'CONVERSION_FLOW' && !conversion_flow) {
    throw new Error('WebsitePatternObservation: CONVERSION_FLOW requiere el campo "conversion_flow".');
  }

  const observation = {
    observation_id: randomUUID(),
    raw_id,
    url,
    page_id,
    viewport,
    page_state,
    dimension,
    value,
    basis: 'OBSERVADO',
    evidence: { method: evidence.method, detail: evidence.detail },
    confidence,
    confidence_basis,
    // Igual que en marketing-intelligence: toda observación de una fuente
    // externa queda sujeta a revisión humana antes de influir en cualquier
    // decisión de diseño real de Vida Divina.
    requires_human_review: true,
    content_flags,
    retrieved_at: new Date().toISOString(),
  };

  if (interaction) observation.interaction = interaction;
  if (responsive) observation.responsive = responsive;
  if (token) observation.token = token;
  if (conversion_flow) observation.conversion_flow = conversion_flow;

  // Guardia estructural (§7 del encargo): esta forma de objeto NUNCA puede
  // contener un campo que sugiera "adoptar" el valor observado — se verifica
  // en tiempo de construcción, no solo por convención de nombres en docs.
  assertNoAdoptionLeakage(observation);

  return Object.freeze(observation);
}
