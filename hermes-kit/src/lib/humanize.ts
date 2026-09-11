// ============================================================
// Humanización de las respuestas del agente.
// 1) saneaHumano: quita los símbolos que delatan a una IA y que en WhatsApp
//    se ven raros o ni se renderizan (guiones largos, negritas markdown,
//    comillas tipográficas, viñetas, "…"). Escribe como una persona en el móvil.
// 2) dividirMensajes: parte la respuesta en varios mensajes cuando el modelo
//    lo indica con "|||", para adaptarse a quien escribe a ráfagas.
// Añadido 2026-07-07. No forma parte del kit base.
// ============================================================

// Separador que el modelo usa para indicar "esto va en mensajes separados".
export const MSG_SEP = "|||";

const MAX_MENSAJES = 5; // tope de seguridad: nunca spamear con más trozos

/**
 * Limpia una cadena para que suene a persona escribiendo por WhatsApp.
 * No toca enlaces ni emails (no contienen estos símbolos).
 */
export function saneaHumano(text: string): string {
  let t = text;

  // Guiones largos/medios → coma (inciso natural en español)
  t = t.replace(/\s*[—–]\s*/g, ", ");
  // Flechas (restos de estructura del prompt) → espacio
  t = t.replace(/\s*[→←➡️]\s*/g, " ");
  // Viñetas centradas / backticks → fuera
  t = t.replace(/[·•`]/g, "");
  // Negrita/cursiva markdown (** o *): el texto sí, los asteriscos no
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");
  // Encabezados o restos markdown al principio de línea
  t = t.replace(/^\s*#{1,6}\s*/gm, "");
  // Viñetas al inicio de línea (-, •, *) → nada
  t = t.replace(/^\s*[-•*]\s+/gm, "");
  // Comillas tipográficas → rectas (por punto de código, para no depender del literal)
  t = t.replace(/[“”„‟«»]/g, '"').replace(/[‘’‚‛]/g, "'");
  // Puntos suspensivos elegantes → tres puntos de teclado
  t = t.replace(/…/g, "...");
  // Comas duplicadas por la sustitución de guiones
  t = t.replace(/\s+,/g, ",").replace(/,\s*,/g, ",");
  // Espacios múltiples y limpieza por línea
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
  // Colapsar 3+ saltos de línea a 2
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

/**
 * Divide la respuesta en varios mensajes usando el separador MSG_SEP.
 * Cada trozo se sanea. Si no hay separador, devuelve un único mensaje.
 * Respeta un máximo: los trozos sobrantes se unen al último.
 */
export function dividirMensajes(text: string): string[] {
  const bruto = text
    .split(MSG_SEP)
    .map((p) => saneaHumano(p))
    .filter((p) => p.length > 0);

  if (bruto.length <= 1) return bruto.length === 1 ? bruto : [saneaHumano(text)].filter(Boolean);

  if (bruto.length > MAX_MENSAJES) {
    const cabeza = bruto.slice(0, MAX_MENSAJES - 1);
    const resto = bruto.slice(MAX_MENSAJES - 1).join(" ");
    return [...cabeza, resto];
  }
  return bruto;
}

/**
 * Retardo (ms) para simular que se escribe el mensaje: proporcional a su
 * longitud, con un mínimo y un máximo razonables para no aburrir.
 */
export function delayEscritura(mensaje: string): number {
  return Math.min(700 + mensaje.length * 30, 3500);
}

// Límite específico para TTS (2026-09-11), INDEPENDIENTE de MAX_MENSAJES
// (que limita burbujas de TEXTO). Voice Engine YA segmenta de forma segura
// y validada cualquier texto largo (ver voice-engine/app/services/
// text_segmentation.py#segmentar_texto_seguro -- nunca corta a mitad de
// oración, conserva cierres cortos como "¿de acuerdo?" con la frase
// anterior) -- esto NO se duplica aquí. Lo que falta es un límite ANTERIOR,
// del lado de Hermes: una respuesta larga igual se generaría como una nota
// de voz larga (varios segmentos concatenados), lo cual dejaría de sonar a
// nota de voz natural de WhatsApp y mantendría ocupado el único worker
// serial del Voice Engine (ThreadPoolExecutor(max_workers=1) en
// tts_service.py) más tiempo del razonable. Este límite NUNCA trunca el
// texto: solo decide si conviene generarlo como voz o si es mejor como
// mensajes de texto (que sí entregan la respuesta completa, sin recortar
// nada). 120 palabras ~ 66s estimados a la tasa real medida en Voice Engine
// (0.55s/palabra, ver text_segmentation.py) -- deliberadamente conservador,
// bien por debajo del límite duro de seguridad del motor (28s POR
// SEGMENTO, no de la respuesta completa).
const TTS_MAX_PALABRAS = 120;

/** true si `texto` es razonable para generarse como UNA nota de voz natural. Nunca trunca -- solo informa la decisión formato voz/texto. */
export function aptoParaNotaDeVoz(texto: string): boolean {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).length;
  return palabras > 0 && palabras <= TTS_MAX_PALABRAS;
}
