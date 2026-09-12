import type { ToolDefinition, ToolHandler } from "./index";
import { getProductKnowledge, searchKnowledge } from "../vidaDivina/productKnowledge";
import { getProductPricing, formatearPrecio } from "../vidaDivina/crmClient";

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
    return { ok: true, encontrados: 0, message: `No hay ningún producto real en el catálogo que coincida con "${args.consulta}". No inventes uno: dile al cliente que no lo tenemos o pregúntale por otro nombre.` };
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

export const consultarProductoHandler: ToolHandler<ConsultarProductoArgs> = async (args) => {
  const res = await getProductKnowledge(args.producto);
  if (!res.found) {
    return { ok: true, encontrado: false, message: res.reason };
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
  // si hiciera falta comparar/calcular ahorro.
  const promocionesFormateadas = (pricing?.promociones ?? []).map((p) => ({
    ...p,
    precioFormateado: formatearPrecio(p.precio),
  }));
  return {
    ok: true,
    encontrado: true,
    productId: res.productId,
    titulo: res.titulo,
    contenido: res.contenidoMarkdown,
    precio: pricing?.precio ?? null,
    precioFormateado: pricing?.precio != null ? formatearPrecio(pricing.precio) : null,
    disponibleStock: pricing?.disponibleStock ?? null,
    cantidadBase: pricing?.cantidadBase ?? null,
    promociones: promocionesFormateadas.length > 0 ? promocionesFormateadas : null,
    message: (pricing?.precio != null
      ? "Usa SOLO estos datos reales para responder, incluido el precio real. Cualquier dato que no aparezca aquí, no lo afirmes. Al escribir el precio usa SIEMPRE el texto exacto de 'precioFormateado' (y el 'precioFormateado' de cada promoción) tal cual viene, cópialo literal -- NUNCA reescribas el número tú mismo, nunca uses el punto como separador de miles (nunca '$1.799', siempre '$1,799') y NUNCA lo conviertas ni lo nombres en dólares/USD: todos los precios de Vida Divina son en pesos mexicanos, sin excepción, tanto si respondes en texto como si tu respuesta se va a convertir en nota de voz." +
        (hayPromociones
          ? " Hay promoción(es) real(es) disponibles (campo 'promociones'): cuando hables de precio, presenta la promoción más adecuada a lo que el cliente busca de forma comercial -- cantidad + precioFormateado del paquete + el ahorro si se puede calcular exacto contra el precio normal (cantidadBase) -- nunca como una cifra aislada. No muestres todas las promociones de golpe: elige la más relevante para esta conversación; menciona que hay otra opción solo si el cliente pregunta por más."
          : "")
      : "Usa SOLO estos datos reales para responder. No hay un precio real registrado todavía para este producto: NO inventes una cifra -- dile al cliente que confirmas el precio y usa derivarHumano si insiste en cerrar la compra.") +
      " Al mencionar la presentación ('cantidadBase'), conserva su estructura y significado exactos, nunca la reinterpretes ni la simplifiques: si viene como 'Contenedor / Detalle' (ej. 'Bolsa / 20 sobres individuales'), exprésalo en lenguaje natural como 'un/una {contenedor} con {detalle}' (ej. 'una bolsa con 20 sobres individuales'), NUNCA como 'presentación de X' ni omitiendo el contenedor; si viene como una cantidad simple (ej. '90 Cápsulas'), úsala tal cual." +
      " Cómo nombrar el producto -- el campo 'contenido' (la ficha completa de abajo) puede incluir un 'Nombre visible' distinto del título/nombre comercial: si respondes en español y existe un 'Nombre visible' real en la ficha, úsalo tal cual al referirte al producto en tu respuesta (ej. 'Cápsulas Ripped', nunca 'Ripped Capsules') -- nunca mezcles un nombre en inglés dentro de una frase en español. Si respondes en otro idioma, usa el nombre comercial que corresponda naturalmente a ese idioma. Esto nunca cambia cómo buscas o identificas el producto (title/id internos siguen igual), solo cómo lo nombras al hablarle al cliente." +
      " IMPORTANTE -- responde SOLO lo relevante a la pregunta o necesidad actual del cliente, en 2-3 frases: nunca vuelques esta ficha completa de una sola vez, ni listes automáticamente todos los ingredientes, la presentación completa, el público objetivo NI el modo de uso. Profundiza en un dato concreto (ingrediente, modo de uso, presentación...) únicamente si el cliente pregunta por él después o si es directamente relevante para que decida comprar.",
  };
};
