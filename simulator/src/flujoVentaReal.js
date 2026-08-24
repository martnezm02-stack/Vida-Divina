// flujoVentaReal.js
// Orquestador del proceso comercial real (Sprint 5). Mismo patrón que
// simulator/src/simulator.js (traza paso a paso citando fuente exacta),
// aplicado al flujo documentado en
// docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md — que sigue siendo
// la fuente de verdad; este archivo no reinterpreta el proceso, lo ejecuta.
//
// Principio no negociable: ningún paso de este archivo fabrica un dato
// (precio, testimonio, oferta, respuesta rápida). Cuando el recurso
// correspondiente está PENDIENTE (ver recursosComerciales.js), el flujo
// se detiene y devuelve requiereHandoffHumano() — nunca continúa con un
// valor inventado. Esto es el mismo principio ya vigente en
// simulator/src/knowledgeQuery.js (getPrecio, getPromociones, etc.),
// aplicado ahora al proceso real en vez de al proceso genérico.

import {
  clasificarIntencionInicial,
  identificarProducto,
  detectarNecesidad,
  detectarIntencionCompra,
  extraerCantidad,
  esLoVoyAPensar,
  identificarObjecionDocumentada,
} from './ventaRealRules.js';
import {
  obtenerAudioExplicacion,
  buscarTestimonioPorNecesidad,
  obtenerPrecioProducto,
  obtenerOfertaProducto,
  obtenerCierre,
} from './recursosComerciales.js';
import { describirEstadoVentaReal } from './stateMachine.js';
import { registrarHallazgo } from './missingFieldsTracker.js';
import { SENAL_MEDICA } from './rules.js';
import { construirRespuestaSeguridad } from './responseBuilder.js';
import { recuperarContexto, guardarContexto } from './contextoStorage.js';

// Fuente: docs/conversaciones/primer_contacto/mensaje_inicial.md
export const MENSAJE_INICIAL_OFICIAL =
  'Hola gracias por ponerte en contacto con Vive Vida divina, Soy Manuel y es un gusto atenderte; me puedes indicar en que estas interesado?, en alguno de nuestros productos o en formar parte de nuestra red de distribuidores?';

// Fuente: SPRINT_5_PROCESO_COMERCIAL.md §20
export const MENSAJE_RECUPERACION =
  'Hola, buen día. Hace unos días te compartimos la información y promoción del [producto] que te interesó. ' +
  '¿Qué te pareció? ¿Hay alguna duda o algo que te gustaría saber antes de decidirte?';

// Fuente: SPRINT_5_PROCESO_COMERCIAL.md §21.2
export const MENSAJE_CIERRE_RECUPERACION_LO_PENSARA =
  'Esperamos que te animes a probar nuestro producto que estamos seguros mejoraran tu salud!';

const DIAS_ACTIVACION_RECUPERACION = 5;

/**
 * Resultado estándar cuando el flujo no puede continuar de forma
 * automática. Sprint 5 §1.7 y §22 exigen que el cliente nunca perciba la
 * transición — por eso `mensajeParaCliente` es siempre null: quien
 * consuma este resultado no debe enviar nada automático, solo notificar
 * internamente a un humano.
 */
export function requiereHandoffHumano(motivo, fuente) {
  return { requiereHumano: true, motivo, fuente, mensajeParaCliente: null };
}

/**
 * Forma del contexto que debe conservarse entre turnos (§25 de Sprint 5),
 * ampliada en la Fase 3.1/3.2 con los campos necesarios para persistencia
 * real (identidad, venta, recursos utilizados, postventa, recuperación,
 * handoff). Cambio estrictamente aditivo — ningún campo previo fue
 * renombrado ni eliminado; el código que ya leía `testimonioEnviado`,
 * `precioEnviado`, `ofertaEnviada` o `cierreEnviado` sigue funcionando
 * igual.
 */
