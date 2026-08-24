// whatsapp.js — WHATSAPP CONSOLE (Fase 15, Partes 8-16). Solo lee/escribe a
// través de las puertas ya reales del proyecto: crm/index.js (única puerta
// de acceso a PostgreSQL, Decisión Arquitectónica #6) y
// whatsapp-adapter/src/graphApiSender.js (único emisor real hacia Meta
// Graph API). Este archivo NUNCA ejecuta SQL propio, NUNCA reimplementa el
// envío hacia Meta, NUNCA fabrica conversaciones/mensajes/oportunidades --
// si no hay datos reales, responde estados explícitos (vacío/NOT AVAILABLE),
// nunca 0 ni un placeholder que aparente ser real.
//
// direccion 'entrante'/'saliente' es el único origen estructural real de un
// mensaje (crm/repositories/messageRepository.js) -- no existe un campo
// AI/HUMAN en el schema real, así que esta capa nunca lo inventa (Fase 15
// Parte 10).
//
// conversation.source (Fase 16, Parte 4/6): REAL/SIMULATED/TEST/FIXTURE/
// UNKNOWN (migración crm 0002). El filtro por defecto de la consola es
// REAL -- nunca oculta que existen otras (el resumen agregado siempre
// reporta el total real y el desglose por source).

import { sendJson, badRequest, notFound, serverError, readJsonBody } from '../lib/http.js';
import * as crm from '../../../crm/index.js';
import { CONVERSATION_SOURCES } from '../../../crm/repositories/conversationRepository.js';
import { envioHabilitado, enviarTexto } from '../../../whatsapp-adapter/src/graphApiSender.js';
import { getProduct } from '../lib/productCatalog.js';

const GRAPH_API_VERSION_DEFECTO = 'v21.0';
const SOURCE_FILTERS = Object.freeze(['ALL', ...CONVERSATION_SOURCES]);

async function lastMessagePreview(conversationId) {
  const messages = await crm.messages.listByConversationId(conversationId, { limit: 500 });
  return messages.length ? messages[messages.length - 1] : null;
}

/** GET /api/whatsapp/conversations?days=N&source=REAL|SIMULATED|TEST|FIXTURE|UNKNOWN|ALL -- Fase 15 Parte 9 + Fase 16 Parte 4/6 (WHATSAPP INBOX). */
export async function handleListWhatsappConversations(req, res, url) {
  const days = Number(url.searchParams.get('days')) || 30;
  const sourceFilter = url.searchParams.get('source') || 'REAL';
  if (!SOURCE_FILTERS.includes(sourceFilter)) { badRequest(res, `WHATSAPP: "source" inválido "${sourceFilter}" (válidos: ${SOURCE_FILTERS.join(', ')}).`); return; }
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);

  let conversations;
  try {
    conversations = await crm.conversations.listStartedBetween({ since: since.toISOString(), until: until.toISOString() });
  } catch (err) {
    serverError(res, err);
    return;
  }

  // Resumen real por source SIEMPRE sobre el conjunto completo del rango
  // de fechas -- nunca se oculta que existen otras (Parte 6: "no ocultar
  // datos reales"), aunque el filtro aplicado reduzca la lista devuelta.
  const bySource = {};
  for (const s of CONVERSATION_SOURCES) bySource[s] = 0;
  for (const c of conversations) bySource[c.source ?? 'UNKNOWN'] = (bySource[c.source ?? 'UNKNOWN'] ?? 0) + 1;

  const filtradas = sourceFilter === 'ALL' ? conversations : conversations.filter((c) => c.source === sourceFilter);

  const enriched = await Promise.all(filtradas.map(async (c) => {
    const [customer, lastMessage] = await Promise.all([
      crm.customers.findCustomerById(c.customerId).catch(() => null),
      lastMessagePreview(c.conversationId).catch(() => null),
    ]);
    return {
      conversationId: c.conversationId,
      contact: customer?.nombre ?? c.waIdConversacion ?? 'NOT AVAILABLE',
      waId: c.waIdConversacion,
      estadoActual: c.estadoActual,
      source: c.source ?? 'UNKNOWN',
      ultimaInteraccion: c.ultimaInteraccion,
      lastMessage: lastMessage ? { direccion: lastMessage.direccion, texto: lastMessage.texto, timestamp: lastMessage.timestamp } : null,
    };
  }));
  enriched.sort((a, b) => (a.ultimaInteraccion < b.ultimaInteraccion ? 1 : -1));
  sendJson(res, 200, { conversations: enriched, totalInRange: conversations.length, bySource, appliedFilter: sourceFilter });
}

