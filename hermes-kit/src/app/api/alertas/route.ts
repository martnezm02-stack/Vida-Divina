import { NextResponse } from "next/server";
import { listHandoffAlerts, listSeguimientosVencidos, listPagosPendientes } from "@/lib/vidaDivina/alertas";
import { getVidaDivinaSystemStatus } from "@/lib/vidaDivina/systemStatus";

// GET /api/alertas -- bandeja de alertas real (FASE "Alerta interna de
// handoff" + "Rediseño Dashboard Hermes Ventas", 2026-09-18). Solo lectura,
// cuatro fuentes reales, nunca inventadas: handoffs sin resolver
// (crm.handoffs), seguimientos vencidos (followUpRepository.listPendingDueBy),
// pagos/comprobantes pendientes de confirmar (paymentRepository.listPending)
// e integraciones caídas (Gmail/Calendar, mismo systemStatus.ts real).
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [alertas, seguimientosVencidos, pagosPendientes, systemStatus] = await Promise.all([
      listHandoffAlerts({ limit: 50 }),
      listSeguimientosVencidos(),
      listPagosPendientes(),
      getVidaDivinaSystemStatus(),
    ]);

    const integraciones: Array<{ integracion: string; mensaje: string }> = [];
    if (!systemStatus.gmail.configured) integraciones.push({ integracion: "Gmail", mensaje: "Gmail no está configurado o el token expiró." });
    if (!systemStatus.calendar.configured) integraciones.push({ integracion: "Google Calendar", mensaje: "Google Calendar no está configurado o el token expiró." });
    if (!systemStatus.crm.configured) integraciones.push({ integracion: "CRM", mensaje: "CRM (PostgreSQL) no está configurado en este entorno." });

    const count = alertas.length + seguimientosVencidos.length + pagosPendientes.length + integraciones.length;
    return NextResponse.json({ ok: true, alertas, seguimientosVencidos, pagosPendientes, integraciones, count });
  } catch (err) {
    // `ok:false` + `error` real (2026-09-12, hallazgo real: un fallo real
    // del CRM -- ej. el import() dinámico incompatible con Turbopack --
    // quedaba indistinguible de "no hay handoffs pendientes", la misma
    // forma que una bandeja genuinamente vacía). El Dashboard debe poder
    // distinguir ambos casos; sigue devolviendo 200 para no romper la
    // carga de la página por esto.
    return NextResponse.json(
      { ok: false, alertas: [], seguimientosVencidos: [], pagosPendientes: [], integraciones: [], count: 0, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
