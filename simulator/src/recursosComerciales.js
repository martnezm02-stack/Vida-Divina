// recursosComerciales.js
// Representa en código el estado real de los recursos comerciales
// documentados en docs/proceso_de_venta/recursos/ — transcripción fiel,
// no reinterpretación. Cada función cita su fuente exacta y nunca
// fabrica contenido: si el recurso está marcado PENDIENTE en su archivo
// fuente, esta función devuelve { disponible: false }, nunca un valor
// inventado. Mismo principio ya aplicado en simulator/src/rules.js.
//
// Por qué vive en código y no se lee en vivo de docs/proceso_de_venta/recursos/:
// mismo motivo documentado en rules.js — el compilador (compiler/src/config.js)
// no tiene extracción estructurada de tablas markdown; solo transcripción
// fiel permite que el motor consulte estos recursos sin leer docs/
// directamente en tiempo de ejecución (regla ya vigente en todo simulator/).

// ---------------------------------------------------------------------
// Audio de explicación — docs/proceso_de_venta/recursos/audio_explicacion.md
// Único audio documentado, usado para cualquier producto (no hay uno
// distinto por producto — confirmado durante la auditoría del Sprint 5).
// ---------------------------------------------------------------------
export function obtenerAudioExplicacion() {
  return {
    disponible: true,
    contenido: {
      resumen:
        'Audio único que explica: tratamiento completo, composición/ingredientes según el producto, funcionamiento, beneficios, forma de toma, duración, expectativa de resultados.',
      preguntaFinal:
        'Me gustaría saber si hay algo específicamente que está buscando mejorar en su salud para yo explicarle cómo el producto le puede ayudar a usted.',
    },
    fuente: 'docs/proceso_de_venta/recursos/audio_explicacion.md',
  };
}

// ---------------------------------------------------------------------
// Testimonios — docs/proceso_de_venta/recursos/testimonios.md
// Las 4 necesidades documentadas explícitamente en la entrevista del
// Sprint 5. Todas PENDIENTE — no existe archivo de video ni transcripción
// real documentada para ninguna.
// ---------------------------------------------------------------------
const TESTIMONIOS_POR_NECESIDAD = {
  diabetes: { disponible: false },
  perdida_de_peso: { disponible: false },
  estrenimiento: { disponible: false },
  colitis: { disponible: false },
};

export function buscarTestimonioPorNecesidad(necesidadId) {
  const entrada = TESTIMONIOS_POR_NECESIDAD[necesidadId];
  if (!entrada || !entrada.disponible) {
    return {
      disponible: false,
      motivo: 'PENDIENTE',
      fuente: 'docs/proceso_de_venta/recursos/testimonios.md',
    };
  }
  return { disponible: true, ...entrada, fuente: 'docs/proceso_de_venta/recursos/testimonios.md' };
}

export function necesidadesDocumentadas() {
  return Object.keys(TESTIMONIOS_POR_NECESIDAD);
}

