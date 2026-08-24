// publicationService.js — Fase 17, §5-7. Orquesta la publicación
// consumiendo EXCLUSIVAMENTE módulos ya existentes, sin modificarlos:
// computeContentVersion/runQualityGate/runProductTruthGate (content-strategy,
// re-ejecutados frescos, nunca se confía en un resultado precomputado) y
// createPublishedContent (performance-learning-intelligence, reutilizado
// TAL CUAL). PublishedContent no tiene un campo nativo para content_item_id
// — se usa su campo "metadata" (genérico, ya existente) para la
// trazabilidad hacia content-strategy, sin necesitar modificar ese
// contrato (incompatibilidad evaluada y resuelta sin tocar el archivo, §7).
//
// No existe NINGÚN parámetro force/skip_review/skip_quality_gate/
// skip_product_truth/approved en esta función — no hay dónde conectar un
// bypass porque nunca se diseñó ese parámetro.
//
// Fase 19 — EXTENSIÓN MÍNIMA NECESARIA: el context que se pasa a
// backend.publish() ahora incluye también "humanReview" (antes solo
// "draft"). Un adapter real (ej. InstagramPublicationAdapter) debe poder
// re-verificar el HumanReviewRecord de forma independiente, con la misma
// defensa en profundidad que este archivo ya aplica — no puede confiar en
// que publishReadyContentItem ya lo validó, por la misma razón por la que
// esta función tampoco confía en approveContentItem. Cambio 100%
// retrocompatible: MockPublicationBackend.publish(contentItem) ignora el
// segundo parámetro por completo, así que Fase 17 sigue intacta.

import { computeContentVersion } from './contentItem.js';
import { runQualityGate } from './qualityGate.js';
import { runProductTruthGate } from './productTruthGate.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';

const FORBIDDEN_REVIEWER_IDS = Object.freeze(['system', 'auto', 'bot', 'automated', 'automatic', '']);

/** §6: idempotencia — busca una publicación YA existente para la misma clave (content_item_id + content_version + platform). */
export function findExistingPublication(store, { content_item_id, content_version, platform }) {
  return store.loadAll('published_content').find(
    (r) => r.metadata?.content_item_id === content_item_id && r.metadata?.content_version === content_version && r.platform === platform
  ) ?? null;
}

/**
 * §5: las 10 validaciones, en orden, TODAS re-verificadas contra el
 * item/draft REALES que se pasan — nunca contra flags del llamador.
 */
export async function publishReadyContentItem({ item, draft, humanReview, backend, store, topic = null }) {
  // 1) contentItem existe
  if (!item) throw new Error('publishReadyContentItem: "item" es obligatorio.');
  // 2) status === READY_TO_PUBLISH (nunca DRAFT/REVIEW_REQUIRED/APPROVED)
  if (item.production_status !== 'READY_TO_PUBLISH') {
    throw new Error(`publishReadyContentItem: solo se puede publicar un ContentItem en READY_TO_PUBLISH (estado actual: "${item.production_status}").`);
  }
  // 3) HumanReviewRecord existe
  if (!humanReview) throw new Error('publishReadyContentItem: se requiere un HumanReviewRecord real — no existe publicación sin revisión humana.');
  if (humanReview.decision !== 'APPROVE') throw new Error(`publishReadyContentItem: el HumanReviewRecord tiene decision="${humanReview.decision}", no "APPROVE".`);
  if (humanReview.content_item_id !== item.content_item_id) throw new Error('publishReadyContentItem: el HumanReviewRecord pertenece a otro ContentItem.');
  // 4) reviewer_id no es system/auto (defensa en profundidad — humanReviewRecord.js ya lo exige al construirse)
  if (typeof humanReview.reviewer_id !== 'string' || FORBIDDEN_REVIEWER_IDS.includes(humanReview.reviewer_id.trim().toLowerCase())) {
    throw new Error('publishReadyContentItem: reviewer_id inválido — no es una persona real identificable.');
  }
  // 5) HumanReviewRecord corresponde a la versión ACTUAL del contenido
  const currentVersion = computeContentVersion({ item, draft });
  if (humanReview.content_version !== currentVersion || item.content_version !== currentVersion) {
    throw new Error('publishReadyContentItem: la versión revisada no coincide con la versión actual del contenido — publicación rechazada.');
  }
  // 6) ProductTruthGate fue ejecutado — se RE-EJECUTA fresco, nunca se confía en el resumen guardado en humanReview
  const truthResult = runProductTruthGate({ item, draft });
  if (truthResult.status === 'BLOCKED') {
    throw new Error(`publishReadyContentItem: ProductTruthGate BLOCKED sobre la versión actual — nunca publicable. Motivos: ${truthResult.reasons.join('; ')}`);
  }
  // 7) QualityGate fue ejecutado — mismo criterio, fresco
  const qualityResult = runQualityGate({ item, draft });
  if (!qualityResult.passed) {
    throw new Error(`publishReadyContentItem: QualityGate falla sobre la versión actual — nunca publicable. Motivos: ${qualityResult.failures.join('; ')}`);
  }
  // 8) no expirado/invalidado — ya cubierto por el chequeo de versión (5): una versión distinta ES la forma en que este sistema representa "invalidado"
  // 9) estructura válida
  if (!draft.hook || !draft.body) throw new Error('publishReadyContentItem: el draft no tiene estructura válida (falta hook/body).');
  // 10) no transición ilegal — ya cubierto por el chequeo de estado (2)

  const idempotencyKey = { content_item_id: item.content_item_id, content_version: currentVersion, platform: item.platform };
  const existing = findExistingPublication(store, idempotencyKey);
  if (existing) {
    return { status: 'ALREADY_PUBLISHED', publishedContent: existing, publicationResult: null };
  }

  const publicationResult = await backend.publish(item, { draft, humanReview });

  const publishedContent = createPublishedContent({
    platform: item.platform,
    published_at: publicationResult.published_at,
    content_type: 'social_post',
    format: item.format,
    topic: topic ?? item.objective.slice(0, 80),
    product_ref: item.product_ref,
    hook_pattern_ref: item.hook,
    content_opportunity_ref: item.source_references.find((r) => r.source_module === 'viral_content_intelligence')?.reference_id ?? null,
    content_brief_ref: null,
    external_post_id: publicationResult.external_content_id,
    metadata: {
      content_item_id: item.content_item_id,
      content_draft_id: draft.draft_id,
      content_version: currentVersion,
      review_id: humanReview.review_id,
      publication_id: publicationResult.publication_id,
      publication_mode: publicationResult.publication_mode,
      source_references: item.source_references,
    },
  });
  store.save('published_content', publishedContent);

  return { status: 'PUBLISHED', publishedContent, publicationResult };
}
