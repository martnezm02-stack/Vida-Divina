// purchaseIntent.ts — Detección DETERMINISTA de intención de compra clara
// y confirmada (FASE "Corregir handoff de compra + bloquear fuga interna",
// 2026-09-08).
//
// Hallazgo real: el modelo puede, en vez de ejecutar `derivarHumano`,
// narrar su propia instrucción de sistema al cliente ("según las reglas,
// debo derivar..."). Esta capa es una red de seguridad determinista que
// NO depende de que el LLM decida llamar la tool -- para las frases de
// compra MÁS inequívocas, el handoff se dispara desde el código, siempre.
//
// No sustituye el criterio del LLM: sigue pudiendo derivar por su cuenta
// (vía la tool `derivarHumano`) en casos más matizados que este regex no
// cubre -- ambos caminos terminan en el MISMO núcleo real
// (`tools/derivar-humano.ts#ejecutarHandoffReal`), con idempotencia real
// en `crmClient.ts#handoffToHuman` para nunca duplicar el handoff/la alerta.
//
// Deliberadamente conservador: nunca debe confundirse con una PREGUNTA
// sobre el proceso ("¿cómo se realiza el envío?", "¿cómo hago mi
// pedido?") -- esas NO son intención de compra confirmada, solo dudas
// sobre el proceso (ver prompts/negocio.md, regla "Preguntas sobre
// pedido/envío/pago").

import type { IdiomaConversacion } from "./languageDetection";

const NEGACION_CERCA = /\bno\b[^.!?]{0,15}(comprar|iniciar|pedido|adquirir)/i;

const FRASES_COMPRA_CLARA = [
  "quiero comprar(lo|la)?",
  "quiero pedir(lo|la)?\\s*m[aá]s",
  "m[aá]ndame el pedido",
  "ya lo prob[eé],?\\s*quiero m[aá]s",
  "s[ií],?\\s*quiero iniciar",
  "quiero iniciar\\b",
  "c[oó]mo (lo )?compro\\b",
  "d[ií]game c[oó]mo comprar",
  "c[oó]mo comprarlo",
  "c[oó]mo lo adquiero",
  "quiero adquirirlo",
];

const INTENCION_COMPRA_CLARA = new RegExp(FRASES_COMPRA_CLARA.join("|"), "i");

/**
 * true SOLO si el texto contiene una frase de compra inequívoca y
 * confirmada (nunca una simple pregunta sobre el proceso). Falsos
 * negativos son aceptables (el LLM sigue pudiendo derivar por su cuenta);
 * falsos positivos NO -- por eso la lista es corta y literal, no genérica.
 */
export function detectarIntencionCompraClara(texto: string): boolean {
  if (!texto) return false;
  if (NEGACION_CERCA.test(texto)) return false;
  return INTENCION_COMPRA_CLARA.test(texto);
}

// Métodos de pago reales que SÍ deben derivar (nunca autónomos hoy) --
// única definición real, reutilizada tanto por `detectarSolicitudPago` (de
// abajo) como por el guard determinista de `tools/derivar-humano.ts`.
export const METODO_NO_SOPORTADO_RE = /\b(oxxo|tarjeta|efectivo|mercado\s*pago|paypal|d[ée]bito|cr[ée]dito)\b/i;

// ============================================================
// Solicitud de pago (Fase "Hacer determinista el flujo de transferencia",
// 2026-09-17) -- hallazgo real: un cliente que YA mostró interés en un
// producto y luego solo pregunta "¿me puedes dar información para pagar?"
// (o variantes -- nunca dice literalmente "transferencia") quedaba
// enteramente en manos del LLM, que en un caso real pidió CORREO
// ELECTRÓNICO (dato que este negocio no usa) y terminó derivando con el
// mensaje genérico de handoff. Transferencia es HOY el único método
// autónomo real -- si el cliente pregunta genéricamente cómo pagar/pedir
// los datos, sin mencionar un método no soportado, la respuesta correcta
// NUNCA depende del criterio del LLM.
const FRASES_SOLICITUD_PAGO = [
  "informaci[oó]n para pagar",
  "datos para pagar",
  "c[oó]mo (le )?pago",
  "c[oó]mo puedo pagar",
  "quiero pagar",
  "datos de pago",
  "datos (de la cuenta|bancarios)",
  "c[oó]mo transf",
  "datos para transferir",
  "p[aá]same los datos",
  "me pasas los datos",
  "n[uú]mero de cuenta",
  "dame los datos",
  "necesito los datos",
  "informaci[oó]n (para|de) (transferir|transferencia)",
];
const SOLICITUD_PAGO_RE = new RegExp(FRASES_SOLICITUD_PAGO.join("|"), "i");

