import type { ToolDefinition, ToolHandler } from "./index";
import { setMode, getRecentHistory, listOutboxMediaByConversation } from "../db";
import { handoffToHuman, consultarPedidoActivo, formatearPedidoParaHandoff, crearPedido } from "../vidaDivina/crmClient";
import { leadPhone } from "../airtable";
import { METODO_AUTONOMO_RE, METODO_NO_SOPORTADO_RE, resolverCompraAutonoma } from "../vidaDivina/purchaseIntent";

// Handoff comercial al humano (FASE "Handoff comercial al humano",
// 2026-09-04). Sigue siendo la ÚNICA tool de derivación -- no se crea un
// segundo mecanismo. `tipo` decide únicamente CÓMO debe sonar la respuesta
// al cliente (frase de cierre exacta vs. continuidad natural), nunca cambia
// el mecanismo real de derivación (setMode + handoffToHuman, sin cambios).

export type TipoHandoff = "compra" | "persona" | "reclamo" | "fuera_de_alcance";

export interface DerivarHumanoArgs {
  conversationId: number;
  razon: string;
  tipo: TipoHandoff;
  producto?: string;
  necesidad?: string;
  objeciones?: string;
  prioridad?: "alta" | "media" | "baja";
}

const FRASE_CIERRE_COMPRA = "Perfecto, ya tengo lo necesario para ayudarte con tu pedido.";

export type EjecutarHandoffArgs = DerivarHumanoArgs;

export interface EjecutarHandoffResult {
  ok: boolean;
  message: string;
  instruccion: string;
  duplicate?: boolean;
}

/**
 * Núcleo REAL del handoff -- extraído para que tanto la tool `derivarHumano`
 * (cuando el LLM decide llamarla) COMO el detector determinista de
 * intención de compra (`vidaDivina/purchaseIntent.ts`, hallazgo real
 * 2026-09-08: el modelo puede narrar la regla en vez de ejecutarla) usen
 * EXACTAMENTE el mismo camino real -- nunca un segundo mecanismo de
 * handoff. La idempotencia (nunca duplicar el handoff/la alerta) vive en
 * `handoffToHuman` (crmClient.ts), no aquí -- un solo punto de verdad.
 */
export async function ejecutarHandoffReal(args: EjecutarHandoffArgs): Promise<EjecutarHandoffResult> {
  if (!args.conversationId) {
    return {
      ok: false,
      message: "No se pudo derivar: falta conversationId (bug del wrapper de tools)",
      instruccion: "",
    };
  }

  setMode(args.conversationId, "HUMAN");

  const phone = leadPhone(args.conversationId);

  // Contexto comercial REAL (Fase "Hermes Ventas", 2026-09-15): si esta
  // conversación tiene un pedido/pago real en curso, se anexa al motivo --
  // el mínimo exigido (producto(s), cantidades, precio(s), total, order_id,
  // payment_id, estado) queda conservado en el ÚNICO mecanismo de handoff
  // ya existente (handoffs.motivo), sin crear una tabla ni un camino
  // paralelo. Best-effort: si el CRM no responde, el handoff real igual
  // se crea, solo sin este bloque adicional.
  let pedidoTxt: string | null = null;
  if (phone) {
    try {
      const pedido = await consultarPedidoActivo(phone);
      if (pedido) pedidoTxt = formatearPedidoParaHandoff(pedido);
    } catch {
      pedidoTxt = null;
    }
  }

  const partesMotivo = [
    `[${args.tipo}] ${args.razon}`,
    args.producto && `Producto: ${args.producto}`,
    args.necesidad && `Necesidad: ${args.necesidad}`,
    args.objeciones && `Objeciones: ${args.objeciones}`,
    args.prioridad && `Prioridad: ${args.prioridad}`,
    pedidoTxt,
  ].filter(Boolean);
  const motivo = partesMotivo.join(" · ");

  let duplicate = false;
  if (phone) {
    const historialLocal = getRecentHistory(args.conversationId, 30).filter((m) => m.role === "user" || m.role === "assistant");
    const mediaLocal = listOutboxMediaByConversation(args.conversationId);
    const resultado = await handoffToHuman(phone, motivo, {
      mensajes: historialLocal.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, createdAt: m.created_at })),
      media: mediaLocal.map((it) => ({ tipo: it.type, descripcion: `[media enviada: ${it.type}] ${it.media_path ?? ""}`.trim() })),
    });
    duplicate = Boolean(resultado.ok && resultado.duplicate);
  }

  const instruccion =
    args.tipo === "compra"
      ? `Responde EXACTAMENTE con esta frase, sin cambiar una palabra y sin añadir nada más en ese mensaje: "${FRASE_CIERRE_COMPRA}"`
      : 'Responde con naturalidad y continuidad, SIN anunciar que se deriva a un humano -- prohibidas frases como "te transfiero", "te paso con un asesor", "ahora te atenderá una persona" o "soy un agente virtual y...". Simplemente sigue la conversación de forma natural y cercana a lo que haya dicho el cliente.';

  return {
    ok: true,
    message: `Conversación derivada a HUMAN (tipo: ${args.tipo}). Razón: ${args.razon}`,
    instruccion,
    duplicate,
  };
}