export function crearContextoConversacion() {
  return {
    // Identidad — id es el identificador con el que se persiste este
    // contexto (ver simulator/src/contextoStorage.js). Teléfono/nombre
    // quedan null hasta que exista integración real de WhatsApp/OpenClaw
    // — no se inventa su formato (ver Fase 3.1, §5).
    id: null,
    telefono: null,
    nombre: null,

    // Venta
    productoId: null,
    paquete: null,
    cantidad: null,
    total: null,
    intencionCompra: null,
    resultado: null,

    // Necesidad
    necesidadId: null,
    testimonioEnviado: false,

    // Recursos — booleanos previos conservados sin cambio; se agregan los
    // campos que registran QUÉ recurso específico se usó, no solo si se envió.
    precioEnviado: false,
    ofertaEnviada: false,
    cierreEnviado: false,
    precioUtilizado: null,
    ofertaUtilizada: null,
    cierreUtilizado: null,

    // Interacción
    estado: null,
    ultimaInteraccion: null,
    ultimaIntencion: null,
    respuestaCliente: null,

    // Postventa
    fechaEntrega: null,
    seguimientoDia3Enviado: false,
    resultadoSeguimientoDia3: null,
    fechaSiguienteSeguimiento: null,
    estadoFinalSeguimiento: null,

    // Recuperación
    recuperacionPendiente: false,
    fechaActivacionRecuperacion: null,
    ramaRecuperacionEjecutada: null,
    resultadoRecuperacion: null,

    // Handoff — el contexto nunca se destruye ni reinicia al escalar a
    // humano (§10 de la Fase 3.2); estos campos son lo que permite a un
    // humano retomar sabiendo por qué se le transfirió la conversación.
    handoffPendiente: false,
    motivoHandoff: null,
    fechaHandoff: null,
  };
}

// ---------------------------------------------------------------------
// 1-2. Mensaje inicial y clasificación de intención — §3
// ---------------------------------------------------------------------
export function iniciarConversacion() {
  return {
    estado: describirEstadoVentaReal('MensajeInicialEnviado'),
    mensaje: MENSAJE_INICIAL_OFICIAL,
    fuente: 'docs/conversaciones/primer_contacto/mensaje_inicial.md',
  };
}

export function clasificarPrimeraRespuesta(mensaje) {
  const intencion = clasificarIntencionInicial(mensaje);
  if (intencion === 'distribucion') {
    return {
      intencion,
      estado: describirEstadoVentaReal('FueraDeAlcanceDistribucion'),
      nota: 'Fuera de alcance de este Sprint — SPRINT_5_PROCESO_COMERCIAL.md §2.',
    };
  }
  if (intencion === 'consumo') {
    return { intencion, estado: describirEstadoVentaReal('IntencionClasificada') };
  }
  return {
    intencion: 'ambiguo',
    estado: describirEstadoVentaReal('IntencionClasificada'),
    nota: 'No se distingue con certeza consumo vs. distribución en este mensaje — no se asume, requiere aclarar con el cliente.',
  };
}