/**
 * true SOLO si el texto pregunta genéricamente cómo pagar/pide los datos de
 * pago SIN mencionar un método no soportado en el mismo mensaje (OXXO,
 * tarjeta, efectivo, Mercado Pago...) -- esos casos deben seguir su camino
 * normal (LLM/derivarHumano), nunca este atajo determinista.
 */
export function detectarSolicitudPago(texto: string): boolean {
  if (!texto) return false;
  if (METODO_NO_SOPORTADO_RE.test(texto)) return false;
  return SOLICITUD_PAGO_RE.test(texto);
}

// ============================================================
// Precedencia de compra autónoma (Fase "Corregir precedencia handoff vs.
// flujo comercial autónomo", 2026-09-15) -- decisión de negocio real:
// una intención de compra clara que YA trae producto real + método de
// pago autónomo soportado (transferencia bancaria, el único hoy) debe
// dejar que Hermes continúe solo (crearPedido -> cerrarVentaTransferencia)
// en vez de derivar de inmediato. El handoff (HUMAN_HANDOFF) se conserva
// intacto para todo lo demás: producto ambiguo, sin método, u otro método
// (OXXO/tarjeta/Mercado Pago/efectivo) -- eso sigue sin poder resolverse
// solo, tal como antes.
// ============================================================

// Único método autónomo soportado hoy (ver comercio.ts#cerrarVentaTransferencia)
// -- agregar otro método autónomo en el futuro es extender esta constante,
// nunca reescribir la lógica de decisión de abajo.
//
// Corrección real 2026-09-17: /transferenc/i solo cubría "transferencia",
// no el verbo conjugado -- un cliente real puede decir cualquiera de los
// dos sin usar el sustantivo. "transferir" es un verbo -ir con cambio de
// raíz (como "preferir"): las formas regulares (transferencia, transferir,
// transferiré, transferido...) usan la raíz "transfer", pero el presente
// de indicativo (transfiero, transfieres, transfiere, transfieren) cambia
// a "transfier" -- se necesitan ambas raíces. "transf" no es un prefijo de
// ninguna otra palabra española de uso real, así que exigir ambas formas
// exactas (nunca un prefijo más corto y genérico) no introduce falsos
// positivos nuevos.
export const METODO_AUTONOMO_RE = /transf(e|ie)r/i;

// "Vida Divina" es el nombre de la marca, no de ningún producto -- pero
// aparece pegado al nombre real en cómo habla el cliente ("Té Vida
// Divina"), y la palabra "Vida" sola coincide (falso positivo real,
// confirmado) con productos que sí la llevan en su título (Vida Pure,
// Vida Fuel). Se quita solo la marca completa "vida divina" (dejando
// "divina"), nunca la palabra "vida" sola -- así Vida Pure/Vida Fuel
// siguen resolviendo bien.
const MARCA_RE = /\bvida\s+divina\b/gi;

