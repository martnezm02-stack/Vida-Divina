// languageDetection.ts — detección DETERMINISTA de idioma por mensaje
// (FASE "Idioma de la conversación", 2026-09-12). Nunca usa el LLM: es
// puramente local (listas de palabras + señales de acentos/¿/¡), rápida,
// sin dependencias externas. Reemplaza la regla rígida anterior
// ("responde siempre en español") por una decisión real turno a turno.
//
// Deliberadamente conservador con la ambigüedad: un mensaje sin señales
// claras (corto, un nombre propio, "ok", un emoji suelto...) NUNCA cambia
// el idioma de la conversación por su cuenta -- conserva el idioma previo
// (ver detectarIdioma, parámetro `idiomaPrevio`). Evita que "Ripped" o
// "Reishi" (sin ninguna palabra española/inglesa alrededor) volteen el
// idioma de una conversación en español sin motivo real.

export type IdiomaConversacion = "es" | "en";

const PALABRAS_ES = new Set([
  "hola", "buenas", "buenos", "dias", "tardes", "noches", "gracias", "porfavor", "favor",
  "que", "como", "cuanto", "cuanta", "cuantos", "cuantas", "cuesta", "cuestan", "vale", "valen",
  "precio", "precios", "costo", "costos", "quiero", "quisiera", "necesito", "tienes", "tiene",
  "tienen", "hay", "para", "pero", "muy", "mas", "menos", "si", "no", "el", "la", "los", "las",
  "un", "una", "unos", "unas", "de", "del", "en", "es", "son", "esta", "estan", "soy", "eres",
  "y", "o", "me", "te", "se", "mi", "tu", "su", "este", "esta", "eso", "esa", "donde", "cuando",
  "porque", "tambien", "ahora", "hoy", "mañana", "ayer", "comprar", "pedido", "producto",
  "productos", "capsulas", "cual", "cuales", "quien", "puedo", "puedes", "pasar", "pasarme",
  "dame", "dime", "amigo", "amiga", "buen", "buena", "informacion", "numero", "cuenta",
]);

const PALABRAS_EN = new Set([
  "hello", "hi", "hey", "thanks", "thank", "please", "what", "how", "much", "many", "does",
  "do", "did", "is", "are", "was", "were", "the", "a", "an", "and", "or", "cost", "costs",
  "price", "prices", "want", "would", "need", "have", "has", "had", "there", "for", "with",
  "without", "but", "very", "more", "less", "yes", "no", "this", "that", "these", "those",
  "where", "when", "because", "also", "now", "today", "tomorrow", "yesterday", "buy", "order",
  "product", "products", "capsules", "you", "your", "i", "my", "me", "can", "could", "will",
  "shall", "of", "to", "in", "on", "at", "it", "he", "she", "they", "we", "us", "info",
  "information", "account", "number", "friend",
]);

// Sin estas señales, un mensaje sin ninguna palabra reconocida (0 puntos en
// ambas listas) se considera AMBIGUO -- conserva el idioma previo, nunca
// asume.
const UMBRAL_MINIMO_SENALES = 1;

function tokenizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos SOLO para el match de la lista (la señal de acento ya se contó aparte, ver abajo)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Detecta el idioma (es/en) del ÚLTIMO mensaje real del cliente. Determinista,
 * local, sin llamadas a ningún LLM ni servicio externo.
 *
 * `idiomaPrevio`: idioma ya conocido de esta conversación (o "es" si es la
 * primera vez / desconocido). Un mensaje ambiguo (sin señales suficientes,
 * o empate exacto entre señales de ambos idiomas) SIEMPRE devuelve
 * `idiomaPrevio` tal cual -- nunca cambia el idioma de la conversación sin
 * evidencia real.
 */
export function detectarIdioma(texto: string, idiomaPrevio: IdiomaConversacion = "es"): IdiomaConversacion {
  if (!texto || !texto.trim()) return idiomaPrevio;

  const original = texto.toLowerCase();
  // Señal fuerte: acentos españoles, ñ, ¿, ¡ -- prácticamente inexistentes
  // en inglés real (más peso que una sola palabra de la lista).
  const tieneSenalEspanolaFuerte = /[ñáéíóúü¿¡]/.test(original);

  let puntosEs = tieneSenalEspanolaFuerte ? 2 : 0;
  let puntosEn = 0;
  for (const token of tokenizar(texto)) {
    if (PALABRAS_ES.has(token)) puntosEs++;
    if (PALABRAS_EN.has(token)) puntosEn++;
  }

  const totalSenales = puntosEs + puntosEn;
  if (totalSenales < UMBRAL_MINIMO_SENALES) return idiomaPrevio; // ambiguo -- conservar
  if (puntosEs === puntosEn) return idiomaPrevio; // empate -- conservar

  return puntosEs > puntosEn ? "es" : "en";
}

/** Idioma efectivo real de una conversación ya existente: NULL/vacío -> "es" (fallback compatible con conversaciones anteriores a esta fase). */
export function idiomaEfectivo(languageColumna: string | null | undefined): IdiomaConversacion {
  return languageColumna === "en" ? "en" : "es";
}
