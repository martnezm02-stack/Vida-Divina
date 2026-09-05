// draftConfirmationRegistry.ts — Vincula cada borrador de Gmail real recién
// creado con la conversación admin que lo pidió y el instante real de su
// creación (INCIDENTE DE SEGURIDAD, 2026-09-04: un envío real ocurrió
// porque adminEnviarBorradorAprobado aceptaba "el último mensaje del
// usuario" sin comprobar que fuera POSTERIOR a este draft y ESPECÍFICO de
// él -- un "Sí, envíalo." de una sesión anterior autorizó el envío de un
// borrador creado después).
//
// Diseño mínimo, sin arquitectura paralela: registro en memoria del propio
// proceso (igual criterio que el resto del estado efímero de este runtime,
// ej. conexión de Baileys) -- un reinicio del bot limpia todo lo pendiente,
// que es la dirección seguro-por-defecto (obliga a reconfirmar, nunca a
// enviar algo viejo). UN solo borrador "en foco" por conversación: crear
// uno nuevo reemplaza cualquier pendiente anterior, así que una
// confirmación real solo puede autorizar el ÚLTIMO borrador pedido en esa
// conversación, nunca uno distinto ni uno de otra conversación/admin.
const pendingByConversation = new Map<number, { draftId: string; createdAtSec: number }>();

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Llamar SIEMPRE justo después de crear un borrador real (createDraft) exitoso. */
export function registerDraftCreated(conversationId: number, draftId: string): void {
  pendingByConversation.set(conversationId, { draftId, createdAtSec: nowSec() });
}

/** El único borrador "en foco" para confirmación de envío en esta conversación, si existe. */
export function getPendingDraft(conversationId: number): { draftId: string; createdAtSec: number } | undefined {
  return pendingByConversation.get(conversationId);
}

/** Llamar tras un envío real exitoso -- ya no hay nada pendiente que confirmar para ese draft. */
export function clearPendingDraft(conversationId: number): void {
  pendingByConversation.delete(conversationId);
}
