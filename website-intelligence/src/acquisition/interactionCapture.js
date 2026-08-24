// interactionCapture.js — Concepto de InteractionCapture (Fase 8).
//
// Representa el HECHO crudo de "se disparó una acción sobre una página y se
// observó un cambio de estado" — es la materia prima de la que
// WebsitePatternObservation.interaction (Fase 7) extrae un patrón. Este
// archivo NO ejecuta ninguna interacción real (no hay browser conectado en
// este entorno — ver informe §1) — valida y da forma al REGISTRO de una
// interacción, para que un futuro backend con capabilities.capturesInteractions
// = true pueda producir datos que ya calzan en el contrato.
//
// División de responsabilidad (obligatoria, no debe difuminarse):
//   - El BACKEND decide CÓMO disparar la acción (click, scroll, hover) y
//     CÓMO capturar el estado resultante (DOM, screenshot, computed style).
//     Eso es un detalle de implementación de cada backend.
//   - Website Intelligence (este archivo) solo define QUÉ forma debe tener
//     ese resultado para ser aceptado: un trigger, un estado antes y un
//     estado después, cada uno respaldado por evidencia — nunca decide cómo
//     se obtuvo esa evidencia.
//
// state_before/state_after pueden ser: { raw_id } (si cada estado se
// persistió como su propio WebsiteRawRecord) o { detail } (una descripción
// puntual, cuando no se justifica un raw_id completo por estado, ej. "el
// menú pasa de colapsado a expandido" sin volcar el HTML completo dos veces).
// Al menos uno de los dos debe estar presente en cada estado.

const VALID_TRIGGERS = Object.freeze(['click', 'hover', 'scroll', 'focus', 'submit', 'resize']);

function assertState(state, label) {
  if (!state || typeof state !== 'object') {
    throw new Error(`InteractionCapture: "${label}" es obligatorio y debe ser un objeto ({ raw_id } y/o { detail }).`);
  }
  if (!state.raw_id && !state.detail) {
    throw new Error(`InteractionCapture: "${label}" debe incluir "raw_id" o "detail" — un estado nunca queda sin evidencia.`);
  }
}

export function createInteractionCapture(fields) {
  const { trigger, target_detail = null, state_before, state_after, evidence_method = null } = fields;

  if (!VALID_TRIGGERS.includes(trigger)) {
    throw new Error(`InteractionCapture: trigger inválido "${trigger}" — debe ser uno de: ${VALID_TRIGGERS.join(', ')}`);
  }
  assertState(state_before, 'state_before');
  assertState(state_after, 'state_after');

  return Object.freeze({
    trigger,
    target_detail,
    state_before: { ...state_before },
    state_after: { ...state_after },
    evidence_method,
  });
}

export { VALID_TRIGGERS as INTERACTION_TRIGGERS };
