// comercio.ts — Núcleo Comercial de Hermes Ventas (Fase "Hermes Ventas",
// 2026-09-15). Conecta las tools de Hermes con crm.createOrder()/
// crm.confirmarVenta() (crm/commerce/), ya validados (106/106 tests) --
// esta capa NUNCA ejecuta SQL, NUNCA inserta un movimiento SALE
// directamente, NUNCA descuenta inventario por su cuenta: todo pasa por
// las funciones reales ya atómicas/idempotentes/con protección de stock.
//
// Ciclo real: crearPedido (Order 'pendiente', SIN tocar inventario) ->
// registrarPago (Payment 'pendiente') -> confirmarPago (ADMIN-only,
// delega en crm.confirmarVenta -> SALE -> inventory) -> consultarPedido
// (para reanudar tras un HUMAN_HANDOFF sin perder contexto).

import path from "node:path";
import fs from "node:fs";
import type { ToolDefinition, ToolHandler } from "./index";
import {
  crearPedido as crearPedidoCrm,
  registrarPago as registrarPagoCrm,
  ofrecerTransferencia as ofrecerTransferenciaCrm,
  confirmarPago as confirmarPagoCrm,
  consultarPedidoActivo,
  formatearPedidoParaHandoff,
} from "../vidaDivina/crmClient";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { searchKnowledge, REPO_ROOT } from "../vidaDivina/productKnowledge";
import { enqueueOutboxImage } from "../db";

// Mismo patrón EXACTO que admin.ts/gmail.ts -- identidad real por
// teléfono, nunca por lo que el remitente escriba. No se extrae a un
// módulo compartido (cada tool file ya repite esta misma función privada;
// seguir ese patrón evita un refactor no solicitado).
function requireAdmin(conversationId?: number): { ok: true } | { ok: false; message: string } {
  const phone = leadPhone(conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: false,
      message: "Acción administrativa DENEGADA: quien escribe no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }
  return { ok: true };
}

// ============================================================
// crearPedido
// ============================================================

interface CrearPedidoArgs {
  producto: string;
  cantidadUnidades?: number;
  presentacion?: string;
  conversationId?: number;
}

export const crearPedidoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "crearPedido",
    description:
      "Crea el pedido REAL (Order) una vez que el cliente confirmó producto y cantidad/presentación que quiere comprar. Usa el precio REAL vigente en ese momento (nunca lo inventes ni lo repitas de memoria de un turno anterior -- esta tool lo resuelve por su cuenta). NUNCA descuenta inventario ni cobra nada -- solo dejar el pedido registrado como 'pendiente'. Después de esta tool, usa registrarPago para anotar cómo va a pagar.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto (puede ser parcial, ej. 'Té Vida Divina')." },
        cantidadUnidades: { type: "number", description: "Cuántos de esa presentación quiere (por defecto 1 -- ej. 1 tratamiento completo)." },
        presentacion: { type: "string", description: "Presentación específica que pidió el cliente, SOLO si la pidió explícitamente (ej. '2 sobres', '18 sobres'). Si el cliente no especificó cantidad/presentación, NO llenes este campo -- se usa automáticamente la presentación principal real vigente." },
      },
      required: ["producto"],
    },
  },
};

export const crearPedidoHandler: ToolHandler<CrearPedidoArgs> = async (args) => {
  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  const match = await searchKnowledge(args.producto, { limit: 1 });
  const productoId = match[0]?.id ?? null;
  if (!productoId) {
    return { ok: false, message: `No hay ningún producto real que coincida con "${args.producto}" en el catálogo. No inventes uno -- confirma el nombre con el cliente.` };
  }

  const res = await crearPedidoCrm({
    phone,
    productoId,
    cantidadUnidades: args.cantidadUnidades,
    presentacion: args.presentacion ?? null,
  });

  if (!res.ok) return { ok: false, message: res.reason };
  return {
    ok: true,
    orderId: res.orderId,
    total: res.total,
    precioUnitario: res.precioUnitario,
    presentacion: res.presentacion,
    cantidadUnidades: res.cantidadUnidades,
    message: `Pedido real creado (orderId=${res.orderId}), estado 'pendiente' -- ${res.cantidadUnidades} x "${res.presentacion}" a $${res.precioUnitario} c/u, total real $${res.total} MXN. Usa 'precioUnitario'/'total' tal cual, nunca los recalcules. Pedido no descuenta inventario todavía. Siguiente paso: registrarPago con el método que elija el cliente (transferencia o mercadopago).`,
  };
};

// ============================================================
// registrarPago
// ============================================================

interface RegistrarPagoArgs {
  orderId: string;
  metodo: string;
  referencia?: string;
  conversationId?: number;
}

