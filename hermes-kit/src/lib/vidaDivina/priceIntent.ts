// priceIntent.ts — Detección DETERMINISTA de intención de precio
// (hallazgo real 2026-09-11): ante "¿Cuánto cuestan las cápsulas Reishi?"
// el LLM llamó a buscarProductos (solo lista nombres, nunca trae precio)
// en vez de consultarProducto (la única fuente real de precio/presentación
// del catálogo) -- respondió sin precio. Esta capa es una red de
// seguridad determinista, mismo espíritu que purchaseIntent.ts: para
// peticiones de precio/costo/promoción inequívocas, el dato real se
// resuelve en código ANTES de llamar al LLM y se le entrega ya
// verificado -- nunca depende solo de que el modelo elija bien la tool.
//
// No sustituye a consultarProducto como tool: el LLM sigue pudiendo (y
// debe poder) llamarla también; esto es un refuerzo, no un reemplazo.
// Nunca hardcodea un producto concreto -- funciona igual para cualquiera.

import type { IdiomaConversacion } from "./languageDetection";

const PRICE_PHRASES = [
  "cu[aá]nto\\s+(cuesta[n]?|vale[n]?|sale[n]?)",
  "qu[eé]\\s+precio",
  "precio\\s+(de|tiene[n]?|del|real)?",
  "costo\\s+(de|del|real)?",
  "promoci[oó]n(es)?",
  "\\bpromo\\b",
];

const PRICE_INTENT_REGEX = new RegExp(PRICE_PHRASES.join("|"), "i");

/** true si el texto expresa con claridad que se pide precio/costo/promoción. */
export function detectarIntencionPrecio(texto: string): boolean {
  if (!texto) return false;
  return PRICE_INTENT_REGEX.test(texto);
}

// Mismas frases de precio + ruido conversacional común -- se usa SOLO como
// fallback cuando la búsqueda con el texto completo no encuentra nada
// (getProductKnowledge/searchKnowledge exige que las palabras del texto
// coincidan con el título/keywords reales del producto; una frase larga
// llena de palabras ajenas al producto puede impedir el match aunque el
// nombre del producto sí esté presente, ej. "¿Cuánto cuesta Ripped?" no
// resuelve solo, pero "Ripped" sí).
const RUIDO_REGEX = new RegExp(
  PRICE_PHRASES.join("|") +
    "|\\b(hola|oye|amigo|ay[uú]dame|por\\s*favor|dime|d[ií]game|me|puedes|podr[ií]as|pasar(me)?|informaci[oó]n|cu[aá]l|hay|el|la|los|las|de|del|un|una|es|son|tiene|tienen)\\b",
  "gi"
);

/** Quita la pregunta de precio y ruido conversacional, dejando solo el nombre del producto. */
export function textoSinRuidoDePrecio(texto: string): string {
  return texto
    .replace(/[¿?¡!]/g, " ")
    .replace(RUIDO_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// construirRefuerzoPrecio (2026-09-12, "Idioma + Nombre visible"): el
// bloque de refuerzo determinista de precio que handler.ts inyecta en
// memoryContext estaba SIEMPRE en español, sin importar el idioma real de
// la conversación -- causa raíz confirmada, competía directamente contra
// la instrucción de idioma del system prompt en cada pregunta de precio.
// Extraído a función pura (testable, sin tocar la lógica de detección de
// intención de precio de arriba) -- el precio/monto real NUNCA se traduce
// ni se recalcula aquí, solo cambia el idioma de la INSTRUCCIÓN que lo
// acompaña.
export function construirRefuerzoPrecio(
  language: IdiomaConversacion,
  datos: { titulo: string; precioFormateado: string | null; cantidadBase: string | null }
): string {
  if (language === "en") {
    const precio = datos.precioFormateado ?? "no price on file yet, do not invent one";
    const presentacion = datos.cantidadBase ? `, real presentation = ${datos.cantidadBase}` : "";
    return `\n\nVERIFIED PRICE DATA for this turn (product "${datos.titulo}"): real price = ${precio}${presentacion}. If you mention price, use this exact figure literally, always in Mexican pesos (never dollars, never a thousands dot). If you mention the presentation and it comes as "Container / Detail" (e.g. "Bag / 20 individual sachets"), say "a {container} with {detail}", never "presentation of X".`;
  }
  const precio = datos.precioFormateado ?? "no hay precio registrado todavía, no inventes uno";
  const presentacion = datos.cantidadBase ? `, presentación real = ${datos.cantidadBase}` : "";
  return `\n\nDATO DE PRECIO YA VERIFICADO para este turno (producto "${datos.titulo}"): precio real = ${precio}${presentacion}. Si respondes sobre precio, usa este precioFormateado tal cual, literal, siempre en pesos mexicanos (nunca en dólares, nunca con punto de miles). Si mencionas la presentación y viene como "Contenedor / Detalle" (ej. "Bolsa / 20 sobres individuales"), exprésala como "un/una {contenedor} con {detalle}" (ej. "una bolsa con 20 sobres individuales"), nunca como "presentación de X".`;
}
