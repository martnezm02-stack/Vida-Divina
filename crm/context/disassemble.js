// disassemble.js
// Proyección de ESCRITURA: objeto contexto plano -> PostgreSQL. Fase C.1.
//
// disassembleContext(client, id, contexto) SIEMPRE debe recibir un client
// dentro de una transacción ya abierta (nunca el pool) — lo compone
// contextProjection.js con crm/db/transaction.js#runInTransaction. No hace
// su propio BEGIN/COMMIT: si algo falla a mitad de camino, quien llamó es
// responsable del ROLLBACK (así se garantiza que ninguna entidad quede
// persistida a medias — requisito explícito de esta fase).
//
// Orden de escritura (fijo, cada paso depende del anterior):
//   1. customer + customer_channel (find-or-create, DECISIÓN C1: 1 canal)
//   2. conversation (find-or-create, lock si ya existe)
//   3. state_transition (solo si contexto.estado cambió de verdad)
//   4. opportunity (solo si contexto.productoId está presente)
//   5. offers_log (solo si hay una oferta nueva que no estaba ya registrada)
//   6. follow_up de recuperación (solo el grupo activo, Decisión C.1)
//   7. handoff (solo si es un handoff nuevo, nunca automático)
//   8. mensaje entrante (Decisión C2, Opción A — derivado de respuestaCliente)

import * as customerRepository from '../repositories/customerRepository.js';
import * as customerChannelRepository from '../repositories/customerChannelRepository.js';
import * as conversationRepository from '../repositories/conversationRepository.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';
import * as stateTransitionRepository from '../repositories/stateTransitionRepository.js';
import * as offerLogRepository from '../repositories/offerLogRepository.js';
import * as followUpRepository from '../repositories/followUpRepository.js';
import * as handoffRepository from '../repositories/handoffRepository.js';
import * as messageRepository from '../repositories/messageRepository.js';
import { TIPO_CANAL_WHATSAPP, CARRIED_METADATA_KEYS, FOLLOWUP_RESULTADOS_PERMITIDOS, FOLLOWUP_TIPO_RECUPERACION } from './constants.js';

/**
 * Busca el canal y, si existe, la conversación correspondiente YA
 * BLOQUEADA (SELECT ... FOR UPDATE) — punto único de serialización para
 * escrituras concurrentes sobre el mismo `id` (ver crm/repositories/
 * conversationRepository.js#findByIdForUpdate). Si el canal no existe
 * todavía, no hay nada que bloquear — ese caso (primera creación) se apoya
 * en el UNIQUE de customer_channels, no en un lock (ver limitaciones en
 * docs/CRM_FASE_C1_CONTEXT_PROJECTION.md).
 *
 * @param {{query: Function}} client - dentro de una transacción
 * @param {string} id
 * @returns {Promise<{channel: Object|null, conversation: Object|null}>}
 */
export async function lockConversationIfExists(client, id) {
  const channel = await customerChannelRepository.findByTipoAndIdentificador(client, TIPO_CANAL_WHATSAPP, id);
  if (!channel) return { channel: null, conversation: null };

  const existente = await conversationRepository.findLatestByCustomerChannelId(client, channel.customerChannelId);
  if (!existente) return { channel, conversation: null };

  const conversation = await conversationRepository.findByIdForUpdate(client, existente.conversationId);
  return { channel, conversation };
}

function buildCarriedMetadata(contexto) {
  const metadata = {};
  for (const clave of CARRIED_METADATA_KEYS) {
    if (contexto[clave] !== undefined) metadata[clave] = contexto[clave];
  }
  return metadata;
}

/**
 * Persiste `contexto` (el blob plano completo) descomponiéndolo en las
 * entidades CRM correspondientes. Debe ejecutarse dentro de una
 * transacción ya abierta — ver cabecera del archivo.
 *
 * @param {{query: Function}} client
 * @param {string} id
 * @param {Object} contexto
 * @param {string} [source] - Fase 16 Parte 4: solo se usa si esta llamada
 *   CREA la conversación (ver conversationRepository.createConversation).
 * @returns {Promise<Object>} el mismo `contexto` recibido (igual que
 *   simulator/src/contextoStorage.js#guardarContexto)
 */