export const FRASE_CIERRE_COMPRA_EXACTA = FRASE_CIERRE_COMPRA;

export const derivarHumanoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "derivarHumano",
    description:
      "Deriva la conversación a un humano REAL (Vida Divina no cierra venta ni inscripción de distribuidor por chat automático). REGLA DURA: si tu respuesta a este mensaje va a mencionar, sugerir o dar a entender de cualquier forma que 'el equipo', 'un asesor', 'una persona' o 'alguien' va a atender, gestionar, contactar o continuar con el lead, DEBES llamar a esta tool EN ESE MISMO TURNO antes de escribir esa frase -- decirlo sin llamarla NO deriva nada de verdad, la conversación se queda en modo IA y nadie se entera. NO lo condiciones a recoger antes el nombre o el email del lead: eso lo pide el humano directamente, no es un requisito para derivar. NO derives antes de tiempo si todavía puedes resolver la duda con tus otras tools. " +
      "REGLA DURA SOBRE TRANSFERENCIA (decisión de negocio, 2026-09-17): que el cliente pida los datos/la cuenta para transferir, diga que va a pagar o quiere pagar por transferencia, o pregunte cómo transferir, NUNCA es por sí solo motivo para derivar (NO es 'fuera_de_alcance', NO es 'compra' sin resolver) -- transferencia bancaria es el método autónomo real que SÍ puedes resolver tú: primero llama a consultarPedido para saber si ya tiene un pedido activo; si lo tiene, llama a cerrarVentaTransferencia directamente con ese orderId; si NO tiene pedido activo y el producto no quedó claro, NO derives -- pregúntale con naturalidad qué producto quiere (usa buscarProductos/consultarProducto si hace falta) y, en cuanto lo confirme, sigue con crearPedido -> cerrarVentaTransferencia. " +
      "Fuera de ese caso, úsala cuando: el lead diga, con cualquier frase (comprar, pedir, encargar, cerrar, pagar, adquirir, 'quiero más', 'mándame el pedido', 'cómo lo consigo'...), que quiere adquirir el producto, aunque sea la primera vez que lo dice y aunque antes solo mostrara interés general (tipo='compra') -- misma EXCEPCIÓN de arriba: si el mismo mensaje ya deja claro producto + transferencia, NO derives, sigue con crearPedido/cerrarVentaTransferencia; deriva por compra únicamente si, tras preguntar el producto, sigue sin quedar claro, o si pide/menciona un método de pago distinto de transferencia (OXXO, tarjeta, efectivo, Mercado Pago, o cualquier otro); diga, con cualquier frase, que quiere hablar con una persona/humano/agente real (incluye 'pásame con alguien', 'no quiero hablar con un bot', 'quiero un humano', 'no me atiende una IA', o cualquier variante que rechace seguir con el asistente) (tipo='persona'); tenga una queja o incidencia (tipo='reclamo'); o el caso esté fuera de lo que tus tools pueden resolver, por ejemplo un método de pago que no sea transferencia bancaria, o el número de guía/rastreo de un paquete YA enviado (tipo='fuera_de_alcance') -- esto último es sobre paquetería, nunca sobre datos bancarios para transferir (ver regla dura de arriba).",
    parameters: {
      type: "object",
      properties: {
        razon: { type: "string", description: "Motivo real y concreto de la derivación, para el humano que la retoma." },
        tipo: { type: "string", enum: ["compra", "persona", "reclamo", "fuera_de_alcance"], description: "Por qué se deriva -- decide cómo debes redactar tu mensaje al cliente (ver instrucción de respuesta que te devuelve la tool)." },
        producto: { type: "string", description: "Producto de interés real, si se sabe." },
        necesidad: { type: "string", description: "Necesidad real identificada del lead, si se sabe." },
        objeciones: { type: "string", description: "Objeciones o dudas que planteó el lead durante la charla, si las hubo." },
        prioridad: { type: "string", enum: ["alta", "media", "baja"], description: "Urgencia real percibida para que el humano priorice (alta = listo para comprar ya)." },
      },
      required: ["razon", "tipo"],
    },
  },
};

// METODO_NO_SOPORTADO_RE: importado de purchaseIntent.ts (única definición
// real) -- cuando el último mensaje lo menciona, este guard nunca actúa: el
// handoff real debe seguir su curso normal.

