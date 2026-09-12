import type { ToolDefinition, ToolHandler } from "./index";
import { getProductKnowledge, searchKnowledge } from "../vidaDivina/productKnowledge";
import { getProductPricing, formatearPrecio } from "../vidaDivina/crmClient";
import type { IdiomaConversacion } from "../vidaDivina/languageDetection";

// Fuente de verdad de producto: docs/productos/**/*.md, vía el Knowledge
// Package ya compilado (recommendation-engine/). Nunca se inventa un
// ingrediente/beneficio/precio/dosis que no esté en el catálogo real.

interface BuscarProductosArgs {
  consulta: string;
}

export const buscarProductosDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "buscarProductos",
    description:
      "Busca en el catálogo REAL de Vida Divina qué productos coinciden con una palabra/nombre (ej. 'tongkat', 'té', 'colágeno'). Úsala cuando no sepas el nombre exacto del producto o quieras ver varias opciones antes de traer el contenido completo de uno con consultarProducto.",
    parameters: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Palabra clave o nombre parcial del producto." },
      },
      required: ["consulta"],
    },
  },
};

export const buscarProductosHandler: ToolHandler<BuscarProductosArgs> = async (args) => {
  const hits = await searchKnowledge(args.consulta, { limit: 5 });
  if (hits.length === 0) {
    const message =
      args.language === "en"
        ? `No real product in the catalog matches "${args.consulta}". Don't invent one -- tell the client we don't have it, or ask for another name.`
        : `No hay ningún producto real en el catálogo que coincida con "${args.consulta}". No inventes uno: dile al cliente que no lo tenemos o pregúntale por otro nombre.`;
    return { ok: true, encontrados: 0, message };
  }
  return { ok: true, encontrados: hits.length, productos: hits.map((h) => ({ id: h.id, titulo: h.titulo })) };
};

interface ConsultarProductoArgs {
  producto: string;
}

export const consultarProductoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "consultarProducto",
    description:
      "Trae el contenido REAL y completo de UN producto del catálogo (ingredientes, beneficios, presentación, público objetivo) y su precio/promoción REAL vigente desde docs/productos/ + el pricing operativo. LLÁMALA siempre antes de afirmar cualquier dato concreto de un producto (ingrediente, beneficio, presentación, precio, promoción). REGLA DURA: si el cliente pregunta por precio o promoción, vuelve a llamar a esta tool EN ESE MISMO TURNO -- incluso si ya hablaste del producto antes en la conversación. Los resultados de una llamada anterior NO se conservan de un mensaje al siguiente: responder de memoria sobre precio/promoción es tan grave como inventar una cifra. NUNCA digas 'no hay ninguna promoción' sin haber llamado a esta tool en este mismo turno y comprobado que su campo 'promociones' viene vacío o nulo -- si no la llamaste, no lo sabes. Si el producto no aparece, NO inventes su ficha: dilo con honestidad.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto (puede ser parcial, ej. 'tongkat ali')." },
      },
      required: ["producto"],
    },
  },
};

// Mensajes de apoyo COMPACTOS y ya elegidos por idioma (FASE "Idioma +
// Nombre visible", 2026-09-12, causa raíz confirmada: un solo bloque largo
// SIEMPRE en español -- tanto este `message` como el `contenido` del
// catálogo -- competía contra la única instrucción de idioma del system
// prompt y ganaba en buena parte de los casos reales observados, incluso
// respondiendo con gpt-4o-mini). Nunca se traduce el catálogo completo
// (`contenido` sigue siendo español, tal cual el markdown real): solo estas
// instrucciones de USO pasan a tener una variante EN corta, para dejar de
// sumar peso español al lado de la instrucción de idioma.
function instruccionPrecio(language: IdiomaConversacion, hayPrecio: boolean, hayPromociones: boolean): string {
  if (language === "en") {
    if (!hayPrecio) {
      return "Use ONLY this real data. There is no real price on file yet -- never invent a figure: tell the client you'll confirm it, and use derivarHumano if they insist on closing the purchase.";
    }
    return (
      "Use ONLY this real data, including the real price. Copy 'precioFormateado' (and each promotion's) literally -- never rewrite the number, never in dollars/USD: all Vida Divina prices are in Mexican pesos, in text or voice." +
      (hayPromociones
        ? " Real promotion(s) exist ('promociones'): present the most relevant one commercially (quantity + precioFormateado + savings if exact) -- never a bare figure, and don't dump every option at once."
        : "")
    );
  }
  if (!hayPrecio) {
    return "Usa SOLO estos datos reales. No hay un precio real registrado todavía: NO inventes una cifra -- dile al cliente que confirmas el precio y usa derivarHumano si insiste en cerrar la compra.";
  }
  return (
    "Usa SOLO estos datos reales, incluido el precio real. Copia 'precioFormateado' (y el de cada promoción) tal cual, literal -- nunca reescribas el número, nunca en dólares/USD: todos los precios de Vida Divina son en pesos mexicanos, en texto o en voz." +
    (hayPromociones
      ? " Hay promoción(es) real(es) ('promociones'): presenta la más relevante de forma comercial (cantidad + precioFormateado + ahorro si es exacto) -- nunca una cifra aislada, sin volcar todas de golpe."
      : "")
  );
}

