// dashboardSummary.ts — Agregado real para el Dashboard Home de Hermes
// Ventas (FASE "Rediseño Dashboard Hermes Ventas", 2026-09-18). SOLO
// LECTURA: reutiliza reportingRepository (KPIs comerciales reales, mismo
// cálculo que adminGenerarReporte), followUpRepository.listPendingDueBy
// (seguimientos de HOY, tal cual pide el encargo) y las conversaciones
// locales reales (estado AI/HUMAN) -- nunca un cálculo paralelo. NO incluye
// ningún dato de calendario mensual/semanal (eso vive solo en
// calendarioView.ts / la vista Calendario).

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";
import { resolvePeriodKeyword } from "./reportPeriods";
import { listConversations } from "../db";
import { composeFollowUpContext, listCalendarioEventos, type CalendarioEvento } from "./calendarioView";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");
let _crm: any = null;
async function crm(): Promise<any> {
  // /* webpackIgnore: true */ obligatorio (2026-09-18): llamado por
  // /api/dashboard-summary, bundleado por Turbopack.
  if (!_crm) _crm = await import(/* webpackIgnore: true */ pathToFileURL(CRM_INDEX_PATH).href);
  return _crm;
}

export interface ActividadReciente {
  tipo: "conversacion" | "oportunidad";
  texto: string;
  timestamp: string;
}

export interface DashboardSummary {
  periodo: { label: string; since: string; until: string };
  kpis: {
    clientesNuevos: number;
    leads: number;
    leadsCalificados: number;
    handoffs: number;
    handoffsAbiertos: number;
  };
  estadoConversaciones: { ai: number; human: number; total: number };
  seguimientosHoy: CalendarioEvento[];
  actividadReciente: ActividadReciente[];
  productosConMasInteres: Array<{ producto: string; intentos: number }>;
  // Resumen visual del mes en curso -- SOLO conteo de seguimientos reales
  // por día (para un mini-calendario de puntos en el Home), nunca el
  // calendario completo (eso vive en /api/calendario).
  resumenCalendarioMes: { mes: string; anio: number; diasConSeguimientos: Record<string, number> };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const c = await crm();
  const periodo = resolvePeriodKeyword("esta_semana");
  const { since, until } = periodo;

  const [clientesNuevos, leads, leadsCalificados, handoffs, handoffsAbiertos, oportunidadesRecientes, topProductos] = await Promise.all([
    c.reporting.countNewCustomers({ since, until }),
    c.reporting.countLeads({ since, until }),
    c.reporting.countQualifiedLeads({ since, until }),
    c.reporting.countHandoffs({ since, until }),
    c.reporting.countOpenHandoffs({ since, until }),
    c.reporting.listOpportunities({ since, until, limit: 8 }),
    // Mismo cálculo real que reportGenerator.ts#productosTopIntencion --
    // nunca "ventas" (el CRM no tiene tablas orders/payments confirmadas
    // agregadas todavía), solo intención de compra real.
    c.reporting.topProductsByPurchaseIntent({ since, until, limit: 5 }),
  ]);

  const productosConMasInteres = await Promise.all(
    topProductos.map(async (p: { productoId: string; intentos: number }) => ({
      producto: (await getProductTitleById(p.productoId).catch(() => null)) ?? p.productoId,
      intentos: p.intentos,
    }))
  );

  const conversaciones = listConversations();
  const estadoConversaciones = {
    ai: conversaciones.filter((cv) => cv.mode === "AI").length,
    human: conversaciones.filter((cv) => cv.mode === "HUMAN").length,
    total: conversaciones.length,
  };

  // Seguimientos de HOY: listPendingDueBy(finDeHoy) tal cual pide el
  // encargo -- todo lo real pendiente y ya vencido hasta el final del día
  // de hoy (hora local del servidor).
  const finDeHoy = new Date();
  finDeHoy.setHours(23, 59, 59, 999);
  const pendientesHoy = await c.followUps.listPendingDueBy(finDeHoy);
  const seguimientosHoy = await Promise.all(pendientesHoy.map(composeFollowUpContext));

  const actividadConversaciones: ActividadReciente[] = conversaciones
    .filter((cv) => cv.last_message_at != null)
    .slice(0, 5)
    .map((cv) => ({
      tipo: "conversacion" as const,
      texto: `Conversación activa — ${cv.name ?? cv.phone}${cv.last_message_preview ? `: "${cv.last_message_preview.slice(0, 60)}"` : ""}`,
      timestamp: new Date((cv.last_message_at as number) * 1000).toISOString(),
    }));

  const actividadOportunidades: ActividadReciente[] = await Promise.all(
    oportunidadesRecientes.map(async (o: any) => ({
      tipo: "oportunidad" as const,
      texto: `Interés de compra real — ${(await getProductTitleById(o.producto_id).catch(() => null)) ?? o.producto_id}`,
      timestamp: new Date(o.created_at).toISOString(),
    }))
  );

  const actividadReciente = [...actividadConversaciones, ...actividadOportunidades]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  // Resumen visual del mes en curso -- reutiliza listCalendarioEventos
  // (misma fuente real que la vista Calendario completa), solo se agrega a
  // conteo por día para el mini-calendario del Home.
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
  const eventosMes = await listCalendarioEventos(inicioMes, finMes);
  const diasConSeguimientos: Record<string, number> = {};
  for (const ev of eventosMes) {
    const dia = String(new Date(ev.fechaProgramada).getDate());
    diasConSeguimientos[dia] = (diasConSeguimientos[dia] ?? 0) + 1;
  }

  return {
    periodo: { label: periodo.label, since: since.toISOString(), until: until.toISOString() },
    kpis: { clientesNuevos, leads, leadsCalificados, handoffs, handoffsAbiertos },
    estadoConversaciones,
    seguimientosHoy,
    actividadReciente,
    productosConMasInteres,
    resumenCalendarioMes: { mes: inicioMes.toLocaleDateString("es-MX", { month: "long" }), anio: inicioMes.getFullYear(), diasConSeguimientos },
  };
}
