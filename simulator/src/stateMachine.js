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
