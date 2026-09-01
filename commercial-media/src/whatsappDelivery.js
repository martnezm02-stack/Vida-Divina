// whatsappDelivery.js — Commercial Media: puente hacia WhatsApp (encargo
// §30, §48). NUNCA reimplementa WhatsApp Cloud API -- reutiliza
// whatsapp-adapter/src/graphApiSender.js#enviarAudio()/enviarAsset() tal
// cual (mismo camino real ya probado: archivo local -> upload -> media_id
// -> mensaje). Este archivo solo traduce un CommercialMediaRecord al
// tipo/argumentos reales que esas funciones ya esperan.

import { enviarAudio, enviarAsset, envioHabilitado } from '../../whatsapp-adapter/src/graphApiSender.js';

const WHATSAPP_TYPE_BY_MIME_PREFIX = Object.freeze({ video: 'video', audio: 'audio', image: 'image' });

function whatsappTypeForMimeType(mimeType) {
  const prefix = String(mimeType ?? '').split('/')[0];
  return WHATSAPP_TYPE_BY_MIME_PREFIX[prefix] ?? null;
}

/**
 * Construye el payload/referencia enviable (§48) SIN enviar nada -- útil
 * para validar el pipeline completo (selector -> payload) en tests/E2E sin
 * tocar la red. Devuelve `ready:false` si el registro no está activo o si
 * su mimeType no tiene un tipo real de mensaje de WhatsApp soportado.
 */
export function buildWhatsAppMediaSendRequest(record, { to, caption = null } = {}) {
  if (!to?.trim()) throw new Error('buildWhatsAppMediaSendRequest: "to" (wa_id del destinatario) es obligatorio.');
  const type = whatsappTypeForMimeType(record?.mimeType);
  if (!record?.active) {
    return Object.freeze({ ready: false, reason: `mediaId "${record?.mediaId}" no está active (businessIntent=${record?.businessIntent}).`, to, type, filePath: record?.filePath ?? null });
  }
  if (!type) {
    return Object.freeze({ ready: false, reason: `mimeType "${record?.mimeType}" no tiene un tipo de mensaje de WhatsApp soportado (image/audio/video).`, to, type: null, filePath: record?.filePath ?? null });
  }
  return Object.freeze({
    ready: true,
    to,
    type,
    filePath: record.filePath,
    mediaId: record.mediaId,
    displayName: record.displayName,
    caption: caption ?? (record.mediaType === 'VIDEO_TESTIMONIAL' ? record.displayName : null),
  });
}

/**
 * Envía el media real (§30) reutilizando enviarAudio()/enviarAsset() tal
 * cual -- nunca un segundo cliente de WhatsApp. En este entorno de
 * desarrollo, sin WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID
 * configurados, envioHabilitado() es false y esta función jamás toca la
 * red (mismo comportamiento real de graphApiSender.js) -- seguro de
 * ejecutar en tests/E2E sin enviar nada a un cliente real (§47, §49).
 */
export async function sendCommercialMedia(record, { to, caption = null, fetchImpl = fetch } = {}) {
  const payload = buildWhatsAppMediaSendRequest(record, { to, caption });
  if (!payload.ready) return { ok: false, etapa: 'validacion_registro', error: payload.reason };
  if (!envioHabilitado()) return { ok: false, etapa: 'config', error: 'envio_deshabilitado: falta WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID (comportamiento real de graphApiSender.js, no reimplementado aquí).' };

  if (payload.type === 'audio') return enviarAudio(to, payload.filePath, { fetchImpl });
  return enviarAsset(to, payload.filePath, payload.type, { caption: payload.caption, fetchImpl });
}
