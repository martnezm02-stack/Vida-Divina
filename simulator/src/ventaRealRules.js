// ventaRealRules.js
// Transcripción fiel de las señales de texto necesarias para ejecutar el
// proceso comercial real documentado en
// docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md. Mismo principio que
// simulator/src/rules.js: la coincidencia de texto es una necesidad de
// implementación de cualquier simulador sin IA, no conocimiento de negocio
// nuevo — cada patrón cita la sección exacta que transcribe.

// ---------------------------------------------------------------------
// Clasificación inicial: consumo vs. distribución — fuente:
// SPRINT_5_PROCESO_COMERCIAL.md §3
// ---------------------------------------------------------------------
export const SENAL_DISTRIBUCION = {
  fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §2 (Fuera de alcance) + §3',
  patrones: [/distribui/i, /oportunidad de negocio/i, /ser distribuidor/i, /vender (yo|tambi[ée]n)/i],
};

export const SENAL_CONSUMO = {
  fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §3-4.1',
  patrones: [/producto/i, /comprar/i, /interesa/i, /quiero/i, /me gustar[ií]a/i],
};

/**
 * @returns {'consumo'|'distribucion'|'ambiguo'}
 */
export function clasificarIntencionInicial(mensaje) {
  const esDistribucion = SENAL_DISTRIBUCION.patrones.some((p) => p.test(mensaje));
  const esConsumo = SENAL_CONSUMO.patrones.some((p) => p.test(mensaje));
  if (esDistribucion && !esConsumo) return 'distribucion';
  if (esConsumo && !esDistribucion) return 'consumo';
  if (esConsumo && esDistribucion) return 'ambiguo'; // ambos mencionados — requiere aclarar, no se asume
  return 'ambiguo';
}

// ---------------------------------------------------------------------
// Necesidades documentadas — fuente: SPRINT_5_PROCESO_COMERCIAL.md §5-6.
// Solo las 4 mencionadas explícitamente durante la entrevista. Cualquier
// otra necesidad manifestada no coincide con ninguna aquí — el motor no
// debe inventar una equivalencia.
// ---------------------------------------------------------------------
export const SENALES_NECESIDAD = [
  { necesidadId: 'diabetes', patrones: [/diabetes/i, /diab[ée]tic/i, /az[uú]car en (la )?sangre/i] },
  { necesidadId: 'perdida_de_peso', patrones: [/bajar de peso/i, /perder peso/i, /adelgazar/i] },
  { necesidadId: 'estrenimiento', patrones: [/estre[ñn]imiento/i, /estre[ñn]id[oa]/i] },
  { necesidadId: 'colitis', patrones: [/colitis/i] },
];

export function detectarNecesidad(mensaje) {
  for (const senal of SENALES_NECESIDAD) {
    if (senal.patrones.some((p) => p.test(mensaje))) return senal.necesidadId;
  }
  return null; // no inventar una necesidad no documentada
}

// ---------------------------------------------------------------------
// Identificación de producto de interés — se resuelve contra los
// productos ya compilados en knowledge/compiled/ (kb.entitiesByType.producto),
// nunca contra una lista hardcodeada — fuente: SPRINT_5_PROCESO_COMERCIAL.md §4.1.
// ---------------------------------------------------------------------
function normalizarCompacto(texto) {
  // Minúsculas, sin acentos, sin espacios ni puntuación — permite que
  // "Té Divina" (mensaje del cliente) coincida con el título compilado
  // "TéDivina" (sin espacio) sin depender de que el cliente escriba el
  // nombre exactamente igual al catálogo.
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {Object} kb - resultado de knowledgeLoader.loadCompiledKnowledge()
 * @param {string} mensaje
 * @returns {Object|null} entidad de producto, o null si no se identifica ninguno
 */
export function identificarProducto(kb, mensaje) {
  const mensajeCompacto = normalizarCompacto(mensaje);
  const productos = kb.entitiesByType.producto ?? [];
  for (const producto of productos) {
    const tituloCompacto = normalizarCompacto(producto.titulo);
    if (tituloCompacto && mensajeCompacto.includes(tituloCompacto)) {
      return producto;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Intención de compra directa (con o sin cantidad) — fuente:
// SPRINT_5_PROCESO_COMERCIAL.md §10-11
// ---------------------------------------------------------------------
export const SENAL_INTENCION_COMPRA = {
  fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §10-11',
  patrones: [/quiero comprar/i, /quiero (\d+|un|una|dos|tres)/i, /me lo llevo/i, /c[oó]mo (le hago para )?comprar/i],
};

export function detectarIntencionCompra(mensaje) {
  return SENAL_INTENCION_COMPRA.patrones.some((p) => p.test(mensaje));
}

/** Extrae una cantidad mencionada en el mensaje, si existe — nunca infiere una por defecto. */
const PALABRAS_A_NUMERO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
export function extraerCantidad(mensaje) {
  const numerico = mensaje.match(/\b(\d+)\b/);
  if (numerico) return parseInt(numerico[1], 10);
  const palabra = mensaje.match(/\b(un|una|uno|dos|tres|cuatro|cinco)\b/i);
  if (palabra) return PALABRAS_A_NUMERO[palabra[1].toLowerCase()] ?? null;
  return null;
}

// ---------------------------------------------------------------------
// "Lo voy a pensar" — fuente: SPRINT_5_PROCESO_COMERCIAL.md §21.2
// ---------------------------------------------------------------------
export const SENAL_LO_VOY_A_PENSAR = {
  fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §21.2',
  patrones: [/lo voy a pensar/i, /d[ée]jame pensarlo/i, /despu[ée]s te digo/i, /te aviso/i],
};

export function esLoVoyAPensar(mensaje) {
  return SENAL_LO_VOY_A_PENSAR.patrones.some((p) => p.test(mensaje));
}

// ---------------------------------------------------------------------
// Objeciones ya documentadas en docs/objeciones/ — usadas como
// conocimiento de apoyo (nunca como máquina de estados del flujo
// principal — ver nota en docs/proceso_de_venta/reglas_de_decision.md).
// Si el mensaje no coincide con ninguna, se trata como duda no cubierta
// por conocimiento autorizado → handoff (ver flujoVentaReal.js).
// ---------------------------------------------------------------------
export const OBJECIONES_DOCUMENTADAS = [
  { objecionId: 'esta_caro', patrones: [/est[aá] car[oa]/i, /se me hace mucho/i, /vi m[aá]s barato/i], archivo: 'docs/objeciones/esta_caro.md' },
  { objecionId: 'no_creo_en_suplementos', patrones: [/no creo en (los )?suplementos/i, /es puro placebo/i], archivo: 'docs/objeciones/no_creo_en_suplementos.md' },
  { objecionId: 'no_tengo_dinero', patrones: [/no tengo dinero/i, /ando cort[oa]/i], archivo: 'docs/objeciones/no_tengo_dinero.md' },
];

export function identificarObjecionDocumentada(mensaje) {
  for (const objecion of OBJECIONES_DOCUMENTADAS) {
    if (objecion.patrones.some((p) => p.test(mensaje))) return objecion;
  }
  return null;
}
