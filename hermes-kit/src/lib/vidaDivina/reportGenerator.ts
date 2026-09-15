// reportGenerator.ts — Generador de reportes reales (FASE "Attribution +
// Reporting + Email MCP + Alerta WhatsApp", 2026-09-04). Toda cifra sale de
// PostgreSQL real (crm.reporting.*, solo lectura, SQL parametrizado fijo) --
// nunca se aproxima ni se inventa. Cuando falta un dato real (sin
// atribución, sin ventas confirmadas), se declara explícitamente.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";
import { resolvePeriodKeyword, resolveDateRange, type ResolvedPeriod, type PeriodKeyword } from "./reportPeriods";
import { getAnalytics } from "../db";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");
let _crm: any = null;
async function crm(): Promise<any> {
  if (!_crm) _crm = await import(pathToFileURL(CRM_INDEX_PATH).href);
  return _crm;
}

export interface ReportRequest {
  periodo?: PeriodKeyword;
  rangoDesde?: string;
  rangoHasta?: string;
}

export interface ReportData {
  periodo: ResolvedPeriod;
  clientesNuevos: number;
  leads: number;
  leadsCalificados: number;
  handoffs: number;
  handoffsAbiertos: number;
  productosTopIntencion: Array<{ producto: string; intentos: number }>;
  origenNuevosClientes: Array<{ valor: string; n: number }>;
  mejorOrigen: string | null;
  mejorCampaña: string | null;
  // Volumen real de mensajes de WhatsApp de HOY (SQLite local de hermes-kit,
  // vía getAnalytics() -- nunca CRM/PostgreSQL, es un dato de infraestructura
  // del propio bot, no de negocio). Siempre HOY, independiente del `periodo`
  // pedido para el resto del reporte (no hay histórico diario más atrás en
  // esta fase).
  mensajesHoy: { usuario: number; bot: number };
}

function resolvePeriod(req: ReportRequest): ResolvedPeriod {
  if (req.rangoDesde && req.rangoHasta) return resolveDateRange(req.rangoDesde, req.rangoHasta);
  return resolvePeriodKeyword(req.periodo ?? "esta_semana");
}

/** Genera el reporte real completo para un periodo -- una sola consulta compuesta, reutilizable para CUALQUIER pregunta natural sobre ese mismo periodo. */
export async function generateReport(req: ReportRequest): Promise<ReportData> {
  const periodo = resolvePeriod(req);
  const { since, until } = periodo;
  const c = await crm();
  const r = c.reporting;

  const [clientesNuevos, leads, leadsCalificados, handoffs, handoffsAbiertos, topProductos, origenNuevos, mejorCampañaRows] = await Promise.all([
    r.countNewCustomers({ since, until }),
    r.countLeads({ since, until }),
    r.countQualifiedLeads({ since, until }),
    r.countHandoffs({ since, until }),
    r.countOpenHandoffs({ since, until }),
    r.topProductsByPurchaseIntent({ since, until, limit: 5 }),
    r.attributionBreakdown({ since, until, dimension: "platform", touch: "first", limit: 10 }),
    r.attributionBreakdown({ since, until, dimension: "campaign", touch: "first", limit: 5 }),
  ]);

  const productosTopIntencion = await Promise.all(
    topProductos.map(async (p: { productoId: string; intentos: number }) => ({
      producto: (await getProductTitleById(p.productoId).catch(() => null)) ?? p.productoId,
      intentos: p.intentos,
    }))
  );

  const origenReal = origenNuevos.filter((o: { valor: string }) => o.valor !== "unknown");
  const mejorOrigen = origenReal[0]?.valor ?? null;

  const campañaReal = mejorCampañaRows.filter((c2: { valor: string }) => c2.valor !== "unknown");
  const mejorCampaña = campañaReal[0]?.valor ?? null;

  // Mensajes de WhatsApp de HOY, reales, desde la SQLite local del bot
  // (getAnalytics() ya existente -- nunca CRM/PostgreSQL).
  const ahora = new Date();
  const inicioHoy = Math.floor(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime() / 1000);
  const analiticaHoy = getAnalytics(inicioHoy);
  const mensajesHoy = analiticaHoy.days.reduce(
    (acc, d) => ({ usuario: acc.usuario + d.userMsgs, bot: acc.bot + d.botMsgs }),
    { usuario: 0, bot: 0 }
  );

  return {
    periodo,
    clientesNuevos,
    leads,
    leadsCalificados,
    handoffs,
    handoffsAbiertos,
    productosTopIntencion,
    origenNuevosClientes: origenNuevos,
    mejorOrigen,
    mejorCampaña,
    mensajesHoy,
  };
}

