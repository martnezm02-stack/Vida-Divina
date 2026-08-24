// conversationRouter.js
// Traduce "llegó este mensaje, en este estado" a "llamar esta función ya
// existente de flujoVentaReal.js" — no define reglas de negocio nuevas, no
// redefine estados ni transiciones (esas siguen viviendo exclusivamente en
// simulator/src/stateMachine.js, ESTADOS_VENTA_REAL). Cuando el estado
// persistido no tiene una función de continuación definida en
// flujoVentaReal.js, este módulo escala a humano en vez de inventar un
// comportamiento — nunca asume.
//
// Exclusión intencional (política SOLO_RESPUESTAS): este archivo NUNCA
// importa evaluarRecuperacion ni ninguna función cuyo propósito sea iniciar
// un mensaje sin que el cliente haya escrito primero. El seguimiento y la
// recuperación de compra proactivos siguen existiendo en el motor
// (flujoVentaReal.js), pero fuera del árbol de llamadas de este adaptador.
// No existe ningún scheduler/cron/setInterval/setTimeout en este módulo.
//
// Fase C.2B: las 10 funciones de este archivo son ahora async — el motor
// comercial (flujoVentaReal.js) pasó de síncrono (JSON) a asíncrono
// (PostgreSQL vía crm/) en la misma fase. Ninguna regla de decisión,
// mensaje comercial ni clasificación cambió — ver
// docs/CRM_FASE_C2_ASYNC_MIGRATION.md.

import {
  iniciarConversacionPersistente,
  clasificarPrimeraRespuestaPersistente,
  procesarFlujoConsumoPersistente,
  procesarNecesidadYPrecioPersistente,
  procesarOfertaYCierrePersistente,
  procesarRespuestaClientePersistente,
  procesarRespuestaRecuperacionPersistente,
  registrarHandoffEnContexto,
  requiereHandoffHumano,
} from '../../simulator/src/flujoVentaReal.js';
import { recuperarContexto } from '../../simulator/src/contextoStorage.js';
import { clasificarIntencionInicial } from '../../simulator/src/ventaRealRules.js';

const FUENTE_FUERA_DE_ALCANCE = 'docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md#fuera-de-alcance';

/**
 * Punto de entrada único de este módulo. Nunca se llama si el evento no es
 * un mensaje entrante del cliente — esa decisión ya se tomó en
 * webhookParser.js antes de llegar aquí.
 *
 * @param {string} id - identificador estable de la conversación (wa_id)
 * @param {string} mensaje - texto del mensaje entrante
 * @param {Object} kb - resultado de loadCompiledKnowledge()
 */
export async function enrutarMensajeEntrante(id, mensaje, kb) {
  const contextoPrevio = await recuperarContexto(id);
  const pasos = [];

  // Si ya existe un handoff pendiente sin resolver, no se intenta
  // continuar el flujo automáticamente — no hay en flujoVentaReal.js
  // ningún mecanismo de "reanudar tras handoff", y no se inventa uno aquí.
  if (contextoPrevio?.handoffPendiente) {
    return {
      contexto: contextoPrevio,
      pasos,
      handoff: { motivo: contextoPrevio.motivoHandoff, fuente: null, yaExistente: true },
      enviar: false,
    };
  }

  if (!contextoPrevio) {
    return enrutarContactoNuevo(id, mensaje, kb, pasos);
  }

  return enrutarContactoExistente(id, mensaje, kb, pasos, contextoPrevio.estado);
}

async function enrutarContactoNuevo(id, mensaje, kb, pasos) {
  const intencion = clasificarIntencionInicial(mensaje);

  if (intencion === 'distribucion') {
    return escalar(
      id,
      pasos,
      'Intención inicial "distribución" — fuera de alcance de Sprint 5; requiere agendar con un humano.',
      FUENTE_FUERA_DE_ALCANCE
    );
  }

  // Fase Pre-E2E (instrucción explícita del propietario): la bienvenida
  // comercial se envía SIEMPRE en el primer mensaje de un contacto nuevo,
  // sin excepción — incluso si ese mensaje ya expresa intención de
  // consumo clara. Ya no se clasifica ni se continúa en el mismo turno;
  // el siguiente mensaje del cliente entra al flujo normal de
  // clasificación (case 'MensajeInicialEnviado' en
  // enrutarContactoExistente, abajo). Reemplaza el comportamiento
  // anterior, que para intención 'consumo' encadenaba
  // clasificarPrimeraRespuestaPersistente + continuarConsumo en el mismo
  // turno. Ver docs/FASE_PRECAMPANA_VALIDACION.md §1 y
  // docs/conversaciones/primer_contacto/mensaje_inicial.md.
  const { resultado } = await iniciarConversacionPersistente(id, mensaje);
  pasos.push({ funcion: 'iniciarConversacionPersistente', resultado });
  return finalizar(id, pasos);
}

async function continuarConsumo(id, mensaje, kb, pasos) {
  const { resultado } = await procesarFlujoConsumoPersistente(id, kb, mensaje);
  pasos.push({ funcion: 'procesarFlujoConsumoPersistente', resultado });
  if (resultado.handoff) return finalizarConHandoff(id, pasos, resultado.handoff);
  // Espera la necesidad del cliente en el próximo mensaje — no se encadena
  // más porque procesarNecesidadYPrecioPersistente exige contenido nuevo.
  return finalizar(id, pasos);
}

