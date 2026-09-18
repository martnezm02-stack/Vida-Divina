// calendarioView.ts — Lectura real de seguimientos para la vista de
// Calendario del Dashboard (FASE "Rediseño Dashboard Hermes Ventas",
// 2026-09-18). SOLO LECTURA: compone follow_ups reales (crm.followUps,
// fuente de verdad) con el cliente/pedido real asociado a su conversación
// -- misma dirección de composición que seguimientoService.ts pero en
// sentido inverso (aquí se parte del follow-up, no del orderId), así que
// no se reutiliza literalmente esa función; sí se reutilizan los mismos
// repositorios reales (crm.orders/customers/followUps), nunca una segunda
// fuente.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");
let _crm: any = null;
async function crm(): Promise<any> {
  // /* webpackIgnore: true */ obligatorio (2026-09-18): llamado por
  // /api/calendario y /api/dashboard-summary, bundleados por Turbopack.
  if (!_crm) _crm = await import(/* webpackIgnore: true */ pathToFileURL(CRM_INDEX_PATH).href);
  return _crm;
}

export interface CalendarioEvento {
  followUpId: string;
  tipo: string;
  estado: string;
  fechaProgramada: string;
  cliente: string | null;
  telefono: string | null;
  orderId: string | null;
  producto: string | null;
}

/** Compone el contexto real (cliente/teléfono/pedido/producto) de UN follow-up real -- compartido entre listCalendarioEventos (rango de fechas) y el widget "seguimientos de hoy" del Dashboard (listPendingDueBy), nunca duplicado entre ambos. */
export async function composeFollowUpContext(f: any): Promise<CalendarioEvento> {
  const c = await crm();
  const conversacion = await c.conversations.findConversationById(f.conversationId);
  if (!conversacion) {
    return { followUpId: f.followUpId, tipo: f.tipo, estado: f.estado, fechaProgramada: f.fechaProgramada, cliente: null, telefono: null, orderId: null, producto: null };
  }

  const [customer, canales, order] = await Promise.all([
    c.customers.findCustomerById(conversacion.customerId),
    c.customerChannels.listByCustomerId(conversacion.customerId),
    c.orders.findLatestByCustomerId(conversacion.customerId),
  ]);

  let producto: string | null = null;
  if (order) {
    const items = await c.orders.listItemsByOrderId(order.orderId);
    if (items[0]) producto = (await getProductTitleById(items[0].productoId).catch(() => null)) ?? items[0].productoId;
  }

  return {
    followUpId: f.followUpId,
    tipo: f.tipo,
    estado: f.estado,
    fechaProgramada: f.fechaProgramada,
    cliente: customer?.nombre ?? null,
    telefono: canales[0]?.identificadorExterno ?? null,
    orderId: order?.orderId ?? null,
    producto,
  };
}

/**
 * Todos los seguimientos reales cuya fecha_programada cae en [since, until)
 * -- fuente real para la vista de Calendario (día/semana/mes), con
 * cliente/pedido/producto reales cuando existan (nunca inventados).
 */
export async function listCalendarioEventos(since: Date, until: Date): Promise<CalendarioEvento[]> {
  const c = await crm();
  const followUps = await c.followUps.listByDateRange({ since, until });
  return Promise.all(followUps.map(composeFollowUpContext));
}
