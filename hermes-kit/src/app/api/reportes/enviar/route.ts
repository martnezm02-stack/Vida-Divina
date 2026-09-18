import { NextRequest, NextResponse } from "next/server";
import { generateReport, formatReporteFormal } from "@/lib/vidaDivina/reportGenerator";
import { generateInventoryReport, formatReporteInventarioFormal } from "@/lib/vidaDivina/inventoryReportGenerator";
import type { PeriodKeyword } from "@/lib/vidaDivina/reportPeriods";
import { callEmailMcpTool } from "@/lib/vidaDivina/emailMcpClient";

// POST /api/reportes/enviar { tipo: "ventas"|"inventario", periodo? } --
// crea un BORRADOR real en Gmail, mismo mecanismo EXACTO que
// adminGenerarReporte/adminReporteInventario (callEmailMcpTool("createDraft",...)
// -- nunca un segundo sistema de correo, nunca envía directo. El envío real
// sigue requiriendo confirmación aparte (adminEnviarBorradorAprobado, vía
// WhatsApp) -- esta ruta nunca envía.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { tipo?: "ventas" | "inventario"; periodo?: PeriodKeyword };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (body.tipo !== "ventas" && body.tipo !== "inventario") {
    return NextResponse.json({ ok: false, error: 'tipo debe ser "ventas" o "inventario".' }, { status: 400 });
  }

  try {
    let subject: string;
    let formal: string;

    if (body.tipo === "ventas") {
      const data = await generateReport({ periodo: body.periodo ?? "esta_semana" });
      subject = `Reporte ${data.periodo.label} — Vida Divina`;
      formal = formatReporteFormal(data);
    } else {
      const data = await generateInventoryReport();
      subject = `Reporte de Inventario — Vida Divina — ${data.actualizadoEn.slice(0, 10)}`;
      formal = formatReporteInventarioFormal(data);
    }

    const draft = await callEmailMcpTool("createDraft", { subject, body: formal });
    return NextResponse.json({
      ok: draft.ok,
      borradorCreado: draft.ok,
      borradorId: (draft.data as { draftId?: string } | undefined)?.draftId,
      message: draft.ok
        ? "Borrador real creado en Gmail -- NO enviado. El envío real requiere confirmación aparte por WhatsApp (adminEnviarBorradorAprobado)."
        : draft.message,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
