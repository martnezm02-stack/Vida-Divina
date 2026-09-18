import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/vidaDivina/dashboardSummary";

// GET /api/dashboard-summary -- KPIs comerciales reales + seguimientos de
// HOY + actividad reciente para el Dashboard Home (FASE "Rediseño
// Dashboard Hermes Ventas", 2026-09-18). Solo lectura, reutiliza
// reportingRepository/followUpRepository. NUNCA calendario mensual/semanal
// -- eso vive solo en /api/calendario.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getDashboardSummary();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