/** GET /api/whatsapp/conversations/:id -- Fase 15, Parte 10/15 (CONVERSATION VIEW + DETAIL). */
export async function handleGetWhatsappConversation(req, res, id) {
  let conversation;
  try {
    conversation = await crm.conversations.findConversationById(id);
  } catch (err) {
    serverError(res, err);
    return;
  }
  if (!conversation) { notFound(res, `No existe ninguna conversación real con id "${id}".`); return; }

  const [customer, messages, opportunity] = await Promise.all([
    crm.customers.findCustomerById(conversation.customerId).catch(() => null),
    crm.messages.listByConversationId(id, { limit: 500 }),
    crm.opportunities.findLatestByConversationId(id).catch(() => null),
  ]);

  let productName = null;
  if (opportunity?.productoId) {
    const product = getProduct(opportunity.productoId);
    productName = product?.nombreComercial ?? opportunity.productoId;
  }

  sendJson(res, 200, {
    conversation: { ...conversation, source: conversation.source ?? 'UNKNOWN' },
    contact: customer ? { customerId: customer.customerId, nombre: customer.nombre, email: customer.email } : null,
    messages: messages.map((m) => ({ messageId: m.messageId, direccion: m.direccion, texto: m.texto, timestamp: m.timestamp, canalMessageId: m.canalMessageId })),
    opportunity: opportunity ? { opportunityId: opportunity.opportunityId, productoId: opportunity.productoId, productName, estado: opportunity.estado, total: opportunity.total, intencionCompra: opportunity.intencionCompra } : null,
  });
}

/**
 * POST /api/whatsapp/conversations/:id/send { text } -- Fase 15, Parte 11/13
 * (RESPUESTA MANUAL). Dashboard -> este endpoint -> graphApiSender.js real
 * -> Meta. Nunca envía si envioHabilitado() es false (mismas 2 variables de
 * entorno reales que ya protegen enviarRecursos()) -- responde
 * CONFIGURATION_REQUIRED explícito, mismo criterio que
 * media-hosting/mediaHostingService.js.
 */
export async function handleSendWhatsappMessage(req, res, id) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const text = body.text?.trim();
  if (!text) { badRequest(res, 'WHATSAPP: "text" es obligatorio -- nunca se envía un mensaje vacío o inventado.'); return; }

  const conversation = await crm.conversations.findConversationById(id);
  if (!conversation) { notFound(res, `No existe ninguna conversación real con id "${id}".`); return; }

  if (!envioHabilitado()) {
    sendJson(res, 200, { status: 'CONFIGURATION_REQUIRED', reason: 'WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID no están configurados en este entorno -- no se intentó ningún envío real.' });
    return;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || GRAPH_API_VERSION_DEFECTO;

  let envio;
  try {
    envio = await enviarTexto({ to: conversation.waIdConversacion, body: text, phoneNumberId, accessToken, apiVersion, fetchImpl: fetch });
  } catch (err) {
    serverError(res, err);
    return;
  }

  if (!envio.ok) {
    sendJson(res, 200, { status: 'SEND_FAILED', httpStatus: envio.status, error: envio.cuerpo?.error?.message ?? 'Graph API respondió con error real, sin detalle adicional.' });
    return;
  }

  const canalMessageId = envio.cuerpo?.messages?.[0]?.id ?? null;
  const timestamp = new Date().toISOString();
  // Fase 16, Parte 8 -- idempotencia: si por alguna razón este wamid real
  // ya está guardado (ej. doble click con reintento de red ya confirmado
  // del lado de Meta), no se duplica el mensaje saliente.
  if (canalMessageId) {
    const yaExiste = await crm.messages.findByConversationAndCanalMessageId(id, canalMessageId);
    if (yaExiste) { sendJson(res, 200, { status: 'SENT', message: { messageId: yaExiste.messageId, direccion: yaExiste.direccion, texto: yaExiste.texto, timestamp: yaExiste.timestamp, canalMessageId: yaExiste.canalMessageId } }); return; }
  }
  const saved = await crm.messages.insertMessage({ conversationId: id, direccion: 'saliente', texto: text, canalMessageId, timestamp });
  await crm.conversations.touchUltimaInteraccion(id, timestamp);

  sendJson(res, 200, { status: 'SENT', message: { messageId: saved.messageId, direccion: saved.direccion, texto: saved.texto, timestamp: saved.timestamp, canalMessageId: saved.canalMessageId } });
}

/** GET /api/whatsapp/status -- disponibilidad real del envío (Fase 15, para no fingir que ENVIAR siempre funciona). */
export async function handleWhatsappStatus(req, res) {
  sendJson(res, 200, { sendEnabled: envioHabilitado() });
}