// ---------------------------------------------------------------------
// Precios — docs/proceso_de_venta/recursos/precios.md
// Catálogo real de 8 productos, precio proporcionado directamente por el
// propietario (Fase Pre-E2E, 2026-08-14) — no se inventa ninguna cifra.
// Cualquier producto fuera de esta lista permanece PENDIENTE.
// ---------------------------------------------------------------------
const CATALOGO_PRECIOS = {
  'productos/01-control-de-peso/tedivina': {
    precio: 1600, moneda: 'MXN', categoriaComercial: 'digestion', descripcionComercial: 'Digestión saludable',
  },
  'productos/02-cafe-divina/black': {
    precio: 750, moneda: 'MXN', categoriaComercial: 'digestion', descripcionComercial: 'Café digestivo',
  },
  'productos/01-control-de-peso/sculpt-max': {
    precio: 1750, moneda: 'MXN', categoriaComercial: 'digestion', descripcionComercial: 'Bienestar digestivo',
  },
  'productos/02-cafe-divina/sculpt-black': {
    precio: 1600, moneda: 'MXN', categoriaComercial: 'control_de_peso', descripcionComercial: 'Control de peso',
  },
  'productos/07-rendimiento-fisico/ripped-capsules': {
    precio: 1600, moneda: 'MXN', categoriaComercial: 'control_de_peso', descripcionComercial: 'Quema de grasa',
  },
  'productos/03-longevidad-bienestar/reishi-capsules': {
    precio: 1600, moneda: 'MXN', categoriaComercial: 'bienestar_energia', descripcionComercial: 'Bienestar integral y Energía',
  },
  'productos/08-intimidad-libido/mars-capsules': {
    precio: 1600, moneda: 'MXN', categoriaComercial: 'bienestar_energia', descripcionComercial: 'Energía masculina',
  },
  'productos/02-cafe-divina/tongkat-ali-cafe': {
    precio: 750, moneda: 'MXN', categoriaComercial: 'bienestar_energia', descripcionComercial: 'Vitalidad diaria / Energía y vitalidad',
  },
};

export function obtenerPrecioProducto(productoId) {
  const entrada = CATALOGO_PRECIOS[productoId];
  if (!entrada) {
    return {
      disponible: false,
      motivo: 'PENDIENTE',
      fuente: 'docs/proceso_de_venta/recursos/precios.md',
    };
  }
  return { disponible: true, ...entrada, fuente: 'docs/proceso_de_venta/recursos/precios.md' };
}

// ---------------------------------------------------------------------
// Ofertas — docs/proceso_de_venta/recursos/ofertas.md
// Solo Té Divina tiene oferta real documentada.
// ---------------------------------------------------------------------
const OFERTA_TEDIVINA = {
  disponible: true,
  texto:
    'Asegura tu tratamiento completo (42 días) en las próximas 48 horas y recibe: ' +
    'Envío gratis. Pago bajo anticipado. Últimos disponibles.',
};

export function obtenerOfertaProducto(productoId) {
  if (productoId === 'productos/01-control-de-peso/tedivina') {
    return { ...OFERTA_TEDIVINA, fuente: 'docs/proceso_de_venta/recursos/ofertas.md' };
  }
  return { disponible: false, motivo: 'PENDIENTE', fuente: 'docs/proceso_de_venta/recursos/ofertas.md' };
}

// ---------------------------------------------------------------------
// Cierres — docs/proceso_de_venta/recursos/cierres.md
// Té Divina: audio específico. Cualquier otro producto: cierre textual
// genérico. Ambos con contenido real documentado — nada pendiente aquí.
// ---------------------------------------------------------------------
export function obtenerCierre(productoId) {
  if (productoId === 'productos/01-control-de-peso/tedivina') {
    return {
      disponible: true,
      tipo: 'audio',
      preguntaFinal: '¿Tiene alguna pregunta o le gustaría comenzar con uno de los paquetes?',
      fuente: 'docs/proceso_de_venta/recursos/cierres.md',
    };
  }
  return {
    disponible: true,
    tipo: 'texto',
    mensaje: '¿Tiene alguna otra pregunta o le gustaría comenzar con algunos de los paquetes?',
    fuente: 'docs/proceso_de_venta/recursos/cierres.md',
  };
}

// ---------------------------------------------------------------------
// Respuestas rápidas de pago — docs/proceso_de_venta/recursos/respuestas_rapidas_pago.md
// Existencia confirmada, texto literal no documentado — ambas PENDIENTE.
// ---------------------------------------------------------------------
export function obtenerRespuestaRapidaPago(tipo) {
  if (tipo !== 'cuenta' && tipo !== 'link') {
    throw new Error(`Tipo de respuesta rápida de pago desconocido: "${tipo}". Válidos: "cuenta", "link".`);
  }
  return {
    disponible: false,
    motivo: 'PENDIENTE',
    fuente: 'docs/proceso_de_venta/recursos/respuestas_rapidas_pago.md',
  };
}
