import { NextResponse } from "next/server";
import { listHandoffAlerts } from "@/lib/vidaDivina/alertas";

// GET /api/alertas -- bandeja de alertas internas de handoff (FASE "Alerta
// interna de handoff"). Solo lectura: compone handoffs reales sin resolver
// (crm.handoffs) con su contexto real (opportunities/messages/conversations).
// No envía nada por WhatsApp, no toca Meta Cloud API, no crea eventos nuevos.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const alertas = await listHandoffAlerts({ limit: 50 });
    return NextResponse.json({ ok: true, alertas, count: alertas.length });
  } catch (err) {
    // `ok:false` + `error` real (2026-09-12, hallazgo real: un fallo real
    // del CRM -- ej. el import() dinámico incompatible con Turbopack --
    // quedaba indistinguible de "no hay handoffs pendientes", la misma
    // forma que una bandeja genuinamente vacía). El Dashboard debe poder
    // distinguir ambos casos; sigue devolviendo 200 para no romper la
    // carga de la página por esto.
    return NextResponse.json(
      { ok: false, alertas: [], count: 0, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