// Mismo patrón que priceIntent.ts#RUIDO_REGEX (ruido conversacional +
// palabras propias de la frase de compra) -- se usa SIEMPRE antes de
// buscar el producto real, porque una frase de compra completa
// ("quiero comprar X y pagar por transferencia") trae palabras ajenas
// al nombre del producto que degradan el fuzzy-match (hallazgo real:
// "Quiero comprar Té Vida Divina y pagar por transferencia" resolvía
// mal a "Vida Pure" con el texto completo sin limpiar).
// Incluye también placeholders genéricos SIN producto real detrás ("algo",
// "eso", "esto", "cosa") -- hallazgo real: sin quitarlos, "quiero comprar
// algo y pagar por transferencia" caía en el fallback fuzzy de
// searchKnowledge y resolvía (mal) a un producto cualquiera por
// coincidencia de edición corta, en vez de quedar sin producto (null).
const RUIDO_COMPRA_REGEX =
  /quiero\s+(comprar|pedir|adquirir)(lo|la)?|comprar|pedir|adquirir|pagar|pago|\b(un|una|el|la|los|las|de|del|por|con|para|y|pero|me|porfa|favor|paquete|transferenc\w*|oxxo|tarjeta|efectivo|algo|eso|esto|cosa)\b/gi;

function textoSinRuidoDeCompra(texto: string): string {
  return texto
    .replace(MARCA_RE, "Divina")
    .replace(/[¿?¡!]/g, " ")
    .replace(RUIDO_COMPRA_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CompraAutonomaResuelta {
  productoId: string;
  metodoPago: "transferencia";
}

function normalizarSimple(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Guarda real (hallazgo real 2026-09-16): "Me puedes compartir la forma de
// pago, voy a pagar por transferencia" -- SIN producto real -- quedaba,
// tras limpiar ruido, en "puedes compartir forma , voy a", texto que no
// menciona ningún producto pero que `searchKnowledge` igual "resolvía" vía
// su fallback FUZZY (tolerante a errores de tipeo, pensado para
// "Ripet"->"Ripped", nunca para frases sueltas) contra "Youth Capsules" por
// pura casualidad de distancia de edición -- inventando un producto que el
// cliente nunca mencionó. Para la resolución AUTÓNOMA (la única que puede
// terminar en crearPedido sin que el LLM la revise) no basta con "algún
// hit": se exige que al menos una palabra real y significativa (>=4
// letras) de lo que dijo el cliente aparezca literalmente en el título o
// las palabras clave reales del producto -- el mismo criterio de
// coincidencia fuerte que ya usa `searchKnowledge` en sus ramas de
// substring/token, solo que verificado aquí para excluir explícitamente un
// acierto que dependa ÚNICAMENTE de su rama fuzzy.
function coincideConProductoReal(consultaLimpia: string, hit: { titulo: string; palabrasClave: string[] }): boolean {
  const qTokens = normalizarSimple(consultaLimpia)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (qTokens.length === 0) return false;
  const candidatos = [hit.titulo, ...hit.palabrasClave].map(normalizarSimple);
  return candidatos.some((c) => qTokens.some((t) => c.includes(t)));
}

/**
 * Resuelve `{productoId, metodoPago}` SOLO si el mismo texto ya deja claro
 * un producto real del catálogo Y que el pago será por transferencia --
 * null ante cualquier ambigüedad real (sin match de producto real, u otro
 * método/ninguno mencionado). Nunca inventa el producto: usa el mismo
 * `searchKnowledge` real que ya usan crearPedido/qualifyLead, pero sobre
 * el texto ya limpiado de ruido conversacional (ver `textoSinRuidoDeCompra`)
 * -- si tras limpiar no queda nada (ningún producto mencionado, ej.
 * "quiero comprar" solo), no busca nada y devuelve null directamente. El
 * hit debe además superar `coincideConProductoReal` (ver arriba): un
 * acierto que solo viene del fallback fuzzy de `searchKnowledge`, sin
 * ninguna palabra real en común, nunca resuelve un producto aquí.
 */
export async function resolverCompraAutonoma(texto: string): Promise<CompraAutonomaResuelta | null> {
  if (!texto || !METODO_AUTONOMO_RE.test(texto)) return null;
  const limpio = textoSinRuidoDeCompra(texto);
  if (!limpio) return null;
  const { searchKnowledge } = await import("./productKnowledge");
  const hits = await searchKnowledge(limpio, { limit: 1 });
  const hit = hits[0] ?? null;
  if (!hit || !coincideConProductoReal(limpio, hit)) return null;
  const productoId = hit.id;
  return { productoId, metodoPago: "transferencia" };
}

/**
 * Decisión real y única que debe consultar el gate determinista de
 * handler.ts. Corrección real 2026-09-17 (causa confirmada en producción,
 * conversation_id=469): "hola quiero comprar las capsulas ripped" --
 * producto claro, SIN mencionar ningún método de pago -- forzaba
 * `ejecutarHandoffReal()` de inmediato porque `resolverCompraAutonoma`
 * exige la palabra "transfer..." en el MISMO mensaje para no derivar; sin
 * ella, esta función devolvía `true` aunque el cliente ni siquiera hubiera
 * llegado todavía a decidir cómo pagar. Regla de negocio real:
 * - producto claro + compra clara SIN método de pago -> NUNCA deriva aquí
 *   -- sigue en AI, la conversación continúa (LLM/`intentarSolicitudPagoDeterminista`
 *   resuelven el resto cuando el cliente diga cómo va a pagar).
 * - producto + transferencia -> tampoco deriva (ya resuelto por
 *   `resolverCompraAutonoma`, comportamiento previo intacto).
 * - método de pago NO soportado mencionado en el mismo mensaje (OXXO,
 *   tarjeta, efectivo, Mercado Pago...) -> ÚNICO caso real que sigue
 *   forzando el handoff determinista aquí.
 * - producto ambiguo (sin producto identificable) -> tampoco deriva por
 *   este camino; el LLM debe preguntar/aclarar, nunca desconectar.
 */
export async function debeDerivarPorCompraClara(texto: string): Promise<boolean> {
  if (!detectarIntencionCompraClara(texto)) return false;
  return METODO_NO_SOPORTADO_RE.test(texto);
}

// construirRefuerzoCompraAutonoma (hallazgo real 2026-09-16): el gate de
// arriba (`debeDerivarPorCompraClara`) evita el handoff FORZADO cuando el
// mensaje ya resuelve producto + transferencia, pero eso NUNCA obligaba al
// LLM a llamar a crearPedido/cerrarVentaTransferencia -- caso real
// confirmado: "quiero hacer un pedido de cápsulas venus, pago por
// transferencia porfavor" ni siquiera activa `detectarIntencionCompraClara`
// (no calza ninguna FRASE_COMPRA_CLARA), así que este gate nunca se
// evaluaba, y el LLM, sin ningún refuerzo, decidió por su cuenta llamar a
// `derivarHumano` (tipo='compra') en vez de continuar el flujo autónomo.
// Mismo patrón exacto que `priceIntent.ts#construirRefuerzoPrecio`: un
// refuerzo determinista, no un reemplazo -- se inyecta en memoryContext
// SIEMPRE que `resolverCompraAutonoma` resuelva algo (lo haya detectado o
// no `detectarIntencionCompraClara`), para que la decisión de qué tool
// llamar no dependa solo del criterio del modelo.
export function construirRefuerzoCompraAutonoma(language: IdiomaConversacion, datos: { titulo: string }): string {
  if (language === "en") {
    return `\n\nAUTONOMOUS PURCHASE ALREADY RESOLVED for this turn: the customer already made clear they want "${datos.titulo}" and will pay by bank transfer (the only real autonomous payment method today). Do NOT call derivarHumano for this -- call crearPedido first (producto="${datos.titulo}"), then cerrarVentaTransferencia. Only derive to a human if, after reading the message carefully, the product is actually NOT this one, or the customer asks for a different payment method.`;
  }
  return `\n\nCOMPRA AUTÓNOMA YA RESUELTA para este turno: el cliente ya dejó claro que quiere "${datos.titulo}" y pagará por transferencia bancaria (el único método autónomo real hoy). NO llames a derivarHumano por esto -- llama primero a crearPedido (producto="${datos.titulo}") y después a cerrarVentaTransferencia. Deriva a un humano únicamente si, leyendo bien el mensaje, el producto en realidad NO es ese, o el cliente pide otro método de pago.`;
}