export const registrarPagoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "registrarPago",
    description:
      "Registra que el cliente eligió un método de pago para un pedido ya creado (crearPedido). El pago queda en estado 'pendiente' -- NUNCA queda confirmado por esta tool, ni aunque el cliente diga 'ya pagué' o mande un comprobante: eso requiere confirmación por el flujo autorizado (derivarHumano si hace falta). Métodos reales hoy: 'transferencia' (Banorte) o 'mercadopago'.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "orderId real devuelto por crearPedido." },
        metodo: { type: "string", description: "Método de pago real elegido por el cliente: 'transferencia' o 'mercadopago'." },
        referencia: { type: "string", description: "Referencia real si el cliente la dio (ej. folio de transferencia), opcional." },
      },
      required: ["orderId", "metodo"],
    },
  },
};

export const registrarPagoHandler: ToolHandler<RegistrarPagoArgs> = async (args) => {
  const res = await registrarPagoCrm({
    orderId: args.orderId,
    metodo: args.metodo,
    referencia: args.referencia ?? null,
  });
  if (!res.ok) return { ok: false, message: res.reason };
  return {
    ok: true,
    paymentId: res.paymentId,
    estado: res.estado,
    message: `Pago registrado (paymentId=${res.paymentId}) como '${res.estado}' -- ${args.metodo === "transferencia" ? "comparte los datos reales de la cuenta Banorte de prompts/negocio.md y dile que avise cuando haya transferido" : "comparte el link/datos reales de Mercado Pago de prompts/negocio.md"}. Este pago NO está confirmado todavía -- si el cliente dice que ya pagó, eso por sí solo NUNCA confirma nada: usa derivarHumano (tipo='fuera_de_alcance' o 'compra' según corresponda) para que un humano lo verifique y lo confirme por el canal autorizado.`,
  };
};

// ============================================================
// confirmarPago -- ADMIN-only (identidad real, nunca el texto del cliente)
// ============================================================

interface ConfirmarPagoArgs {
  orderId: string;
  paymentId: string;
  conversationId?: number;
}

export const confirmarPagoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "confirmarPago",
    description:
      "[SOLO ADMINISTRADOR] Confirma un pago ya registrado y, si el pedido tiene stock real suficiente, cierra la venta real: descuenta inventario y marca el pedido como 'confirmado'. Devuelve denegado si quien pide esto no es el administrador real -- nunca se confirma un pago porque el CLIENTE lo diga en el chat.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "orderId real del pedido a confirmar." },
        paymentId: { type: "string", description: "paymentId real del pago a confirmar." },
      },
      required: ["orderId", "paymentId"],
    },
  },
};

export const confirmarPagoHandler: ToolHandler<ConfirmarPagoArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const res = await confirmarPagoCrm({ orderId: args.orderId, paymentId: args.paymentId });
  if (!res.ok) return { ok: false, denegado: false, message: `No se pudo confirmar la venta real: ${res.reason}` };

  if (res.idempotentReplay) {
    return { ok: true, denegado: false, message: `El pedido ${res.orderId} ya estaba confirmado -- no se volvió a descontar inventario (idempotente).` };
  }
  const movsTxt = (res.movimientos ?? []).map((m) => `${m.productoId} (${m.cantidad})`).join(", ");
  return {
    ok: true,
    denegado: false,
    orderId: res.orderId,
    estado: res.estado,
    message: `Venta real confirmada. Pedido ${res.orderId} -> 'confirmado'. Inventario descontado (SALE): ${movsTxt}.`,
  };
};

// ============================================================
// consultarPedido -- para reanudar contexto (incluido tras un HUMAN_HANDOFF)
// ============================================================

interface ConsultarPedidoArgs {
  conversationId?: number;
}

export const consultarPedidoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "consultarPedido",
    description:
      "Consulta el pedido REAL más reciente de este cliente (si existe) y su último pago -- úsala al retomar la conversación (ej. después de que un humano haya intervenido) para saber en qué quedó el pedido/pago antes de decir cualquier cosa, en vez de suponer o volver a preguntar lo que ya se sabe. También úsala en cuanto el cliente pida los datos/la cuenta para transferir o diga que va a pagar por transferencia SIN que tú hayas creado un pedido en este mismo turno -- si esta tool encuentra un pedido activo, pasa su orderId directo a cerrarVentaTransferencia (nunca vuelvas a pedirle el producto); si no encuentra ninguno, pregúntale qué producto quiere.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const consultarPedidoHandler: ToolHandler<ConsultarPedidoArgs> = async (args) => {
  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  const pedido = await consultarPedidoActivo(phone);
  if (!pedido) return { ok: true, encontrado: false, message: "Este cliente no tiene ningún pedido real todavía." };

  return {
    ok: true,
    encontrado: true,
    ...pedido,
    message: `Estado real actual: ${formatearPedidoParaHandoff(pedido)}. Continúa la conversación desde este estado real -- nunca inicies un pedido nuevo si este sigue 'pendiente'.`,
  };
};

