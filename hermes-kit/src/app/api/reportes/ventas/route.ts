import { NextRequest, NextResponse } from "next/server";
import { generateReport, formatResumenEjecutivo, formatReporteFormal } from "@/lib/vidaDivina/reportGenerator";
import type { PeriodKeyword } from "@/lib/vidaDivina/reportPeriods";

// GET /api/reportes/ventas?periodo=esta_semana -- reutiliza EXACTAMENTE
// generateReport()/reportGenerator.ts, el mismo motor real que usa la tool
// adminGenerarReporte -- nunca un segundo cálculo. Solo lectura.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const periodo = (searchParams.get("periodo") as PeriodKeyword | null) ?? "esta_semana";

  try {
    const data = await generateReport({ periodo });
    return NextResponse.json({
      ok: true,
      data,
      resumenEjecutivo: formatResumenEjecutivo(data),
      reporteFormal: formatReporteFormal(data),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
