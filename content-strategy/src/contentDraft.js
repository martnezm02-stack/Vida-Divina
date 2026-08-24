// contentDraft.js — Contrato ContentDraft (Fase 13, §7) + Control de Calidad
// (§20).
//
// Requiere el ContentItem COMPLETO (no solo su id) para poder verificar en
// tiempo de construcción que el draft realmente responde a lo que el item
// pedía — nunca confía ciegamente en que el llamador hizo bien su parte.

import { randomUUID } from 'node:crypto';
// Fase 14 (§8): los detectores se movieron a textSafetyChecks.js para que
// tanto estos guards (que lanzan) como QualityGate (que solo reporta, nunca
// lanza) compartan exactamente la misma lista — "fortalecer" nunca significó
// duplicar el umbral en dos lugares.
import { detectInventedCertainty, detectCopiedFragment } from './textSafetyChecks.js';

function assertNoInventedCertainty(text, field) {
  const phrase = detectInventedCertainty(text);
  if (phrase) {
    throw new Error(`ContentDraft: "${field}" contiene una afirmación de certeza no verificada ("${phrase}") — nunca se inventan certificaciones, estudios ni resultados garantizados.`);
  }
}

function assertNotCopiedFromExternalExamples(text, externalExampleTexts = []) {
  const fragment = detectCopiedFragment(text, externalExampleTexts);
  if (fragment) {
    throw new Error(`ContentDraft: el contenido reproduce un fragmento literal de una fuente externa ("${fragment}") — PATTERN != COPY (§8/§20-8).`);
  }
}

export function createContentDraft({
  content_item,
  format = content_item?.format,
  platform = content_item?.platform,
  title = null,
  hook,
  body,
  visual_direction = null,
  scene_structure = null,
  caption = null,
  cta = content_item?.cta ?? null,
  claims = content_item?.claims ?? [],
  generation_method,
  externalExampleTexts = [],
}) {
  // §20-1 a §20-5: producto/objetivo/hook/estructura/CTA verificados contra
  // el ContentItem real que originó este draft, nunca asumidos.
  if (!content_item || !content_item.content_item_id) throw new Error('ContentDraft: "content_item" debe ser un ContentItem real ya creado (§20-1/2: producto y objetivo identificados vienen de ahí).');
  if (!content_item.product_ref) throw new Error('ContentDraft: el ContentItem vinculado no tiene product_ref — §20-1 (producto identificado) no se cumple.');
  if (!content_item.objective) throw new Error('ContentDraft: el ContentItem vinculado no tiene objective — §20-2 no se cumple.');
  if (!hook) throw new Error('ContentDraft: "hook" es obligatorio (§20-3).');
  if (!body) throw new Error('ContentDraft: "body" es obligatorio.');
  if (!content_item.structure) throw new Error('ContentDraft: el ContentItem vinculado no declara "structure" — §20-4 no se cumple.');
  if (content_item.cta && !cta) throw new Error('ContentDraft: el ContentItem pide CTA pero el draft no lo incluye (§20-5).');
  if (!generation_method) throw new Error('ContentDraft: "generation_method" es obligatorio (§11/§12: qué generó esto — reglas o LLM — debe quedar trazable).');

  const fullText = [title, hook, body, caption].filter(Boolean).join(' ');
  assertNoInventedCertainty(fullText, 'hook/body/title/caption'); // §20-9/10
  assertNotCopiedFromExternalExamples(fullText, externalExampleTexts); // §20-8

  const source_references = content_item.source_references; // §20-7: mismas referencias que el item, nunca inventadas de nuevo aquí

  return Object.freeze({
    draft_id: randomUUID(),
    content_item_id: content_item.content_item_id,
    format,
    platform,
    title,
    hook,
    body,
    visual_direction,
    scene_structure,
    caption,
    cta,
    claims, // §20-6: claims identificados — heredados del ContentItem, política UNVERIFIED ya aplicada ahí
    source_references,
    generation_method,
    requires_human_review: true, // §20-11, siempre — nunca configurable
    created_at: new Date().toISOString(),
  });
}