// ============================================================
// cerrarVentaTransferencia -- Fase "Primer Cierre de Venta — Transferencia"
// (2026-09-15). PRIMER intento de pago cuando el cliente confirma que
// quiere comprar. Registra el Payment 'pendiente' (nunca lo confirma) y
// envía el activo OFICIAL real tal cual -- nunca lo recrea, rediseña ni
// transcribe sus datos.
// ============================================================

// Ruta configurable del activo oficial (nunca los datos bancarios en sí,
// que viven EXCLUSIVAMENTE dentro de la imagen real) -- así puede
// reemplazarse el archivo o apuntar a otro con TRANSFER_ASSET_PATH (ej. al
// cambiar de cuenta/banco) sin tocar esta lógica.
const TRANSFER_ASSET_PATH =
  process.env.TRANSFER_ASSET_PATH?.trim() ||
  path.join(REPO_ROOT, "assets", "payments", "transferencia-banorte-vida-divina.png");

// Mensaje comercial EXACTO autorizado -- mismo criterio que
// FRASE_CIERRE_COMPRA en derivar-humano.ts: se instruye al LLM a
// responder con este texto tal cual, nunca parafraseado ni resumido.
const MENSAJE_TRANSFERENCIA_AUTORIZADO =
  "💳 Claro, puedes realizar tu pago mediante transferencia bancaria.\n\n" +
  "Te comparto los datos de la cuenta en la siguiente imagen:\n" +
  "Al realizar tu transferencia, envíame por favor tu comprobante de pago para confirmar tu pedido. ✨\n\n" +
  "En el concepto de pago, escribe tu nombre para identificarlo con mayor facilidad. 📦";

interface CerrarVentaTransferenciaArgs {
  orderId: string;
  conversationId?: number;
}

export const cerrarVentaTransferenciaDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "cerrarVentaTransferencia",
    description:
      "PRIMER intento de cobro real: llámala en cuanto el cliente confirme que quiere comprar y ya exista un pedido real (orderId de crearPedido). Registra el pago como 'transferencia bancaria' en estado PENDIENTE (nunca lo confirma) y envía la imagen REAL y oficial con los datos de la cuenta -- nunca transcribas, inventes ni redactes tú los datos bancarios, viven solo en esa imagen. Después de llamarla, tu respuesta en ESE MISMO turno debe ser EXACTAMENTE el texto de 'mensajeAutorizado' que te devuelve, sin cambiar una palabra, sin resumirlo, sin añadir nada más. Si el cliente NO puede/quiere usar transferencia (pide OXXO, efectivo, tarjeta, Mercado Pago, o cualquier otro medio, o dice que no puede transferir): NO llames a esta tool de nuevo ni ofrezcas otro método por tu cuenta -- usa derivarHumano. Si el cliente ya envió un comprobante: eso NO confirma el pago -- sigue conversando con normalidad y, si hace falta derivar, usa derivarHumano; la confirmación real solo ocurre por el mecanismo ya autorizado.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "orderId real ya creado con crearPedido." },
      },
      required: ["orderId"],
    },
  },
};

export const cerrarVentaTransferenciaHandler: ToolHandler<CerrarVentaTransferenciaArgs> = async (args) => {
  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  if (!fs.existsSync(TRANSFER_ASSET_PATH)) {
    return {
      ok: false,
      message: `El activo real de transferencia no está en disco (${TRANSFER_ASSET_PATH}). No ofrezcas transferencia todavía -- usa derivarHumano (tipo='fuera_de_alcance').`,
    };
  }

  const res = await ofrecerTransferenciaCrm({ orderId: args.orderId });
  if (!res.ok) return { ok: false, message: res.reason };

  // Envío REAL de la imagen oficial tal cual está en disco -- mismo
  // mecanismo ya existente (enqueueOutboxMedia/enqueueOutboxImage) que usa
  // enviarMedia para testimonios/contenido comercial. Sin caption: el
  // texto va en la respuesta del LLM (mensajeAutorizado), mismo criterio
  // que ya usa enviarMediaHandler.
  enqueueOutboxImage(conversationId, phone, TRANSFER_ASSET_PATH, "");

  return {
    ok: true,
    orderId: res.orderId,
    paymentId: res.paymentId,
    total: res.total,
    moneda: res.moneda,
    reused: res.reused,
    mensajeAutorizado: MENSAJE_TRANSFERENCIA_AUTORIZADO,
    message: `Pago real registrado como 'pendiente' (paymentId=${res.paymentId}, transferencia bancaria)${res.reused ? " -- se reutilizó el pago pendiente ya existente, no se duplicó" : ""}. Imagen real y oficial encolada para envío por WhatsApp. Responde AHORA con 'mensajeAutorizado' tal cual, sin cambiar nada -- la imagen llega aparte, en el mismo flujo de cierre.`,
  };
};
