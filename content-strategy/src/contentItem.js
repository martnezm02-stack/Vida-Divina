// contentItem.js — Contrato ContentItem (Fase 13, §6) + FRONTERA HUMANA
// OBLIGATORIA (Fase 14 §16-17, Fase 16 §2-8).
//
// Fase 16, cambio central: approveContentItem()/markReadyToPublish() ya NO
// son "confía en lo que te paso" — RE-EJECUTAN runQualityGate() y
// runProductTruthGate() internamente, sobre el item/draft REALES que se les
// pasan, cada vez que se llaman. El orquestador no puede pasar un resultado
// de gate "bonito" precomputado para saltarse la frontera — no existe tal
// parámetro. Ningún bypass (approve=true, force=true, skip_*=true,
// reviewer_id="system") existe en esta API porque nunca se diseñó ningún
// parámetro de esa forma.
//
// AUTO_PUBLISHED sigue sin existir en ningún enum de este archivo.

import { randomUUID, createHash } from 'node:crypto';
import { runQualityGate } from './qualityGate.js';
import { runProductTruthGate } from './productTruthGate.js';

export const PRODUCTION_STATUSES = Object.freeze(['STRATEGY_ONLY', 'DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'READY_TO_PUBLISH', 'PUBLISHED']);
const MACHINE_CREATABLE_STATUSES = Object.freeze(['STRATEGY_ONLY', 'DRAFT', 'REVIEW_REQUIRED']);

// Máquina de estados explícita (§8). PUBLISHED existe en el enum de arriba
// SOLO para que el contrato esté preparado — ninguna función de este
// archivo produce esa transición todavía (§8: "esta fase NO implementa
// PUBLISHED"). Ninguna fila permite un salto directo a APPROVED/
// READY_TO_PUBLISH/PUBLISHED sin pasar por la función dedicada correcta.
const ALLOWED_TRANSITIONS = Object.freeze({
  STRATEGY_ONLY: ['DRAFT', 'REVIEW_REQUIRED'],
  DRAFT: ['REVIEW_REQUIRED'],
  REVIEW_REQUIRED: ['APPROVED'],
  APPROVED: ['READY_TO_PUBLISH'],
  READY_TO_PUBLISH: [], // PUBLISHED deliberadamente NO incluido todavía
});

export function createContentItem({
  platform,
  format,
  pillar,
  objective,
  hook,
  angle,
  core_message,
  structure,
  cta = null,
  source_references,
  experiment_id = null,
  product_ref,
  claims = [],
  production_status = 'STRATEGY_ONLY',
}) {
  if (!platform) throw new Error('ContentItem: "platform" es obligatorio.');
  if (!format) throw new Error('ContentItem: "format" es obligatorio.');
  if (!pillar) throw new Error('ContentItem: "pillar" es obligatorio.');
  if (!objective) throw new Error('ContentItem: "objective" es obligatorio.');
  if (!hook) throw new Error('ContentItem: "hook" es obligatorio.');
  if (!angle) throw new Error('ContentItem: "angle" es obligatorio.');
  if (!core_message) throw new Error('ContentItem: "core_message" es obligatorio.');
  if (!structure) throw new Error('ContentItem: "structure" es obligatorio.');
  if (!product_ref) throw new Error('ContentItem: "product_ref" es obligatorio — PRIMARY PRODUCT CONTEXT, nunca inventado.');
  if (!Array.isArray(source_references) || source_references.length === 0) {
    throw new Error('ContentItem: "source_references" debe ser un arreglo no vacío — todo item debe poder responder "¿por qué fue creado?".');
  }
  if (!MACHINE_CREATABLE_STATUSES.includes(production_status)) {
    throw new Error(
      `ContentItem: production_status "${production_status}" no puede asignarse al crear un item. ` +
      `Solo ${MACHINE_CREATABLE_STATUSES.join('/')} son estados que el sistema puede producir automáticamente — ` +
      'APPROVED y READY_TO_PUBLISH requieren approveContentItem()/markReadyToPublish() (acción humana explícita, Fase 16). ' +
      'AUTO_PUBLISHED no existe en este sistema.'
    );
  }

  return Object.freeze({
    content_item_id: randomUUID(),
    platform,
    format,
    pillar,
    objective,
    hook,
    angle,
    core_message,
    structure,
    cta,
    source_references,
    experiment_id,
    product_ref,
    claims,
    production_status,
    content_version: null, // se estampa recién al aprobar (§6) — antes de eso no hay nada que versionar todavía
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}

/**
 * §6: versión determinista del CONTENIDO (item + draft) — no un contador ni
 * un timestamp, para que cualquiera pueda recomputarla de forma
 * independiente y compararla. Si CUALQUIER campo relevante cambia, el hash
 * cambia, y toda aprobación previa referida a la versión anterior queda
 * automáticamente invalidada (nunca se compara "casi igual", se compara
 * exacto).
 */
export function computeContentVersion({ item, draft }) {
  const stable = {
    item: { hook: item.hook, angle: item.angle, format: item.format, pillar: item.pillar, objective: item.objective, core_message: item.core_message, structure: item.structure, cta: item.cta, product_ref: item.product_ref, claims: item.claims },
    draft: { hook: draft.hook, body: draft.body, scene_structure: draft.scene_structure, caption: draft.caption, cta: draft.cta, claims: draft.claims },
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

/** Transición SIN gate humano (§8: permitida sin calificador especial) — pero sigue validada por la máquina de estados. */
export function markReviewRequired(item) {
  assertTransitionAllowed(item.production_status, 'REVIEW_REQUIRED');
  return Object.freeze({ ...item, production_status: 'REVIEW_REQUIRED' });
}

function assertTransitionAllowed(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`ContentItem: transición ilegal "${from}" → "${to}" — transiciones permitidas desde "${from}": ${allowed.length ? allowed.join(', ') : 'ninguna'}.`);
  }
}

/**
 * §3/§5: ÚNICA forma de pasar a APPROVED. Exige un HumanReviewRecord real
 * (creado por humanReviewRecord.js — este archivo nunca construye uno por
 * su cuenta) y RE-EJECUTA ambos gates sobre el item/draft actuales — nunca
 * confía en un resultado precomputado que el llamador podría falsificar.
 * No existe ningún parámetro "force"/"skip_*"/"approve" — no hay atajo.
 */
export function approveContentItem({ item, draft, humanReview, externalExampleTexts = [] }) {
  assertTransitionAllowed(item.production_status, 'APPROVED');

  if (!humanReview) throw new Error('approveContentItem: se requiere un HumanReviewRecord real — no existe aprobación sin una revisión humana registrada.');
  if (humanReview.decision !== 'APPROVE') throw new Error(`approveContentItem: el HumanReviewRecord tiene decision="${humanReview.decision}", no "APPROVE" — no se puede aprobar.`);
  if (humanReview.content_item_id !== item.content_item_id) throw new Error('approveContentItem: el HumanReviewRecord pertenece a otro ContentItem.');

  const currentVersion = computeContentVersion({ item, draft });
  if (humanReview.content_version !== currentVersion) {
    throw new Error('approveContentItem: la revisión humana corresponde a una VERSIÓN DISTINTA del contenido — el item/draft cambiaron después de la revisión, la aprobación queda invalidada (§6). Se requiere una nueva revisión sobre la versión actual.');
  }

  const qualityResult = runQualityGate({ item, draft, externalExampleTexts });
  if (!qualityResult.passed) {
    throw new Error(`approveContentItem: QualityGate falla sobre la versión actual — no se puede aprobar. Motivos: ${qualityResult.failures.join('; ')}`);
  }

  const truthResult = runProductTruthGate({ item, draft });
  if (truthResult.status === 'BLOCKED') {
    throw new Error(`approveContentItem: ProductTruthGate está BLOCKED sobre la versión actual — nunca aprobable automáticamente ni manualmente sin corregir el contenido. Motivos: ${truthResult.reasons.join('; ')}`);
  }
  // truthResult.status === 'REVIEW_REQUIRED' es exactamente el caso que esta
  // función existe para resolver — un humano ya lo vio (humanReview) y
  // decidió APPROVE de todas formas. PASS también continúa.

  return Object.freeze({ ...item, production_status: 'APPROVED', content_version: currentVersion, review_id: humanReview.review_id, approved_by: humanReview.reviewer_id, approved_at: new Date().toISOString() });
}

/**
 * §7: markReadyToPublish — repite TODAS las verificaciones (nunca confía en
 * que approveContentItem ya las hizo hace un momento; el contenido podría
 * haber cambiado entre ambas llamadas).
 */
export function markReadyToPublish({ item, draft, humanReview, externalExampleTexts = [] }) {
  assertTransitionAllowed(item.production_status, 'READY_TO_PUBLISH'); // 1) está APPROVED

  if (!humanReview || humanReview.decision !== 'APPROVE') throw new Error('markReadyToPublish: se requiere un HumanReviewRecord real con decision="APPROVE" (§7-2).'); // 2)
  if (typeof humanReview.reviewer_id !== 'string' || !humanReview.reviewer_id.trim()) throw new Error('markReadyToPublish: el HumanReviewRecord no tiene un reviewer_id válido (§7-3).'); // 3)
  if (!humanReview.reviewed_quality_gate || !humanReview.reviewed_product_truth_gate) throw new Error('markReadyToPublish: no hay evidencia de que los gates fueron ejecutados en la revisión (§7-4).'); // 4)

  const currentVersion = computeContentVersion({ item, draft });
  if (item.content_version !== currentVersion || humanReview.content_version !== currentVersion) {
    throw new Error('markReadyToPublish: el contenido cambió después de la aprobación — la versión actual no coincide (§7-5). Transición rechazada.'); // 5)
  }

  const truthResult = runProductTruthGate({ item, draft });
  if (truthResult.status === 'BLOCKED') throw new Error(`markReadyToPublish: ProductTruthGate BLOCKED (§7-6/7). Motivos: ${truthResult.reasons.join('; ')}`); // 6/7

  const qualityResult = runQualityGate({ item, draft, externalExampleTexts });
  if (!qualityResult.passed) throw new Error(`markReadyToPublish: QualityGate falla — puede incluir contenido copiado (§7-8). Motivos: ${qualityResult.failures.join('; ')}`); // 8, incluye anti-copy

  // 9) la máquina de estados ya rechazó cualquier transición ilegal en el paso 1.

  return Object.freeze({ ...item, production_status: 'READY_TO_PUBLISH', ready_at: new Date().toISOString() });
}