export async function disassembleContext(client, id, contexto, source = 'UNKNOWN') {
  // 1. customer + customer_channel ---------------------------------------
  let { channel, conversation } = await lockConversationIfExists(client, id);
  let customer = channel ? await customerRepository.findCustomerById(client, channel.customerId) : null;

  if (!channel) {
    customer = await customerRepository.createCustomer(client, { nombre: contexto.nombre ?? null, email: null });
    channel = await customerChannelRepository.createCustomerChannel(client, {
      customerId: customer.customerId,
      tipoCanal: TIPO_CANAL_WHATSAPP,
      identificadorExterno: id,
    });
  } else if (contexto.nombre && contexto.nombre !== customer.nombre) {
    customer = await customerRepository.updateCustomerProfile(client, customer.customerId, { nombre: contexto.nombre });
  }

  // 2. conversation --------------------------------------------------------
  const estadoAnterior = conversation?.estadoActual ?? null;
  const estadoNuevo = contexto.estado ?? null;
  const huboTransicionDeEstado = estadoNuevo !== null && estadoNuevo !== estadoAnterior;
  // Hallazgo real de Fase C.2B: el contrato original de contextoStorage.js
  // (JSON) persistía exactamente el valor de ultimaInteraccion que el
  // llamador diera — incluso `null`, si nunca se había fijado (llamadas
  // directas a guardarContexto fuera del flujo *Persistente, ej. fixtures
  // de test). Un `now()` incondicional en el repository rompía ese
  // round-trip en silencio. Se respeta el valor explícito cuando existe.
  const ultimaInteraccion = contexto.ultimaInteraccion ? new Date(contexto.ultimaInteraccion) : null;

  if (!conversation) {
    conversation = await conversationRepository.createConversation(client, {
      customerId: customer.customerId,
      customerChannelId: channel.customerChannelId,
      waIdConversacion: id,
      estadoActual: estadoNuevo,
      ultimaInteraccion,
      source,
    });
  } else if (huboTransicionDeEstado) {
    conversation = await conversationRepository.updateEstadoActual(client, conversation.conversationId, estadoNuevo, ultimaInteraccion);
  } else {
    // Estado sin cambios: se refresca igual ultima_interaccion (mismo
    // comportamiento que cerrarContexto() en flujoVentaReal.js, que
    // siempre toca ese campo aunque el estado no haya cambiado), pero sin
    // crear una transición histórica innecesaria.
    conversation = await conversationRepository.touchUltimaInteraccion(client, conversation.conversationId, ultimaInteraccion);
  }

  // 3. state_transition ------------------------------------------------------
  if (huboTransicionDeEstado) {
    await stateTransitionRepository.insertTransition(client, {
      conversationId: conversation.conversationId,
      estadoAnterior,
      estadoNuevo,
      timestamp: new Date(),
      fuenteFuncion: 'crm/context/disassembleContext',
      metadata: buildCarriedMetadata(contexto),
    });
  }

  // 4. opportunity -------------------------------------------------------------
  let opportunity = null;
  if (contexto.productoId) {
    opportunity = await opportunityRepository.findLatestByConversationId(client, conversation.conversationId);
    // Hallazgo real de Fase C.2B: opportunities.estado es NOT NULL en el
    // schema (Fase B), pero el contrato original permite guardarContexto()
    // con productoId presente y estado todavía null (ej. fixtures de test
    // que preparan un producto antes del primer paso que fija el estado —
    // válido bajo JSON, que no tenía este constraint). Lanzar un error ahí
    // rompía una llamada legítima al contrato público. Se usa '' como
    // valor de relleno explícito (nunca un nombre de estado real
    // inventado) — nunca se lee de vuelta hacia el contexto plano
    // (opportunities.estado no participa en la proyección de lectura,
    // ver assemble.js), así que no tiene ningún efecto observable fuera
    // de esta tabla interna. Queda documentado como una limitación de
    // diseño del schema (debería ser nullable) a revisar en una fase que
    // sí pueda tocar migraciones.
    const estadoOportunidad = conversation.estadoActual ?? '';
    const datosOportunidad = {
      paquete: contexto.paquete ?? null,
      cantidad: contexto.cantidad ?? null,
      total: contexto.total ?? null,
      intencionCompra: contexto.intencionCompra === true,
      estado: estadoOportunidad,
      necesidadId: contexto.necesidadId ?? null,
    };
    if (!opportunity) {
      opportunity = await opportunityRepository.createOpportunity(client, {
        customerId: customer.customerId,
        conversationId: conversation.conversationId,
        productoId: contexto.productoId,
        ...datosOportunidad,
      });
    } else {
      opportunity = await opportunityRepository.updateOpportunity(client, opportunity.opportunityId, datosOportunidad);
    }
  }

  // 5. offers_log ------------------------------------------------------------
  if (opportunity && contexto.ofertaEnviada && contexto.ofertaUtilizada) {
    const registrados = await offerLogRepository.listByOpportunityId(client, opportunity.opportunityId);
    const ultimo = registrados[registrados.length - 1] ?? null;
    const fuente = contexto.ofertaUtilizada.fuente ?? 'contexto.ofertaUtilizada (fuente no documentada en el objeto original)';
    const snapshot = contexto.ofertaUtilizada.texto ?? null;
    const yaRegistrado = ultimo && ultimo.ofertaFuente === fuente && ultimo.snapshotTexto === snapshot;

    if (!yaRegistrado) {
      await offerLogRepository.insertOfferLog(client, {
        opportunityId: opportunity.opportunityId,
        productoId: contexto.productoId,
        ofertaFuente: fuente,
        enviadaEn: new Date(),
        snapshotTexto: snapshot,
      });
    }
  }

  // 6. follow_up de recuperación (único grupo activo, Decisión C.1) ------------
  const abiertos = (await followUpRepository.listByConversationId(client, conversation.conversationId)).filter(
    (f) => f.tipo === FOLLOWUP_TIPO_RECUPERACION && f.estado === 'pendiente'
  );
  const followUpAbierto = abiertos[abiertos.length - 1] ?? null;

  if (contexto.recuperacionPendiente === true && !followUpAbierto) {
    await followUpRepository.createFollowUp(client, {
      conversationId: conversation.conversationId,
      tipo: FOLLOWUP_TIPO_RECUPERACION,
      fechaProgramada: new Date(),
      requiereIntervencionHumana: false,
    });
  } else if (contexto.recuperacionPendiente === false && followUpAbierto) {
    // resultadoRecuperacion puede valer 'duda_no_autorizada' o
    // 'senal_medica' en el código real (flujoVentaReal.js) — ninguno de
    // los dos está en el CHECK de follow_ups.resultado aprobado en Fase
    // A/B. Se documenta como discrepancia (no se modifica el schema en
    // esta fase): se guarda null en vez de un valor que violaría el
    // constraint, en lugar de fallar la transacción completa por esto.
    const resultado = FOLLOWUP_RESULTADOS_PERMITIDOS.has(contexto.resultadoRecuperacion)
      ? contexto.resultadoRecuperacion
      : null;
    await followUpRepository.marcarEjecutado(client, followUpAbierto.followUpId, {
      fechaEjecutada: new Date(),
      resultado,
    });
  }

  // 7. handoff ------------------------------------------------------------------
  if (contexto.handoffPendiente === true && contexto.motivoHandoff) {
    const handoffVigente = conversation.handoffPendienteId
      ? await handoffRepository.findById(client, conversation.handoffPendienteId)
      : null;
    const esHandoffNuevo = !handoffVigente || handoffVigente.motivo !== contexto.motivoHandoff;

    if (esHandoffNuevo) {
      const nuevoHandoff = await handoffRepository.insertHandoff(client, {
        conversationId: conversation.conversationId,
        motivo: contexto.motivoHandoff,
        // El contexto plano no distingue "fuente" de "motivo" (solo tiene
        // motivoHandoff) — fuente queda null cuando se llega por esta vía.
        fuente: null,
      });
      conversation = await conversationRepository.setHandoffPendiente(
        client,
        conversation.conversationId,
        nuevoHandoff.handoffId
      );
    }
  }
  // Nota: si contexto.handoffPendiente es false, no se toca nada — el
  // sistema original nunca revierte handoffPendiente a false (verificado:
  // 0 asignaciones de `false` en flujoVentaReal.js), así que no hay
  // comportamiento real que replicar aquí; inventar una limpieza
  // automática sería agregar una capacidad que no existe hoy.

  // 8. mensaje entrante (Decisión C2, Opción A) -----------------------------------
  if (contexto.respuestaCliente) {
    const mensajes = await messageRepository.listByConversationId(client, conversation.conversationId);
    const ultimoEntrante = [...mensajes].reverse().find((m) => m.direccion === 'entrante') ?? null;
    if (!ultimoEntrante || ultimoEntrante.texto !== contexto.respuestaCliente) {
      // canal_message_id y timestamp reales no están disponibles en el
      // contexto plano hoy (ver Fase C.0 §8) — se usa NULL/now() en vez de
      // inventar un valor, tal como exige esta fase explícitamente.
      await messageRepository.insertMessage(client, {
        conversationId: conversation.conversationId,
        direccion: 'entrante',
        texto: contexto.respuestaCliente,
        canalMessageId: null,
        timestamp: new Date(),
      });
    }
  }

  return contexto;
}