function instruccionPresentacion(language: IdiomaConversacion): string {
  return language === "en"
    ? "Presentation ('cantidadBase'): keep its exact meaning -- 'Container / Detail' (e.g. 'Bag / 20 individual sachets') becomes 'a {container} with {detail}', never 'presentation of X'; a simple quantity (e.g. '90 capsules') stays as-is."
    : "Presentación ('cantidadBase'): conserva su significado exacto -- 'Contenedor / Detalle' (ej. 'Bolsa / 20 sobres individuales') se dice 'un/una {contenedor} con {detalle}', nunca 'presentación de X'; una cantidad simple (ej. '90 cápsulas') se usa tal cual.";
}

function instruccionNombre(language: IdiomaConversacion, nombreParaCliente: string): string {
  return language === "en"
    ? `Name to use with the client: "${nombreParaCliente}" -- use it exactly, never another variant.`
    : `Nombre a usar con el cliente: "${nombreParaCliente}" -- úsalo tal cual, nunca otra variante.`;
}

function instruccionAlcance(language: IdiomaConversacion): string {
  return language === "en"
    ? "Answer ONLY what's relevant to the client's current question, in 2-3 sentences -- never dump this whole file at once. Write your OWN English sentences from these facts; don't copy Spanish sentences from 'contenido' verbatim."
    : "Responde SOLO lo relevante a la pregunta actual, en 2-3 frases -- nunca vuelques esta ficha completa de una vez.";
}

export const consultarProductoHandler: ToolHandler<ConsultarProductoArgs> = async (args) => {
  const language: IdiomaConversacion = args.language === "en" ? "en" : "es";
  const res = await getProductKnowledge(args.producto);
  if (!res.found) {
    const message =
      language === "en"
        ? `No matching product found for "${args.producto}" in the catalog. Never invent its data -- say so honestly.`
        : res.reason;
    return { ok: true, encontrado: false, message };
  }
  // Precio/stock REAL y operativo (crm.productPricing) -- distinto del
  // catálogo estático de docs/productos/. Si no hay fila real, precio queda
  // null: nunca se inventa una cifra.
  const pricing = await getProductPricing(res.productId);
  const hayPromociones = Boolean(pricing?.promociones && pricing.promociones.length > 0);
  // precioFormateado / cada promoción.precioFormateado (2026-09-10,
  // actualización de catálogo): el LLM recibía el número crudo y lo
  // reformateaba él mismo al redactar la respuesta -- de ahí salían
  // precios como "$1.799" en vez de "$1,799". Ahora se le entrega el
  // string YA correcto (formatearPrecio, "$1,799") para que lo copie tal
  // cual en vez de recalcularlo; el número crudo se conserva también por
  // si hiciera falta comparar/calcular ahorro. El monto NUNCA se traduce
  // ni se recalcula por idioma -- es el mismo dato real en ES y en EN.
  const promocionesFormateadas = (pricing?.promociones ?? []).map((p) => ({
    ...p,
    precioFormateado: formatearPrecio(p.precio),
  }));

  // Nombre de cara al cliente (2026-09-12, "Nombre visible" estructurado):
  // resuelto AQUÍ, en código, nunca dejado a que el LLM elija entre las
  // variantes de nombre presentes en el mismo texto (titulo/H2, "Nombre
  // comercial", "Nombre visible") -- ver productKnowledge.ts#extraerNombreVisible.
  // `titulo`/`productId` internos NO cambian: esto solo decide qué palabra
  // usar al hablarle al cliente.
  const nombreParaCliente = language === "es" ? res.nombreVisible ?? res.titulo : res.titulo;

  return {
    ok: true,
    encontrado: true,
    productId: res.productId,
    titulo: res.titulo,
    nombreParaCliente,
    contenido: res.contenidoMarkdown,
    precio: pricing?.precio ?? null,
    precioFormateado: pricing?.precio != null ? formatearPrecio(pricing.precio) : null,
    disponibleStock: pricing?.disponibleStock ?? null,
    cantidadBase: pricing?.cantidadBase ?? null,
    promociones: promocionesFormateadas.length > 0 ? promocionesFormateadas : null,
    message: [
      instruccionPrecio(language, pricing?.precio != null, hayPromociones),
      instruccionPresentacion(language),
      instruccionNombre(language, nombreParaCliente),
      instruccionAlcance(language),
    ].join(" "),
  };
};
