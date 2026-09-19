// gmailService.js — Acciones reales de Gmail API (FASE "Hermes ADMIN +
// Gmail MCP completo", 2026-09-04). Cada función llama a UN método real de
// la API de Gmail, sin SQL ni comandos arbitrarios -- los tools MCP
// (server.js) solo exponen estas funciones ya parametrizadas.
//
// Envío: SOLO sendApprovedGmailDraft llama a un método de envío real
// (drafts.send). Ninguna otra función de este archivo envía nada -- ver
// nota de scopes en gmailClient.js.
//
// Borrado: SOLO trashGmailMessage, que mueve a la papelera real de Gmail
// (messages.trash) -- nunca borrado permanente (no existe ninguna función
// aquí que llame a messages.delete).

import { getGmailApi } from './gmailClient.js';

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function headerValue(headers, name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** Extrae el cuerpo de texto plano real de un mensaje (recorre multipart si hace falta). */
function extractPlainTextBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const encontrado = extractPlainTextBody(part);
    if (encontrado) return encontrado;
  }
  return null;
}

// RFC 2047 encoded-word -- headers de correo son 7-bit/ASCII por spec; un
// asunto con acentos/rayas (á é í ó ú ñ ü, —) puesto crudo en el header
// provoca mojibake real al ser reinterpretado por el parser MIME de Gmail
// (INCIDENTE 2026-09-04: "Reporte hoy — Vida Divina" llegó como "Reporte
// hoy Ã¢Â€Â” Vida Divina"). Solo se codifica si hace falta -- un asunto ya
// ASCII se deja intacto.
function encodeMimeHeaderValue(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

// Envuelve una cadena base64 a 76 caracteres por línea (RFC 2045).
function wrapBase64(base64) {
  return base64.replace(/.{76}(?=.)/g, '$&\r\n');
}

// html=true (FASE "Cierre de autenticación + logo + correo de inventario",
// 2026-09-19): mismo builder MIME real, nunca uno paralelo -- solo cambia
// el Content-Type real del mensaje. Por defecto sigue siendo text/plain
// (cero cambio de comportamiento para createDraft/updateDraft ya
// existentes que no pasan `html`, ej. el reporte de Ventas/CRM).
function buildRawMessage({ to, subject, body, inReplyTo = null, html = false }) {
  const lineas = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeaderValue(subject)}`,
    html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    'MIME-Version: 1.0',
  ];
  if (inReplyTo) lineas.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  // Cuerpo en base64 real (nunca texto crudo 8-bit en el mensaje MIME) --
  // evita cualquier mojibake de charset independientemente de cómo el
  // servidor de correo interprete un body 8-bit sin codificar.
  lineas.push('', wrapBase64(Buffer.from(body, 'utf8').toString('base64')));
  const mensaje = lineas.join('\r\n');
  return Buffer.from(mensaje, 'utf8').toString('base64url');
}

/** LECTURA: busca mensajes reales por query de Gmail (ej. "is:unread from:cliente@x.com"). */
export async function searchGmailMessages({ query = '', maxResults = 10 } = {}) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  const mensajes = data.messages ?? [];
  const detalles = await Promise.all(
    mensajes.map(async (m) => {
      const { data: meta } = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
      return {
        id: meta.id,
        threadId: meta.threadId,
        from: headerValue(meta.payload.headers, 'From'),
        subject: headerValue(meta.payload.headers, 'Subject'),
        date: headerValue(meta.payload.headers, 'Date'),
        snippet: meta.snippet,
        labelIds: meta.labelIds ?? [],
      };
    })
  );
  return detalles;
}

/** LECTURA: cuerpo completo real de un mensaje. */
export async function readGmailMessage(messageId) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return {
    id: data.id,
    threadId: data.threadId,
    from: headerValue(data.payload.headers, 'From'),
    to: headerValue(data.payload.headers, 'To'),
    subject: headerValue(data.payload.headers, 'Subject'),
    date: headerValue(data.payload.headers, 'Date'),
    body: extractPlainTextBody(data.payload) ?? data.snippet ?? '',
    labelIds: data.labelIds ?? [],
  };
}

/** GESTIÓN: crea un borrador real (nunca lo envía). `html: true` -- mismo builder, Content-Type real text/html (ver buildRawMessage). */
export async function createGmailDraft({ to, subject, body, html = false }) {
  if (!to) throw new Error('createGmailDraft: falta "to" real (ni se pasó ni hay ADMIN_EMAIL configurado).');
  const gmail = getGmailApi();
  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: buildRawMessage({ to, subject, body, html }) } },
  });
  return { draftId: data.id, messageId: data.message?.id, to, subject };
}

/** GESTIÓN: reemplaza el contenido real de un borrador ya existente (nunca lo envía). */
export async function updateGmailDraft(draftId, { to, subject, body, html = false }) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.drafts.update({
    userId: 'me',
    id: draftId,
    requestBody: { message: { raw: buildRawMessage({ to, subject, body, html }) } },
  });
  return { draftId: data.id, messageId: data.message?.id, to, subject };
}

/** Datos reales mínimos de un borrador (destinatario + asunto) -- para el gate de confirmación antes de enviar. */
export async function getGmailDraftSummary(draftId) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'metadata' });
  const headers = data.message?.payload?.headers ?? [];
  return { draftId, to: headerValue(headers, 'To'), subject: headerValue(headers, 'Subject') };
}

/** GESTIÓN: mueve un mensaje real a la papelera -- NUNCA borrado permanente. */
export async function trashGmailMessage(messageId) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.messages.trash({ userId: 'me', id: messageId });
  return { id: data.id, trashed: true };
}

/** ENVÍO real -- única función de este archivo que envía algo. Envía el borrador REAL ya creado (drafts.send), tal cual está guardado -- nunca construye un mensaje nuevo aquí. */
export async function sendApprovedGmailDraft(draftId) {
  const gmail = getGmailApi();
  const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
  return { messageId: data.id, threadId: data.threadId, sent: true };
}
