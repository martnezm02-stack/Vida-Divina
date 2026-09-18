import { NextResponse } from "next/server";
import { generateInventoryReport, formatResumenInventario, formatReporteInventarioFormal } from "@/lib/vidaDivina/inventoryReportGenerator";

// GET /api/reportes/inventario -- reutiliza EXACTAMENTE generateInventoryReport()
// (inventoryReportGenerator.ts), el mismo motor real que usa la tool
// adminReporteInventario y que ya comparte cálculo con el Dashboard vía
// crm/services/inventorySnapshot.js -- nunca un segundo cálculo. Solo lectura.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await generateInventoryReport();
    return NextResponse.json({
      ok: true,
      data,
      resumenEjecutivo: formatResumenInventario(data),
      reporteFormal: formatReporteInventarioFormal(data),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
