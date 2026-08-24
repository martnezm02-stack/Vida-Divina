// evidenceModel.js — Fase 5 (Evidence Model) + Fase 4 (Attribution Types).
// Clasificación PURAMENTE determinista a partir de campos estructurados de
// evidencia — NUNCA por proximidad temporal (evidence.timestamp/window solo
// acota candidatos aguas arriba, en attributionWindow.js; esta función ni
// siquiera recibe timestamps). NUNCA usa caption/filename/asset name.
//
// Estado real de este proyecto (auditado en Fase 1 de este mismo encargo):
// ningún mecanismo existente (webhookParser.js, crm/migrations) captura
// UTM/referral/tracking id — por lo tanto hoy DIRECT/ASSISTED/INDIRECT no
// tendrán evidencia real que los active; el resultado correcto y esperado
// es UNKNOWN. Esta función se diseña y prueba igual para cuando esa
// evidencia exista, sin inventar nada mientras tanto.

export const ATTRIBUTION_TYPES = Object.freeze(['DIRECT', 'INDIRECT', 'ASSISTED', 'UNKNOWN']);

// Campos de evidencia reconocidos (Fase 5). "productMatch" es la única
// señal que SÍ puede derivarse hoy con datos reales (opportunity.productoId
// vs PublishedContent.product_ref) — el resto exige captura que no existe
// todavía en whatsapp-adapter/crm.
export const EVIDENCE_FIELDS = Object.freeze([
  'publicationId', 'externalPublicationId', 'conversationId', 'leadId',
  'campaignId', 'trackingId', 'ctaId', 'utm', 'explicitEvent', 'productMatch',
]);

const DIRECT_FIELDS = Object.freeze(['trackingId', 'ctaId', 'utm', 'explicitEvent']);

/**
 * @param {Partial<Record<typeof EVIDENCE_FIELDS[number], any>>} evidence
 * @returns {'DIRECT'|'INDIRECT'|'ASSISTED'|'UNKNOWN'}
 */
export function classifyAttributionType(evidence) {
  if (!evidence) return 'UNKNOWN';
  // DIRECT: un identificador de tracking/CTA/UTM o un evento explícito del
  // motor comercial nombra ESTA publicación concretamente -- evidencia de
  // origen, no de coincidencia.
  if (DIRECT_FIELDS.some((f) => evidence[f])) return 'DIRECT';
  // ASSISTED: comparten campaignId -- la publicación formó parte de la
  // misma campaña que produjo el evento comercial, pero no hay un
  // identificador de click-through exacto.
  if (evidence.campaignId) return 'ASSISTED';
  // INDIRECT: única señal estructural débil disponible hoy -- el producto
  // de la oportunidad coincide con el product_ref de la publicación.
  if (evidence.productMatch) return 'INDIRECT';
  // Ninguna señal estructural -- incluso si el evento cayó dentro de la
  // ventana de atribución, la sola proximidad temporal NUNCA basta.
  return 'UNKNOWN';
}

/** Arma un objeto de evidencia solo con los campos reconocidos -- nunca deja pasar un campo inventado (ej. "caption"). */
export function buildEvidence(fields = {}) {
  const evidence = {};
  for (const key of EVIDENCE_FIELDS) {
    if (fields[key] !== undefined && fields[key] !== null) evidence[key] = fields[key];
  }
  return evidence;
}
