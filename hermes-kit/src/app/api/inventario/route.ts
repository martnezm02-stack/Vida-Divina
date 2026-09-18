import { NextResponse } from "next/server";
import { generateInventoryReport } from "@/lib/vidaDivina/inventoryReportGenerator";

// GET /api/inventario -- vista de Inventario dentro de Hermes Ventas (FASE
// "Rediseño Dashboard Hermes Ventas", 2026-09-18). Reutiliza EXACTAMENTE
// generateInventoryReport() (inventoryReportGenerator.ts), que a su vez
// reutiliza crm/services/inventorySnapshot.js -- MISMO cálculo real que
// dashboard/server/routes/inventory.js (Creative Studio) usa hoy, nunca un
// segundo cálculo. PostgreSQL (crm.inventory) sigue siendo la única fuente
// de verdad. Solo lectura.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await generateInventoryReport();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