async function enrutarContactoExistente(id, mensaje, kb, pasos, estado) {
  switch (estado) {
    case 'MensajeInicialEnviado': {
      const intencion = clasificarIntencionInicial(mensaje);
      if (intencion === 'distribucion') {
        return escalar(
          id,
          pasos,
          'Intención "distribución" tras el saludo inicial — fuera de alcance de Sprint 5.',
          FUENTE_FUERA_DE_ALCANCE
        );
      }
      if (intencion === 'ambiguo') {
        return escalar(
          id,
          pasos,
          'El cliente respondió al saludo inicial sin intención de consumo o distribución identificable — Sprint 5 no define una pregunta autorizada adicional para este caso.',
          'docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md#3-entrada-del-prospecto'
        );
      }
      const clasificacion = await clasificarPrimeraRespuestaPersistente(id, mensaje);
      pasos.push({ funcion: 'clasificarPrimeraRespuestaPersistente', resultado: clasificacion.resultado });
      return continuarConsumo(id, mensaje, kb, pasos);
    }

    case 'IntencionClasificada':
      return continuarConsumo(id, mensaje, kb, pasos);

    case 'AudioExplicacionEnviado': {
      const { resultado } = await procesarNecesidadYPrecioPersistente(id, mensaje);
      pasos.push({ funcion: 'procesarNecesidadYPrecioPersistente', resultado });
      if (resultado.handoff) return finalizarConHandoff(id, pasos, resultado.handoff);
      // Sprint 5 §7-9: testimonio → precio → oferta → cierre son una
      // secuencia continua del negocio, sin que el cliente escriba de
      // nuevo entre cada paso — por eso se encadena aquí mismo.
      const cierre = await procesarOfertaYCierrePersistente(id);
      pasos.push({ funcion: 'procesarOfertaYCierrePersistente', resultado: cierre.resultado });
      if (cierre.resultado.handoff) return finalizarConHandoff(id, pasos, cierre.resultado.handoff);
      return finalizar(id, pasos);
    }

    case 'CierreEnviado':
    case 'EsperandoDecision': {
      const { resultado } = await procesarRespuestaClientePersistente(id, mensaje);
      pasos.push({ funcion: 'procesarRespuestaClientePersistente', resultado });
      return manejarRespuestaCliente(id, pasos, resultado);
    }

    case 'MensajeRecuperacionEnviado': {
      const { resultado } = await procesarRespuestaRecuperacionPersistente(id, mensaje);
      pasos.push({ funcion: 'procesarRespuestaRecuperacionPersistente', resultado });
      return manejarRespuestaRecuperacion(id, pasos, resultado);
    }

    default:
      return escalar(
        id,
        pasos,
        `El contexto está en el estado "${estado}", que no tiene una función de continuación definida en el motor comercial para un mensaje entrante — no se asume un comportamiento no documentado.`,
        'simulator/src/flujoVentaReal.js'
      );
  }
}

async function manejarRespuestaCliente(id, pasos, resultado) {
  if (resultado.handoff) return finalizarConHandoff(id, pasos, resultado.handoff);
  if (resultado.tipo === 'intencion_compra') {
    // Sprint 5: "El total no puede calcularse ni el pago iniciarse sin un
    // precio real disponible" — no existe todavía una función de
    // continuación (cálculo de total/pago) en flujoVentaReal.js. Se escala
    // en vez de dejar la conversación sin resolución o inventar el paso.
    return escalar(
      id,
      pasos,
      'Intención de compra detectada, pero no existe todavía una función de continuación (cálculo de total / pago) en el motor comercial.',
      'simulator/src/flujoVentaReal.js#procesarRespuestaCliente'
    );
  }
  if (resultado.tipo === 'lo_voy_a_pensar') {
    // Sprint 5 §21.2: no hay texto de respuesta autorizado en código para
    // esta rama en el flujo principal — no es un handoff (no requiere
    // humano), es ausencia de recurso: no se inventa contenido.
    return finalizarSinAccionDefinida(id, pasos);
  }
  // 'duda_documentada': identificarObjecionDocumentada (ventaRealRules.js)
  // ya encontró una coincidencia real en docs/objeciones/ — se representa
  // como recurso estructurado (outboundBuilder.js), reutilizando ese
  // resultado en vez de inventar un texto de respuesta nuevo.
  // 'senal_medica': tiene texto autorizado real (responseBuilder.js).
  return finalizar(id, pasos);
}

async function manejarRespuestaRecuperacion(id, pasos, resultado) {
  if (resultado.handoff) return finalizarConHandoff(id, pasos, resultado.handoff);
  if (resultado.tipo === 'intencion_compra') {
    return escalar(
      id,
      pasos,
      'Intención de compra detectada durante recuperación, pero no existe todavía una función de continuación (cálculo de total / pago) en el motor comercial.',
      'simulator/src/flujoVentaReal.js#procesarRespuestaRecuperacion'
    );
  }
  // 'senal_medica' y 'lo_voy_a_pensar' tienen texto autorizado real;
  // 'duda_documentada' se representa como recurso estructurado (mismo
  // criterio que en manejarRespuestaCliente).
  return finalizar(id, pasos);
}

async function finalizar(id, pasos) {
  return { contexto: await recuperarContexto(id), pasos, handoff: null, enviar: true };
}

async function finalizarSinAccionDefinida(id, pasos) {
  return { contexto: await recuperarContexto(id), pasos, handoff: null, enviar: false, sinAccionDefinida: true };
}

async function finalizarConHandoff(id, pasos, handoff) {
  // El handoff ya fue persistido por la propia función *Persistente que lo
  // produjo (confirmado en flujoVentaReal.js) — no se vuelve a escribir.
  return { contexto: await recuperarContexto(id), pasos, handoff, enviar: false };
}

async function escalar(id, pasos, motivo, fuente) {
  const handoff = requiereHandoffHumano(motivo, fuente);
  const contexto = await registrarHandoffEnContexto(id, handoff);
  return { contexto, pasos, handoff, enviar: false };
}
