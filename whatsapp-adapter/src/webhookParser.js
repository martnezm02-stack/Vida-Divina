// webhookParser.js
// Clasifica un payload crudo de webhook de WhatsApp Cloud API en una de 4
// categorías, sin tocar el motor comercial — esa decisión vive en
// conversationRouter.js, no aquí. Ningún otro módulo del adaptador debe
// leer `entry[].changes[].value` directamente; esta es la única puerta de
// entrada al payload crudo de Meta.
//
// ADVERTENCIA — identificador no verificado todavía:
// La forma de `value` (contacts[].wa_id, messages[].from, statuses[]) se
// basa en la estructura pública documentada por Meta para WhatsApp Cloud
// API, NO en un payload real de "Vive Vida Divina" — el webhook no está
// conectado en esta fase (Fase 4.2, diseño/preparación). Debe confirmarse
// contra el primer payload real antes de considerarse definitivo (ver
// docs/WHATSAPP_INTEGRATION_STATE.md §5 y la Sección 7 del diseño
// aprobado de la Fase 4.2).
//
// Decisión de identificador (aprobada): `contacts[0].wa_id` es el
// identificador canónico provisional; `messages[0].from` es el respaldo
// si `contacts` no viene en el payload.

function extraerValue(payload) {
  return payload?.entry?.[0]?.changes?.[0]?.value ?? null;
}

function extraerIdentificador(value, mensaje) {
  const waId = value.contacts?.[0]?.wa_id;
  if (waId) return waId;
  return mensaje.from ?? null;
}

/**
 * @param {Object} payloadCrudo
 * @returns {
 *   { tipo: 'mensaje_entrante', id: string, mensaje: string, timestamp: string|null, raw: Object } |
 *   { tipo: 'evento_estado', raw: Object } |
 *   { tipo: 'mensaje_saliente', raw: Object } |
 *   { tipo: 'no_procesable', motivo: string, raw: Object }
 * }
 */
export function clasificarEvento(payloadCrudo) {
  const value = extraerValue(payloadCrudo);
  if (!value) {
    return {
      tipo: 'no_procesable',
      motivo: 'Estructura de payload no reconocida (falta entry[].changes[].value).',
      raw: payloadCrudo,
    };
  }

  if (Array.isArray(value.statuses) && value.statuses.length > 0) {
    return { tipo: 'evento_estado', raw: payloadCrudo };
  }

  if (Array.isArray(value.messages) && value.messages.length > 0) {
    const mensaje = value.messages[0];
    const numeroPropio = value.metadata?.display_phone_number;
    if (numeroPropio && mensaje.from === numeroPropio) {
      return { tipo: 'mensaje_saliente', raw: payloadCrudo };
    }

    if (mensaje.type !== 'text') {
      return {
        tipo: 'no_procesable',
        motivo: `Tipo de mensaje "${mensaje.type}" no soportado todavía en esta fase (solo texto).`,
        raw: payloadCrudo,
      };
    }

    const id = extraerIdentificador(value, mensaje);
    if (!id) {
      return {
        tipo: 'no_procesable',
        motivo: 'No fue posible extraer un identificador de contacto (wa_id/from) del payload.',
        raw: payloadCrudo,
      };
    }

    return {
      tipo: 'mensaje_entrante',
      id,
      mensaje: mensaje.text?.body ?? '',
      timestamp: mensaje.timestamp ?? null,
      raw: payloadCrudo,
    };
  }

  return {
    tipo: 'no_procesable',
    motivo: 'El payload no contiene messages ni statuses reconocibles.',
    raw: payloadCrudo,
  };
}
