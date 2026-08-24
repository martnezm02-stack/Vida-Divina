// assemble.js
// Proyección de LECTURA: PostgreSQL -> objeto contexto plano (33 campos,
// misma forma que simulator/src/flujoVentaReal.js#crearContextoConversacion()).
// Fase C.1 — ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md para la matriz
// completa campo por campo.
//
// assembleContext(db, id) acepta cualquier objeto con `.query()` (un
// pg.Pool para lecturas sueltas, o un pg.PoolClient dentro de una
// transacción) — nunca asume cuál de los dos es. No modifica nada.

import * as customerRepository from '../repositories/customerRepository.js';
import * as customerChannelRepository from '../repositories/customerChannelRepository.js';
import * as conversationRepository from '../repositories/conversationRepository.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';
import * as stateTransitionRepository from '../repositories/stateTransitionRepository.js';
import * as messageRepository from '../repositories/messageRepository.js';
import * as followUpRepository from '../repositories/followUpRepository.js';
import * as handoffRepository from '../repositories/handoffRepository.js';
import { TIPO_CANAL_WHATSAPP, FOLLOWUP_TIPO_RECUPERACION, CAMPOS_SIN_PERSISTENCIA_HOY } from './constants.js';

function isoOrNull(valor) {
  if (valor == null) return null;
  return valor instanceof Date ? valor.toISOString() : String(valor);
}

function numeroOrNull(valor) {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reconstruye el contexto plano completo para `id` (el identificador
 * externo del canal — hoy siempre un wa_id de WhatsApp), o `null` si no
 * existe ningún customer_channel/conversation para ese id — mismo
 * comportamiento observable que simulator/src/contextoStorage.js#recuperarContexto:
 * ausencia se representa como null, nunca un objeto inventado.
 *
 * Invariante asumida: un customer_channel y su conversation se crean
 * siempre juntos (ver disassemble.js) — si el canal existe pero no hay
 * conversation, se trata igual que "no existe contexto" (defensivo, no
 * debería ocurrir en la práctica).
 *
 * @param {{query: Function}} db
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function assembleContext(db, id) {
  const channel = await customerChannelRepository.findByTipoAndIdentificador(db, TIPO_CANAL_WHATSAPP, id);
  if (!channel) return null;

  const conversation = await conversationRepository.findLatestByCustomerChannelId(db, channel.customerChannelId);
  if (!conversation) return null;

  const customer = await customerRepository.findCustomerById(db, channel.customerId);
  const opportunity = await opportunityRepository.findLatestByConversationId(db, conversation.conversationId);
  const ultimaTransicion = await stateTransitionRepository.findLatestByConversationId(db, conversation.conversationId);

  const mensajes = await messageRepository.listByConversationId(db, conversation.conversationId);
  const ultimoEntrante = [...mensajes].reverse().find((m) => m.direccion === 'entrante') ?? null;

  const followUpsRecuperacion = (await followUpRepository.listByConversationId(db, conversation.conversationId)).filter(
    (f) => f.tipo === FOLLOWUP_TIPO_RECUPERACION
  );
  const followUpRecuperacionVigente = followUpsRecuperacion[followUpsRecuperacion.length - 1] ?? null;

  const handoff = conversation.handoffPendienteId
    ? await handoffRepository.findById(db, conversation.handoffPendienteId)
    : null;

  const metadata = (ultimaTransicion && ultimaTransicion.metadata) || {};

  return {
    id,

    // A. Identidad — telefono nunca tuvo representación persistida (ver
    // constants.js); nombre viene de customers, nullable igual que hoy.
    telefono: CAMPOS_SIN_PERSISTENCIA_HOY.telefono,
    nombre: customer?.nombre ?? null,

    // D. Venta — de la oportunidad activa de esta conversación, si existe.
    productoId: opportunity?.productoId ?? null,
    paquete: opportunity?.paquete ?? null,
    cantidad: opportunity?.cantidad ?? null,
    total: opportunity ? numeroOrNull(opportunity.total) : null,
    // opportunities.intencion_compra es NOT NULL (false por defecto), pero
    // el contexto original solo produce `null` o `true` (nunca `false`
    // explícito — verificado: 0 asignaciones de `false` en flujoVentaReal.js).
    // Se normaliza false->null aquí para no inventar un valor que el
    // sistema original nunca produjo.
    intencionCompra: opportunity?.intencionCompra === true ? true : null,
    resultado: CAMPOS_SIN_PERSISTENCIA_HOY.resultado,

    necesidadId: opportunity?.necesidadId ?? null,
    testimonioEnviado: metadata.testimonioEnviado ?? false,

    precioEnviado: metadata.precioEnviado ?? false,
    ofertaEnviada: metadata.ofertaEnviada ?? false,
    cierreEnviado: metadata.cierreEnviado ?? false,
    precioUtilizado: metadata.precioUtilizado ?? null,
    ofertaUtilizada: metadata.ofertaUtilizada ?? null,
    cierreUtilizado: metadata.cierreUtilizado ?? null,

    // C/B. Estado comercial y conversación
    estado: conversation.estadoActual ?? null,
    ultimaInteraccion: isoOrNull(conversation.ultimaInteraccion),
    ultimaIntencion: metadata.ultimaIntencion ?? null,
    // Decisión C2 (Opción A): respuestaCliente se reconstruye como el texto
    // del mensaje ENTRANTE más reciente — nunca incluye salientes (no se
    // capturan todavía, ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md).
    respuestaCliente: ultimoEntrante?.texto ?? null,

    // E. Seguimiento — postventa (día 3 / semana): sin representación
    // persistida hoy, por instrucción explícita de esta fase (no existe
    // código real que lo ejecute — ver Fase C.0 §3).
    fechaEntrega: CAMPOS_SIN_PERSISTENCIA_HOY.fechaEntrega,
    seguimientoDia3Enviado: CAMPOS_SIN_PERSISTENCIA_HOY.seguimientoDia3Enviado,
    resultadoSeguimientoDia3: CAMPOS_SIN_PERSISTENCIA_HOY.resultadoSeguimientoDia3,
    fechaSiguienteSeguimiento: CAMPOS_SIN_PERSISTENCIA_HOY.fechaSiguienteSeguimiento,
    estadoFinalSeguimiento: CAMPOS_SIN_PERSISTENCIA_HOY.estadoFinalSeguimiento,

    // E. Seguimiento — recuperación: sí activo, se reconstruye desde
    // follow_ups (tipo recuperacion_dia5).
    recuperacionPendiente: followUpRecuperacionVigente ? followUpRecuperacionVigente.estado === 'pendiente' : false,
    fechaActivacionRecuperacion: CAMPOS_SIN_PERSISTENCIA_HOY.fechaActivacionRecuperacion,
    ramaRecuperacionEjecutada: followUpRecuperacionVigente?.resultado ?? null,
    resultadoRecuperacion: followUpRecuperacionVigente?.resultado ?? null,

    // F. Handoff — handoffPendiente es monótono en el sistema original
    // (nunca vuelve a false una vez true, ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md)
    // — se replica ese comportamiento exactamente: presencia del puntero =
    // true, sin consultar handoffs.resuelto_en (ese campo existe en el
    // schema para una capacidad futura todavía no conectada, Fase B §9).
    handoffPendiente: !!conversation.handoffPendienteId,
    motivoHandoff: handoff?.motivo ?? null,
    fechaHandoff: handoff ? isoOrNull(handoff.creadoEn) : null,
  };
}
