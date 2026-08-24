// contentPlan.js — Contrato ContentPlan (Fase 13, §5).
//
// Tope estructural de 10 content_items — evita calendarios gigantes por
// construcción, no solo por convención del script que lo llama.

import { randomUUID } from 'node:crypto';

const MAX_CONTENT_ITEMS = 10;

export function createContentPlan({
  product_ref,
  objective,
  audience_ref = null,
  content_pillars,
  experiments = [],
  content_items,
  cadence = null,
  source_references,
}) {
  if (!product_ref) throw new Error('ContentPlan: "product_ref" es obligatorio.');
  if (!objective) throw new Error('ContentPlan: "objective" es obligatorio.');
  if (!Array.isArray(content_pillars) || content_pillars.length === 0) throw new Error('ContentPlan: "content_pillars" debe ser un arreglo no vacío.');
  if (!Array.isArray(content_items) || content_items.length === 0) throw new Error('ContentPlan: "content_items" debe ser un arreglo no vacío (ids de ContentItem ya creados).');
  if (content_items.length > MAX_CONTENT_ITEMS) throw new Error(`ContentPlan: máximo ${MAX_CONTENT_ITEMS} content_items por plan — no se construyen calendarios gigantes en este MVP.`);
  if (!Array.isArray(source_references) || source_references.length === 0) throw new Error('ContentPlan: "source_references" debe ser un arreglo no vacío — todo plan debe ser trazable a inteligencia real.');

  return Object.freeze({
    plan_id: randomUUID(),
    product_ref,
    objective,
    audience_ref,
    content_pillars,
    experiments,
    content_items,
    cadence,
    source_references,
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}

export { MAX_CONTENT_ITEMS };
