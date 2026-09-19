import { NextRequest, NextResponse } from "next/server";
import { generateReport, formatReporteFormal } from "@/lib/vidaDivina/reportGenerator";
import { generateInventoryReport, formatReporteInventarioHtml } from "@/lib/vidaDivina/inventoryReportGenerator";
import type { PeriodKeyword } from "@/lib/vidaDivina/reportPeriods";
import { callEmailMcpTool } from "@/lib/vidaDivina/emailMcpClient";

// Destinatario fijo del reporte de inventario real (FASE "Cierre de
// autenticación + logo + correo de inventario", 2026-09-19) -- corregido
// tras confirmar con el usuario (el mensaje original de la fase traía
// "manuel_octavio:mtz@hotmail.com", con dos puntos -- typo real). Nunca
// cambiar sin una nueva instrucción explícita.
const INVENTARIO_DESTINATARIO = "manuel_octavio_mtz@hotmail.com";

// POST /api/reportes/enviar { tipo: "ventas"|"inventario", periodo? }
//
// tipo="inventario": ENVÍO REAL (createDraft + sendApprovedEmail, mismo
// Gmail API real ya existente -- nunca un segundo cliente/OAuth). Cuerpo
// HTML real (formatReporteInventarioHtml, MISMOS datos que
// generateInventoryReport()/ReportesPanel.tsx consumen -- nunca un segundo
// cálculo). Nunca deja el mensaje como borrador sin enviar, nunca reporta
// éxito si Gmail no confirmó el envío real.
//
// tipo="ventas": SIN CAMBIOS de esta fase -- sigue creando un borrador real
// (texto plano), el envío real sigue requiriendo confirmación aparte por
// WhatsApp (adminEnviarBorradorAprobado), tal como ya funcionaba.
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
    if (body.tipo === "inventario") {
      const data = await generateInventoryReport();
      const subject = `Reporte de Inventario — Vida Divina — ${data.actualizadoEn.slice(0, 10)}`;
      const html = formatReporteInventarioHtml(data);

      const draft = await callEmailMcpTool("createDraft", { to: INVENTARIO_DESTINATARIO, subject, body: html, html: true });
      if (!draft.ok) {
        return NextResponse.json({ ok: false, enviado: false, message: draft.message });
      }
      const draftId = (draft.data as { draftId?: string } | undefined)?.draftId;
      if (!draftId) {
        return NextResponse.json({ ok: false, enviado: false, message: "Gmail no devolvió un draftId real -- no se pudo continuar con el envío." });
      }

      const enviado = await callEmailMcpTool("sendApprovedEmail", { draftId });
      return NextResponse.json({
        ok: enviado.ok,
        enviado: enviado.ok,
        message: enviado.ok ? "Correo enviado correctamente." : enviado.message,
      });
    }

    const data = await generateReport({ periodo: body.periodo ?? "esta_semana" });
    const subject = `Reporte ${data.periodo.label} — Vida Divina`;
    const formal = formatReporteFormal(data);

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