/**
 * Guard determinista PRE-handoff (hallazgo real 2026-09-17, confirmado con
 * evidencia real en `tool_events`: el LLM siguió llamando a `derivarHumano`
 * -- con distintos `tipo`, incluido 'fuera_de_alcance' -- ante "pedir los
 * datos para transferir", pese a que la descripción de la tool ya lo
 * prohibía explícitamente por escrito). Un cambio de wording por sí solo no
 * bastó dos veces seguidas: esto bloquea el EFECTO real (mode=HUMAN, sin
 * importar qué `tipo` haya elegido el modelo) cuando el último mensaje del
 * cliente es, con evidencia razonable, solo sobre transferencia -- nunca
 * sobre un método no soportado. Reutiliza EXACTAMENTE las tools/funciones
 * comerciales ya existentes (`consultarPedidoActivo`, `cerrarVentaTransferencia`,
 * `crearPedido`, vía la `instruccion` que le devuelve al modelo) -- no crea
 * un segundo mecanismo de handoff, solo le niega la ejecución a este en
 * este caso concreto. Devuelve `null` (no actúa) en cualquier otro caso.
 */
async function guardarNoDerivarPorTransferencia(args: DerivarHumanoArgs): Promise<EjecutarHandoffResult | null> {
  if (!args.conversationId) return null;
  const ultimoUsuario = getRecentHistory(args.conversationId, 5)
    .filter((m) => m.role === "user")
    .pop();
  const texto = ultimoUsuario?.content ?? "";
  if (!texto) return null;
  if (METODO_NO_SOPORTADO_RE.test(texto)) return null; // método no soportado -> el handoff real SÍ debe ocurrir
  if (!METODO_AUTONOMO_RE.test(texto)) return null; // no es sobre transferencia -> este guard no aplica

  const phone = leadPhone(args.conversationId);
  const pedido = phone ? await consultarPedidoActivo(phone) : null;
  if (pedido) {
    return {
      ok: false,
      message: `No se derivó: ya existe un pedido activo (orderId=${pedido.orderId}) y el cliente pidió los datos de transferencia -- se redirige al flujo comercial existente.`,
      instruccion: `NO derives a un humano por esto. Llama AHORA MISMO a cerrarVentaTransferencia con orderId="${pedido.orderId}" y responde en este mismo turno con el 'mensajeAutorizado' que te devuelva, tal cual, sin mencionar que vas a derivar con nadie.`,
    };
  }

  // Sin pedido activo, pero el propio mensaje ya deja claro qué producto real
  // quiere (ej. "...los datos para transferir lo de unas cápsulas Ripped") --
  // mismo `resolverCompraAutonoma` real que ya usa el gate determinista de
  // `purchaseIntent.ts`, nunca un segundo detector de producto. Se crea el
  // pedido real aquí (misma `crearPedido` real de siempre) para no perder el
  // turno: el modelo solo tiene que cerrar la venta, no volver a preguntar
  // algo que el cliente ya dijo.
  if (phone) {
    const resuelto = await resolverCompraAutonoma(texto);
    if (resuelto) {
      const nuevoPedido = await crearPedido({ phone, productoId: resuelto.productoId });
      if (nuevoPedido.ok && nuevoPedido.orderId) {
        return {
          ok: false,
          message: `No se derivó: producto identificado (${resuelto.productoId}) y transferencia -- se creó el pedido real (orderId=${nuevoPedido.orderId}) y se redirige al flujo comercial existente.`,
          instruccion: `NO derives a un humano por esto. Llama AHORA MISMO a cerrarVentaTransferencia con orderId="${nuevoPedido.orderId}" y responde en este mismo turno con el 'mensajeAutorizado' que te devuelva, tal cual, sin mencionar que vas a derivar con nadie.`,
        };
      }
      // crearPedido no pudo completarse (ej. presentación ambigua) -- cae al
      // caso de abajo, nunca inventa un pedido ni deriva por esto.
    }
  }

  return {
    ok: false,
    message: "No se derivó: el cliente preguntó por transferencia pero todavía no hay producto/pedido identificado.",
    instruccion: "NO derives a un humano por esto. Sigue la conversación con naturalidad y pregúntale qué producto quiere comprar; en cuanto lo confirme, usa crearPedido y después cerrarVentaTransferencia.",
  };
}

export const derivarHumanoHandler: ToolHandler<DerivarHumanoArgs> = async (args) => {
  const bloqueo = await guardarNoDerivarPorTransferencia(args);
  if (bloqueo) return { ok: bloqueo.ok, message: bloqueo.message, instruccion: bloqueo.instruccion, duplicate: false };
  const r = await ejecutarHandoffReal(args);
  return { ok: r.ok, message: r.message, instruccion: r.instruccion, duplicate: r.duplicate };
};
