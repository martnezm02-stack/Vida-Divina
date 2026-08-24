// stateMachine.js
// Transcripción fiel del modelo de estados documentado en
// docs/proceso_de_venta/estados_del_cliente.md — los 10 estados, cómo se
// detectan, qué módulo consulta el asesor en ese estado, y las
// transiciones válidas. No es una interpretación: cada campo cita la
// sección exacta de la que proviene.
//
// Por qué está transcrito en vez de leído en vivo del Markdown: el
// Knowledge Compiler (Sprint 2) compiló la ENTIDAD "estado_cliente" como
// metadato (id, título, checksum, referencias), pero no extrajo el
// contenido estructurado de cada estado (definición, transiciones) —
// porque esa extracción de contenido no está definida en
// docs/KNOWLEDGE_MODEL.md como responsabilidad del compilador. Es,
// literalmente, un "campo faltante" que este sprint debe reportar, no
// resolver — ver missingFieldsTracker.js y docs/CONVERSATION_SIMULATOR.md.

export const ESTADOS = {
  Nuevo: {
    id: 'Nuevo',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#1-nuevo',
    moduloPrioritario: 'conversaciones/primer_contacto + calificacion_del_cliente',
    transicionesValidas: ['EnDescubrimiento'],
  },
  EnDescubrimiento: {
    id: 'EnDescubrimiento',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#2-en-descubrimiento',
    moduloPrioritario: 'conversaciones/descubrimiento + descubrimiento.md',
    transicionesValidas: ['PerfilIdentificado'],
  },
  PerfilIdentificado: {
    id: 'PerfilIdentificado',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#3-perfil-identificado',
    moduloPrioritario: 'docs/clientes/<perfil>',
    transicionesValidas: ['ProductoRecomendado'],
  },
  ProductoRecomendado: {
    id: 'ProductoRecomendado',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#4-producto-recomendado',
    moduloPrioritario: 'esperar señal del cliente (Tabla 3 de reglas_de_decision.md)',
    transicionesValidas: ['ObjecionDetectada', 'Evaluando', 'VentaCerrada'],
  },
  ObjecionDetectada: {
    id: 'ObjecionDetectada',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#5-objecion-detectada',
    moduloPrioritario: 'docs/objeciones/ + manejo_de_objeciones.md',
    transicionesValidas: ['Evaluando', 'ProductoRecomendado', 'ProspectoDeEmprendimiento'],
  },
  Evaluando: {
    id: 'Evaluando',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#6-evaluando',
    moduloPrioritario: 'seguimiento.md',
    transicionesValidas: ['EnSeguimiento'],
  },
  VentaCerrada: {
    id: 'VentaCerrada',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#7-venta-cerrada',
    moduloPrioritario: 'conversaciones/cierre + postventa.md',
    transicionesValidas: ['ClienteRecurrente'],
  },
  EnSeguimiento: {
    id: 'EnSeguimiento',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#8-en-seguimiento',
    moduloPrioritario: 'seguimiento.md (tabla de tiempos)',
    transicionesValidas: ['ProductoRecomendado', 'ObjecionDetectada', 'VentaCerrada'],
  },
  ClienteRecurrente: {
    id: 'ClienteRecurrente',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#9-cliente-recurrente',
    moduloPrioritario: 'postventa.md',
    transicionesValidas: ['EnDescubrimiento', 'ProspectoDeEmprendimiento'],
  },
  ProspectoDeEmprendimiento: {
    id: 'ProspectoDeEmprendimiento',
    fuente: 'docs/proceso_de_venta/estados_del_cliente.md#10-prospecto-de-emprendimiento',
    moduloPrioritario: 'docs/clientes/emprendimiento.md + conversaciones/emprendimiento',
    transicionesValidas: [],
  },
};

export function describirEstado(estadoId) {
  return ESTADOS[estadoId] ?? null;
}

