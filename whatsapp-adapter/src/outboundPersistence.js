// outboundPersistence.js — Fase 16, Parte 7. Corrige un hallazgo real de
// la Fase 15: enviarRecursos() (graphApiSender.js) entrega mensajes reales
// a Meta pero nunca los persistía en crm/messages -- solo el INBOUND se
// guardaba (vía crm/context/disassemble.js, paso 8). Este módulo cierra
// ese hueco reutilizando crm/ real (nunca una segunda tabla de mensajes,
// nunca SQL propio) y el `texto`/`messageId` reales que
// graphApiSender.js#enviarRecursos ya reporta por recurso enviado (Fase 16).
//
// Regla dura: solo se persiste lo que Meta confirmó como enviado
// (envio.enviado === true). Un envío fallido NUNCA se guarda como mensaje
// saliente -- ver httpServer.js, que ya reporta envioReal/envios tal cual
// sin fabricar un resultado exitoso.

import * as crm from '../../crm/index.js';
import { TIPO_CANAL_WHATSAPP } from '../../crm/context/constants.js';

/**
 * Persiste como mensajes salientes reales los recursos que Meta confirmó
 * como enviados (`envio.enviado === true`, con `texto` real adjunto por
 * enviarRecursos()). Requiere que ya exista una conversation real para
 * `waId` (creada por el flujo INBOUND que originó la respuesta) -- si no
 * existe, no se inventa una conversación nueva desde aquí, se documenta y
 * se omite (nunca debería ocurrir en el flujo real: solo se responde a un
 * mensaje entrante ya procesado).
 *
 * Idempotente (Fase 16, Parte 8): si `messageId` (wamid real) ya está
 * guardado para esa conversation, no se inserta de nuevo.
 *
 * @param {string} waId - resultado.id de construirSalida() (destinatario real)
 * @param {Array<{tipo:string, enviado:boolean, texto?:string, messageId?:string|null}>} envios
 * @returns {Promise<Array<Object>>} los mensajes reales persistidos (nuevos, sin contar los ya existentes por idempotencia)
 */
export async function persistOutboundReal(waId, envios) {
  const confirmados = (envios ?? []).filter((e) => e.enviado === true && typeof e.texto === 'string' && e.texto.length > 0);
  if (confirmados.length === 0) return [];

  const channel = await crm.customerChannels.findByTipoAndIdentificador(TIPO_CANAL_WHATSAPP, waId);
  if (!channel) return []; // sin conversation real que actualizar -- nunca se crea una desde el camino de salida.
  const conversation = await crm.conversations.findLatestByCustomerChannelId(channel.customerChannelId);
  if (!conversation) return [];

  const persistidos = [];
  for (const envio of confirmados) {
    if (envio.messageId) {
      const yaExiste = await crm.messages.findByConversationAndCanalMessageId(conversation.conversationId, envio.messageId);
      if (yaExiste) continue; // idempotente -- nunca duplica el mismo wamid real.
    }
    const guardado = await crm.messages.insertMessage({
      conversationId: conversation.conversationId,
      direccion: 'saliente',
      texto: envio.texto,
      canalMessageId: envio.messageId ?? null,
      timestamp: new Date().toISOString(),
    });
    persistidos.push(guardado);
  }
  if (persistidos.length > 0) {
    await crm.conversations.touchUltimaInteraccion(conversation.conversationId, new Date().toISOString());
  }
  return persistidos;
}