// ---------------------------------------------------------------------
// 4-5. Identificar producto + enviar audio de explicación — §4.1-4.2
// ---------------------------------------------------------------------
export function procesarFlujoConsumo(kb, mensaje) {
  const traza = [];
  const paso = (n, nombre, detalle) => traza.push({ paso: n, nombre, detalle });

  const producto = identificarProducto(kb, mensaje);
  paso(1, 'Identificar producto de interés', { productoId: producto?.id ?? null, fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §4.1' });

  if (!producto) {
    return {
      traza,
      estado: describirEstadoVentaReal('IntencionClasificada'),
      handoff: requiereHandoffHumano(
        'No fue posible identificar el producto de interés a partir del mensaje del cliente.',
        'simulator/src/ventaRealRules.js#identificarProducto'
      ),
    };
  }

  const audio = obtenerAudioExplicacion();
  paso(2, 'Enviar audio de explicación', { disponible: audio.disponible, fuente: audio.fuente });

  return {
    traza,
    productoId: producto.id,
    productoTitulo: producto.titulo,
    estado: describirEstadoVentaReal('AudioExplicacionEnviado'),
    preguntaAudio: audio.contenido.preguntaFinal,
    handoff: null,
  };
}

// ---------------------------------------------------------------------
// 6-7. Identificar necesidad + testimonio + precio — §5-7
// Testimonio ausente NO bloquea (recurso de apoyo); precio ausente SÍ
// bloquea (nunca se inventa una cifra — regla dura, no negociable).
// ---------------------------------------------------------------------
export function procesarNecesidadYPrecio(productoId, mensajeNecesidad) {
  const traza = [];
  const paso = (n, nombre, detalle) => traza.push({ paso: n, nombre, detalle });

  const necesidadId = detectarNecesidad(mensajeNecesidad);
  paso(3, 'Identificar necesidad', { necesidadId, fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §5' });

  if (necesidadId) {
    const testimonio = buscarTestimonioPorNecesidad(necesidadId);
    paso(4, 'Seleccionar testimonio', { disponible: testimonio.disponible, fuente: testimonio.fuente });
    if (!testimonio.disponible) {
      registrarHallazgo({
        informacionFaltante: `Testimonio real para la necesidad "${necesidadId}"`,
        momento: 'Paso 6 del proceso real (SPRINT_5_PROCESO_COMERCIAL.md §6)',
        porQue: 'El proceso documentado envía un testimonio correspondiente a la necesidad manifestada antes del precio.',
        dondeIncorporar: 'docs/proceso_de_venta/recursos/testimonios.md',
        conversacionEvidencia: `venta-real:${productoId}:${necesidadId}`,
      });
    }
  } else {
    paso(3, 'Identificar necesidad', { necesidadId: null, nota: 'No coincide con ninguna de las 4 necesidades documentadas — no se asume.' });
  }

  const precio = obtenerPrecioProducto(productoId);
  paso(5, 'Enviar precio', { disponible: precio.disponible, fuente: precio.fuente });

  if (!precio.disponible) {
    return {
      traza,
      necesidadId,
      estado: describirEstadoVentaReal('NecesidadIdentificada'),
      handoff: requiereHandoffHumano(
        `No existe recurso de precio disponible para "${productoId}" — el flujo no puede continuar sin inventar una cifra.`,
        precio.fuente
      ),
    };
  }

  return { traza, necesidadId, precio, estado: describirEstadoVentaReal('PrecioEnviado'), handoff: null };
}

// ---------------------------------------------------------------------
// 8-9. Oferta + cierre — §8-9 (solo alcanzable si el precio existe)
// ---------------------------------------------------------------------
export function procesarOfertaYCierre(productoId) {
  const traza = [];
  const paso = (n, nombre, detalle) => traza.push({ paso: n, nombre, detalle });

  const oferta = obtenerOfertaProducto(productoId);
  paso(6, 'Enviar oferta', { disponible: oferta.disponible, fuente: oferta.fuente });

  if (!oferta.disponible) {
    return {
      traza,
      estado: describirEstadoVentaReal('PrecioEnviado'),
      handoff: requiereHandoffHumano(`No existe oferta documentada para "${productoId}".`, oferta.fuente),
    };
  }

  const cierre = obtenerCierre(productoId);
  paso(7, 'Ejecutar cierre', { tipo: cierre.tipo, fuente: cierre.fuente });

  return {
    traza,
    oferta,
    cierre,
    estado: describirEstadoVentaReal('CierreEnviado'),
    preguntaCierre: cierre.tipo === 'audio' ? cierre.preguntaFinal : cierre.mensaje,
    handoff: null,
  };
}

// ---------------------------------------------------------------------
// Respuesta del cliente tras el cierre — intención de compra / "lo voy
// a pensar" / duda documentada / duda sin conocimiento autorizado — §9-11, §18
// ---------------------------------------------------------------------
export function procesarRespuestaCliente(mensaje) {
  // Prioridad 1 (docs/agente_ia/prioridades.md), reutilizada tal cual del
  // flujo genérico — Sprint 5 no redefine esta regla, la hereda.
  if (SENAL_MEDICA.patrones.some((p) => p.test(mensaje))) {
    const respuesta = construirRespuestaSeguridad({ mensaje });
    return { tipo: 'senal_medica', estado: describirEstadoVentaReal('EsperandoDecision'), respuesta };
  }

  if (detectarIntencionCompra(mensaje)) {
    const cantidad = extraerCantidad(mensaje);
    return {
      tipo: 'intencion_compra',
      cantidad,
      estado: describirEstadoVentaReal('ProductoPaqueteDefinido'),
      nota: 'El total no puede calcularse ni el pago iniciarse sin un precio real disponible (obtenerPrecioProducto) — requiere handoff en ese punto.',
    };
  }

  if (esLoVoyAPensar(mensaje)) {
    return {
      tipo: 'lo_voy_a_pensar',
      estado: describirEstadoVentaReal('EsperandoDecision'),
      nota: 'No se programa un seguimiento distinto aquí — esta interacción es la última antes de entrar eventualmente a la ventana de recuperación (+5 días, §19).',
    };
  }

  const objecion = identificarObjecionDocumentada(mensaje);
  if (objecion) {
    return {
      tipo: 'duda_documentada',
      objecionId: objecion.objecionId,
      fuente: objecion.archivo,
      estado: describirEstadoVentaReal('EsperandoDecision'),
      nota: 'Responder de forma amable y específica citando el conocimiento de docs/objeciones/. No volver a preguntar inmediatamente si desea comprar (regla dura de §18/§21.4).',
    };
  }

  return {
    tipo: 'duda_no_autorizada',
    estado: describirEstadoVentaReal('EscaladoHumano'),
    handoff: requiereHandoffHumano(
      'La duda no coincide con ninguna objeción documentada en docs/objeciones/ ni con ninguna otra regla del flujo — no hay conocimiento autorizado para responder con seguridad.',
      'simulator/src/ventaRealRules.js#identificarObjecionDocumentada'
    ),
  };
}

// ---------------------------------------------------------------------
// Recuperación de compra (proceso nuevo, aislado) — §19-22
// ---------------------------------------------------------------------
export function evaluarRecuperacion({ ultimaInteraccion, fechaActual, clienteRecontacto }) {
  if (clienteRecontacto) {
    return {
      activar: false,
      estado: describirEstadoVentaReal('RecuperacionCancelada'),
      motivo: 'El cliente recontactó por iniciativa propia dentro de la ventana — SPRINT_5_PROCESO_COMERCIAL.md §19.',
    };
  }

  const diasTranscurridos = Math.floor((new Date(fechaActual) - new Date(ultimaInteraccion)) / (1000 * 60 * 60 * 24));

  if (diasTranscurridos < DIAS_ACTIVACION_RECUPERACION) {
    return {
      activar: false,
      estado: describirEstadoVentaReal('EnVentanaRecuperacion'),
      diasTranscurridos,
      motivo: 'Todavía no se cumplen los 5 días de la última interacción comercial.',
    };
  }

  return {
    activar: true,
    estado: describirEstadoVentaReal('MensajeRecuperacionEnviado'),
    diasTranscurridos,
    mensaje: MENSAJE_RECUPERACION,
  };
}

export function procesarRespuestaRecuperacion(mensaje) {
  if (mensaje && SENAL_MEDICA.patrones.some((p) => p.test(mensaje))) {
    const respuesta = construirRespuestaSeguridad({ mensaje });
    return { tipo: 'senal_medica', estado: describirEstadoVentaReal('MensajeRecuperacionEnviado'), respuesta };
  }
  if (!mensaje) {
    return {
      tipo: 'sin_respuesta',
      estado: describirEstadoVentaReal('RecuperacionFinalizada'),
      nota: 'Día 5 → mensaje → sin respuesta → FIN. No se envía segundo mensaje ni se programa otro seguimiento (§21.1).',
    };
  }
  if (esLoVoyAPensar(mensaje)) {
    return {
      tipo: 'lo_voy_a_pensar',
      estado: describirEstadoVentaReal('RecuperacionFinalizada'),
      mensajeRespuesta: MENSAJE_CIERRE_RECUPERACION_LO_PENSARA,
      nota: 'FIN DE RECUPERACIÓN — no se programa otro seguimiento (§21.2).',
    };
  }
  if (detectarIntencionCompra(mensaje)) {
    return {
      tipo: 'intencion_compra',
      estado: describirEstadoVentaReal('ProductoPaqueteDefinido'),
      nota: 'No se repite el proceso comercial anterior — pasa directo a producto/paquete → total → pago → pedido (§21.3).',
    };
  }
  const objecion = identificarObjecionDocumentada(mensaje);
  if (objecion) {
    return {
      tipo: 'duda_documentada',
      objecionId: objecion.objecionId,
      fuente: objecion.archivo,
      estado: describirEstadoVentaReal('MensajeRecuperacionEnviado'),
      nota: 'Responder amable y específico; no volver a preguntar inmediatamente por la compra (§21.4).',
    };
  }
  return {
    tipo: 'duda_no_autorizada',
    estado: describirEstadoVentaReal('EscaladoHumano'),
    handoff: requiereHandoffHumano(
      'Duda planteada durante recuperación sin conocimiento autorizado que la resuelva.',
      'simulator/src/ventaRealRules.js#identificarObjecionDocumentada'
    ),
  };
}

// =======================================================================
// Integración con persistencia (Fase 3.2)
//
// Patrón fijo para cada punto de entrada persistente: recibir id →
// recuperar contexto (o crear uno nuevo si no existe) → ejecutar la
// función comercial pura ya implementada arriba, sin reescribirla →
// aplicar el resultado sobre el contexto → guardar → devolver la
// respuesta. Ninguna regla de negocio se duplica aquí — estas funciones
// solo leen el resultado ya producido por las funciones puras de arriba
// y lo proyectan sobre los campos correspondientes del contexto.
// =======================================================================

// Fase C.2B: abrirContexto/cerrarContexto y las 8 funciones *Persistente/
// registrarHandoffEnContexto son las únicas 10 funciones de este archivo
// convertidas a async — son exactamente las que tocan contextoStorage.js
// (ahora respaldado por PostgreSQL vía crm/, ver Fase C.1/C.2A). Ninguna
// de las funciones puras de arriba (iniciarConversacion,
// clasificarPrimeraRespuesta, procesarFlujoConsumo, procesarNecesidadYPrecio,
// procesarOfertaYCierre, procesarRespuestaCliente, evaluarRecuperacion,
// procesarRespuestaRecuperacion, crearContextoConversacion,
// requiereHandoffHumano) cambia — no hacen I/O, no fue necesario ni se
// tocaron (ver docs/CRM_FASE_C2_ASYNC_MIGRATION.md).

async function abrirContexto(id) {
  return (await recuperarContexto(id)) ?? { ...crearContextoConversacion(), id };
}

async function cerrarContexto(id, contexto) {
  contexto.ultimaInteraccion = new Date().toISOString();
  await guardarContexto(id, contexto);
  return contexto;
}

export async function iniciarConversacionPersistente(id, mensaje) {
  const contexto = await abrirContexto(id);
  const resultado = iniciarConversacion();
  contexto.estado = resultado.estado.id;
  // Fase Pre-E2E: el primer mensaje del cliente se conserva siempre,
  // incluso cuando es ambiguo — antes solo se guardaba a partir de
  // clasificarPrimeraRespuestaPersistente, dejando el primer mensaje sin
  // persistir cuando el contacto nunca avanzaba más allá del saludo.
  // Hallazgo documentado en docs/FASE_PRECAMPANA_VALIDACION.md §1.
  if (mensaje) contexto.respuestaCliente = mensaje;
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function clasificarPrimeraRespuestaPersistente(id, mensaje) {
  const contexto = await abrirContexto(id);
  const resultado = clasificarPrimeraRespuesta(mensaje);
  contexto.estado = resultado.estado.id;
  contexto.ultimaIntencion = resultado.intencion;
  contexto.respuestaCliente = mensaje;
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function procesarFlujoConsumoPersistente(id, kb, mensaje) {
  const contexto = await abrirContexto(id);
  const resultado = procesarFlujoConsumo(kb, mensaje);
  contexto.estado = resultado.estado.id;
  contexto.respuestaCliente = mensaje;
  if (resultado.productoId) contexto.productoId = resultado.productoId;
  if (resultado.handoff) {
    contexto.handoffPendiente = true;
    contexto.motivoHandoff = resultado.handoff.motivo;
    contexto.fechaHandoff = new Date().toISOString();
  }
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function procesarNecesidadYPrecioPersistente(id, mensajeNecesidad) {
  const contexto = await abrirContexto(id);
  const resultado = procesarNecesidadYPrecio(contexto.productoId, mensajeNecesidad);
  contexto.estado = resultado.estado.id;
  contexto.respuestaCliente = mensajeNecesidad;
  if (resultado.necesidadId) contexto.necesidadId = resultado.necesidadId;
  contexto.testimonioEnviado = !!resultado.necesidadId && !resultado.handoff;
  if (resultado.precio?.disponible) {
    contexto.precioEnviado = true;
    contexto.precioUtilizado = resultado.precio;
  }
  if (resultado.handoff) {
    contexto.handoffPendiente = true;
    contexto.motivoHandoff = resultado.handoff.motivo;
    contexto.fechaHandoff = new Date().toISOString();
  }
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function procesarRespuestaClientePersistente(id, mensaje) {
  const contexto = await abrirContexto(id);
  const resultado = procesarRespuestaCliente(mensaje);
  contexto.estado = resultado.estado.id;
  contexto.ultimaIntencion = resultado.tipo;
  contexto.respuestaCliente = mensaje;
  if (resultado.tipo === 'intencion_compra') {
    contexto.intencionCompra = true;
    if (resultado.cantidad) contexto.cantidad = resultado.cantidad;
  }
  if (resultado.handoff) {
    contexto.handoffPendiente = true;
    contexto.motivoHandoff = resultado.handoff.motivo;
    contexto.fechaHandoff = new Date().toISOString();
  }
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function procesarOfertaYCierrePersistente(id) {
  const contexto = await abrirContexto(id);
  const resultado = procesarOfertaYCierre(contexto.productoId);
  contexto.estado = resultado.estado.id;
  if (resultado.oferta?.disponible) {
    contexto.ofertaEnviada = true;
    contexto.ofertaUtilizada = resultado.oferta;
  }
  if (resultado.cierre) {
    contexto.cierreEnviado = true;
    contexto.cierreUtilizado = resultado.cierre;
  }
  if (resultado.handoff) {
    contexto.handoffPendiente = true;
    contexto.motivoHandoff = resultado.handoff.motivo;
    contexto.fechaHandoff = new Date().toISOString();
  }
  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

export async function procesarRespuestaRecuperacionPersistente(id, mensaje) {
  const contexto = await abrirContexto(id);
  const resultado = procesarRespuestaRecuperacion(mensaje);
  contexto.estado = resultado.estado.id;
  contexto.ramaRecuperacionEjecutada = resultado.tipo;
  contexto.resultadoRecuperacion = resultado.tipo;
  if (mensaje) contexto.respuestaCliente = mensaje;

  // La recuperación termina (deja de estar "pendiente") en toda rama
  // salvo cuando queda una duda por responder o una señal médica —
  // en esos dos casos el proceso sigue esperando la siguiente
  // interacción del cliente (§21.4), no se cierra todavía.
  if (resultado.tipo !== 'duda_documentada' && resultado.tipo !== 'senal_medica') {
    contexto.recuperacionPendiente = false;
  }

  if (resultado.tipo === 'intencion_compra') {
    contexto.intencionCompra = true;
    // No se calcula total ni se inicia pago aquí — mismo bloqueo ya
    // vigente en procesarRespuestaClientePersistente: sin precio real
    // disponible (docs/proceso_de_venta/recursos/precios.md), no se
    // continúa automáticamente hacia producto/paquete → total → pago →
    // pedido. Eso se resuelve en el siguiente paso del flujo, no aquí.
  }

  if (resultado.handoff) {
    contexto.handoffPendiente = true;
    contexto.motivoHandoff = resultado.handoff.motivo;
    contexto.fechaHandoff = new Date().toISOString();
    contexto.recuperacionPendiente = false; // se escaló a humano, ya no es "pendiente automática"
  }

  await cerrarContexto(id, contexto);
  return { contexto, resultado };
}

/**
 * Registra explícitamente un handoff sobre un contexto ya existente, sin
 * tocar ningún otro campo — usado cuando el handoff se detecta fuera de
 * una de las funciones *Persistente de arriba (ej. desde un futuro punto
 * de integración con un canal real).
 */
export async function registrarHandoffEnContexto(id, handoff) {
  const contexto = await abrirContexto(id);
  contexto.handoffPendiente = true;
  contexto.motivoHandoff = handoff.motivo;
  contexto.fechaHandoff = new Date().toISOString();
  await cerrarContexto(id, contexto);
  return contexto;
}