// ---------------------------------------------------------------------
// Estados del proceso comercial real (Sprint 5).
// Fuente: docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md.
// Coexisten con los 10 estados de arriba (embudo genérico,
// docs/proceso_de_venta/estados_del_cliente.md) sin reemplazarlos — no es
// una segunda state machine, es una extensión aditiva del mismo módulo
// para el flujo que SPRINT_5_PROCESO_COMERCIAL.md documenta como el
// proceso real vigente. Se agregan bajo un objeto separado, no dentro de
// ESTADOS, porque describen un dominio distinto (recursos/pago/envío,
// no perfil/producto) y mezclarlos habría violado la regla de este mismo
// archivo de "un estado, una definición clara" — ver
// docs/proceso_de_venta/reglas_de_decision.md, nota de compatibilidad.
// ---------------------------------------------------------------------
export const ESTADOS_VENTA_REAL = {
  MensajeInicialEnviado: { id: 'MensajeInicialEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §3', transicionesValidas: ['IntencionClasificada'] },
  IntencionClasificada: { id: 'IntencionClasificada', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §3', transicionesValidas: ['ProductoIdentificado', 'FueraDeAlcanceDistribucion'] },
  FueraDeAlcanceDistribucion: { id: 'FueraDeAlcanceDistribucion', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §2', transicionesValidas: [] },
  ProductoIdentificado: { id: 'ProductoIdentificado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §4.1', transicionesValidas: ['AudioExplicacionEnviado'] },
  AudioExplicacionEnviado: { id: 'AudioExplicacionEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §4.2', transicionesValidas: ['NecesidadIdentificada'] },
  NecesidadIdentificada: { id: 'NecesidadIdentificada', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §5', transicionesValidas: ['TestimonioEnviado', 'PrecioEnviado'] },
  TestimonioEnviado: { id: 'TestimonioEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §6', transicionesValidas: ['PrecioEnviado'] },
  PrecioEnviado: { id: 'PrecioEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §7', transicionesValidas: ['OfertaEnviada'] },
  OfertaEnviada: { id: 'OfertaEnviada', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §8', transicionesValidas: ['CierreEnviado'] },
  CierreEnviado: { id: 'CierreEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §9', transicionesValidas: ['EsperandoDecision'] },
  EsperandoDecision: { id: 'EsperandoDecision', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §9', transicionesValidas: ['ProductoPaqueteDefinido', 'EnVentanaRecuperacion', 'EscaladoHumano'] },
  ProductoPaqueteDefinido: { id: 'ProductoPaqueteDefinido', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §10', transicionesValidas: ['TotalCalculado'] },
  TotalCalculado: { id: 'TotalCalculado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §10-11', transicionesValidas: ['PagoEnProceso'] },
  PagoEnProceso: { id: 'PagoEnProceso', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §11-12', transicionesValidas: ['PedidoProcesado'] },
  PedidoProcesado: { id: 'PedidoProcesado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §12,14', transicionesValidas: ['Enviado'] },
  Enviado: { id: 'Enviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §15', transicionesValidas: ['SeguimientoDia3Enviado'] },
  SeguimientoDia3Enviado: { id: 'SeguimientoDia3Enviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §16.1', transicionesValidas: ['EsperandoInterencionHumana'] },
  EsperandoInterencionHumana: { id: 'EsperandoInterencionHumana', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §16.1', transicionesValidas: ['SeguimientoSemanaEnviado'] },
  SeguimientoSemanaEnviado: { id: 'SeguimientoSemanaEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §16.2', transicionesValidas: ['FinSeguimiento'] },
  FinSeguimiento: { id: 'FinSeguimiento', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §16.2', transicionesValidas: [] },
  EnVentanaRecuperacion: { id: 'EnVentanaRecuperacion', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §19', transicionesValidas: ['MensajeRecuperacionEnviado', 'RecuperacionCancelada'] },
  RecuperacionCancelada: { id: 'RecuperacionCancelada', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §19', transicionesValidas: [] },
  MensajeRecuperacionEnviado: { id: 'MensajeRecuperacionEnviado', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §20', transicionesValidas: ['RecuperacionFinalizada', 'ProductoPaqueteDefinido', 'EscaladoHumano'] },
  RecuperacionFinalizada: { id: 'RecuperacionFinalizada', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §21.1-21.2', transicionesValidas: [] },
  EscaladoHumano: { id: 'EscaladoHumano', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §22', transicionesValidas: [] },
};

export function describirEstadoVentaReal(estadoId) {
  return ESTADOS_VENTA_REAL[estadoId] ?? null;
}
