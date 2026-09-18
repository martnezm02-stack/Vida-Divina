// seguimientoService.ts — Núcleo real de "agendar seguimiento" (FASE
// "Hermes Ventas: Gmail + Google Calendar" + "Rediseño Dashboard Hermes
// Ventas", 2026-09-18). Extraído de tools/seguimiento.ts para que TANTO la
// tool de Hermes (ADMIN vía WhatsApp) COMO la nueva ruta del Dashboard
// (/api/calendario) llamen exactamente la misma lógica real -- nunca dos
// implementaciones del mismo agendamiento/idempotencia. La autorización
// (quién puede llamar esto) es responsabilidad de quien importa este
// archivo, nunca de aquí.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";
import { formatearPrecio } from "./crmClient";
import { callEmailMcpTool } from "./emailMcpClient";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");
let _crm: any = null;
export async function crm(): Promise<any> {
  // /* webpackIgnore: true */ obligatorio (2026-09-18): esta función la
  // llama tanto el proceso del bot (tsx, sin bundler) como /api/calendario,
  // bundleado por Turbopack (ver alertas.ts para el hallazgo real original).
  if (!_crm) _crm = await import(/* webpackIgnore: true */ pathToFileURL(CRM_INDEX_PATH).href);
  return _crm;
}

export type TipoSeguimiento = "dia3" | "semana1";

export const TIPO_A_FOLLOWUP: Record<TipoSeguimiento, string> = {
  dia3: "postventa_dia3",
  semana1: "postventa_semana",
};
export const TIPO_A_DIAS: Record<TipoSeguimiento, number> = {
  dia3: 3,
  semana1: 7,
};
export const TIPO_A_ETIQUETA: Record<TipoSeguimiento, string> = {
  dia3: "Día 3",
  semana1: "Semana 1",
};

export interface AgendarSeguimientoInput {
  orderId: string;
  tipo: TipoSeguimiento;
  notas?: string;
}

export interface AgendarSeguimientoResult {
  ok: boolean;
  agendado: boolean;
  followUpId?: string;
  calendarSincronizado?: boolean;
  eventId?: string;
  reutilizado?: boolean;
  message: string;
}

/**
 * Crea/reutiliza el follow-up real en el CRM (fuente de verdad) y su
 * evento correspondiente en Google Calendar (representación operativa,
 * idempotente vía extendedProperties -- ver email-mcp-server/src/calendarService.js).
 * NUNCA modifica inventario, precios, pagos ni pedidos -- solo agenda.
 */
export async function agendarSeguimiento(input: AgendarSeguimientoInput): Promise<AgendarSeguimientoResult> {
  const c = await crm();
  const order = await c.orders.findById(input.orderId);
  if (!order) {
    return { ok: true, agendado: false, message: `No existe ningún pedido real con orderId "${input.orderId}" -- no se agendó nada.` };
  }

  const [items, customer, canales, conversaciones] = await Promise.all([
    c.orders.listItemsByOrderId(order.orderId),
    c.customers.findCustomerById(order.customerId),
    c.customerChannels.listByCustomerId(order.customerId),
    c.conversations.listByCustomerId(order.customerId),
  ]);

  const conversacion = conversaciones[0]; // más reciente real (iniciado_en DESC)
  if (!conversacion) {
    return {
      ok: true,
      agendado: false,
      message: `El cliente del pedido ${order.orderId} no tiene ninguna conversación real registrada en el CRM -- no hay dónde asociar el seguimiento.`,
    };
  }

  const telefono = canales[0]?.identificadorExterno ?? null;
  const tipoFollowUp = TIPO_A_FOLLOWUP[input.tipo];

  // Idempotencia a nivel CRM: reutiliza un follow-up pendiente real ya
  // existente del mismo tipo para esta conversación, en vez de duplicarlo.
  const existentes = await c.followUps.listByConversationId(conversacion.conversationId);
  let followUp = existentes.find((f: any) => f.tipo === tipoFollowUp && f.estado === "pendiente");
  if (!followUp) {
    const fechaProgramada = new Date(Date.now() + TIPO_A_DIAS[input.tipo] * 24 * 60 * 60 * 1000);
    followUp = await c.followUps.createFollowUp({ conversationId: conversacion.conversationId, tipo: tipoFollowUp, fechaProgramada });
  }

  const productoNombre = items[0]
    ? (await getProductTitleById(items[0].productoId).catch(() => null)) ?? items[0].productoId
    : null;

  const descripcionLineas = [
    `Cliente: ${customer?.nombre ?? "no disponible"}`,
    `Producto: ${productoNombre ?? "no disponible"}`,
    `Pedido: ${order.orderId}`,
    `Fecha de compra: ${order.createdAt ?? "no disponible"}`,
    `Teléfono: ${telefono ?? "no disponible"}`,
    `Tipo de seguimiento: ${TIPO_A_ETIQUETA[input.tipo]}`,
    `Total del pedido: ${formatearPrecio(Number(order.total))}`,
  ];
  if (input.notas) descripcionLineas.push(`Notas: ${input.notas}`);

  const inicio = new Date(followUp.fechaProgramada);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);

  const draft = await callEmailMcpTool("createFollowUpCalendarEvent", {
    followUpId: followUp.followUpId,
    titulo: `Seguimiento ${TIPO_A_ETIQUETA[input.tipo]} — ${customer?.nombre ?? telefono ?? order.orderId}`,
    descripcion: descripcionLineas.join("\n"),
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
  });

  if (!draft.ok) {
    return {
      ok: true,
      agendado: true,
      followUpId: followUp.followUpId,
      calendarSincronizado: false,
      message: `Seguimiento real guardado en el CRM (follow_up_id: ${followUp.followUpId}, fecha: ${followUp.fechaProgramada}) -- NO se pudo sincronizar con Google Calendar (${draft.message}). El seguimiento no se pierde, sigue pendiente en el CRM.`,
    };
  }

  const evento = draft.data as { eventId?: string; reutilizado?: boolean } | undefined;
  return {
    ok: true,
    agendado: true,
    followUpId: followUp.followUpId,
    calendarSincronizado: true,
    eventId: evento?.eventId,
    reutilizado: evento?.reutilizado ?? false,
    message: `Seguimiento real agendado -- CRM (follow_up_id: ${followUp.followUpId}) + Google Calendar (eventId: ${evento?.eventId}${evento?.reutilizado ? ", ya existía, reutilizado" : ""}).`,
  };
}