/** Resumen ejecutivo breve -- para WhatsApp (ver ejemplo real del encargo). */
export function formatResumenEjecutivo(data: ReportData): string {
  const lineas = [
    `Resumen ${data.periodo.label} — Vida Divina`,
    "",
    `Clientes nuevos: ${data.clientesNuevos}`,
    `Leads: ${data.leads}`,
    `Calificados: ${data.leadsCalificados}`,
    `Handoffs: ${data.handoffs} (${data.handoffsAbiertos} sin resolver)`,
  ];
  if (data.productosTopIntencion.length > 0) {
    lineas.push("", "Top productos (por intención de compra real):");
    data.productosTopIntencion.forEach((p, i) => lineas.push(`${i + 1}. ${p.producto}`));
  }
  lineas.push("", `Mejor origen: ${data.mejorOrigen ?? "Sin atribución disponible."}`);
  lineas.push(`Mejor campaña: ${data.mejorCampaña ?? "Sin atribución disponible."}`);
  lineas.push("", `Mensajes de hoy: ${data.mensajesHoy.usuario} de clientes, ${data.mensajesHoy.bot} de Hermes.`);
  return lineas.join("\n");
}

/** Reporte formal completo -- para correo. Incluye todo lo del resumen + desglose de atribución y advertencias honestas. */
export function formatReporteFormal(data: ReportData): string {
  const lineas = [
    `REPORTE ${data.periodo.label.toUpperCase()} — VIDA DIVINA`,
    `Periodo real: ${data.periodo.since.toISOString().slice(0, 10)} a ${new Date(data.periodo.until.getTime() - 1).toISOString().slice(0, 10)}`,
    "",
    "== CLIENTES Y LEADS ==",
    `Clientes nuevos: ${data.clientesNuevos}`,
    `Leads (oportunidades reales): ${data.leads}`,
    `Leads calificados (intención de compra real): ${data.leadsCalificados}`,
    "",
    "== VENTAS ==",
    "Sin datos reales de venta confirmada disponibles (el CRM no tiene todavía tablas orders/payments -- decisión de negocio pendiente).",
    `Proxy más cercano disponible: ${data.leadsCalificados} oportunidad(es) con intención de compra real.`,
    "",
    "== HANDOFFS ==",
    `Total: ${data.handoffs} · Sin resolver: ${data.handoffsAbiertos}`,
    "",
    "== PRODUCTOS (por intención de compra real) ==",
  ];
  if (data.productosTopIntencion.length === 0) {
    lineas.push("Sin oportunidades reales en este periodo.");
  } else {
    data.productosTopIntencion.forEach((p, i) => lineas.push(`${i + 1}. ${p.producto} — ${p.intentos} intento(s) real(es)`));
  }
  lineas.push("", "== ATRIBUCIÓN (first_touch de clientes nuevos, por plataforma) ==");
  if (data.origenNuevosClientes.length === 0) {
    lineas.push("Sin clientes nuevos en este periodo.");
  } else {
    data.origenNuevosClientes.forEach((o) => lineas.push(`${o.valor === "unknown" ? "Sin atribución disponible" : o.valor}: ${o.n}`));
  }
  return lineas.join("\n");
}
