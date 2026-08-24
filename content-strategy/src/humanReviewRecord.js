// humanReviewRecord.js — Fase 16, §4. El ÚNICO contrato nuevo de esta fase.
//
// Representa la acción humana misma — no un estado, un REGISTRO de que
// alguien identificable tomó una decisión sobre una versión concreta del
// contenido, habiendo visto los resultados de los gates en ese momento.
// approveContentItem()/markReadyToPublish() (contentItem.js) exigen uno de
// estos, real, para avanzar — nunca lo construyen ellos mismos.

import { randomUUID } from 'node:crypto';

export const REVIEW_DECISIONS = Object.freeze(['APPROVE', 'REJECT', 'REQUEST_CHANGES']);

// §13: bypasses conocidos que NUNCA deben aceptarse como reviewer_id — ni
// "el sistema decidió" ni "un proceso automático decidió" cuentan como
// revisión humana, sin importar cómo se llame el proceso.
const FORBIDDEN_REVIEWER_IDS = Object.freeze(['system', 'auto', 'bot', 'automated', 'automatic', '']);

export function createHumanReviewRecord({
  content_item_id,
  content_version,
  reviewer_id,
  decision,
  reviewed_quality_gate,
  reviewed_product_truth_gate,
  notes = null,
}) {
  if (!content_item_id) throw new Error('HumanReviewRecord: "content_item_id" es obligatorio.');
  if (!content_version) throw new Error('HumanReviewRecord: "content_version" es obligatorio — toda revisión pertenece a una versión concreta del contenido (§6).');
  if (typeof reviewer_id !== 'string' || FORBIDDEN_REVIEWER_IDS.includes(reviewer_id.trim().toLowerCase())) {
    throw new Error(`HumanReviewRecord: "reviewer_id" inválido ("${reviewer_id}") — debe identificar a una persona real, nunca "system"/"auto"/vacío ni ningún proceso automático.`);
  }
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error(`HumanReviewRecord: "decision" inválida "${decision}" (válidas: ${REVIEW_DECISIONS.join(', ')})`);
  if (!reviewed_quality_gate) throw new Error('HumanReviewRecord: "reviewed_quality_gate" es obligatorio — debe existir evidencia de que el gate se ejecutó antes de esta decisión.');
  if (!reviewed_product_truth_gate) throw new Error('HumanReviewRecord: "reviewed_product_truth_gate" es obligatorio — misma razón, para el gate de verdad de producto.');

  return Object.freeze({
    review_id: randomUUID(),
    content_item_id,
    content_version,
    reviewer_id,
    reviewed_at: new Date().toISOString(),
    decision,
    // Solo se guarda un RESUMEN del resultado del gate (status/passed +
    // conteo de motivos) — nunca el objeto completo con posibles fragmentos
    // de texto largo, y nunca ningún secreto (aquí no existe ninguno en
    // primer lugar).
    reviewed_quality_gate: { passed: Boolean(reviewed_quality_gate.passed), failures_count: reviewed_quality_gate.failures?.length ?? 0 },
    reviewed_product_truth_gate: { status: reviewed_product_truth_gate.status, reasons_count: reviewed_product_truth_gate.reasons?.length ?? 0 },
    notes,
  });
}
