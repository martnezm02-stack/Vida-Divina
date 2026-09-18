// inventario.ts — Reporte de inventario real para Hermes Ventas (FASE
// "Hermes Ventas: Reporte de Inventario + Envío por Correo", 2026-09-17).
// SOLO ADMIN (misma identidad real de identity.ts, nunca por lo que el
// remitente diga). SOLO LECTURA: esta tool nunca modifica `inventory` --
// no crea movimientos, no confirma ventas, no altera precios ni mínimos.
// Reutiliza el cálculo real de crm/services/inventorySnapshot.js (misma
// fuente que el Dashboard) y el mecanismo de correo ya existente
// (Gmail MCP vía emailMcpClient/gmail.ts): pedir el envío crea un BORRADOR
// real, nunca lo envía directo -- el envío real requiere una confirmación
// aparte del administrador con adminEnviarBorradorAprobado, mismo criterio
// de seguridad que adminGenerarReporte (ver reporting.ts).

import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { generateInventoryReport, formatResumenInventario, formatReporteInventarioFormal } from "../vidaDivina/inventoryReportGenerator";
import { callEmailMcpTool } from "../vidaDivina/emailMcpClient";
import { registerDraftCreated } from "../vidaDivina/draftConfirmationRegistry";

interface AdminReporteInventarioArgs {
  enviarPorCorreo?: boolean;
  mostrarReporteCompletoAqui?: boolean;
  conversationId?: number;
}

export const adminReporteInventarioDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminReporteInventario",
    description:
      "[SOLO ADMINISTRADOR, SOLO LECTURA] Genera el reporte REAL de inventario de Vida Divina (existencia total, valor total a costo, productos agotados/en mínimo/normales, detalle por producto) -- todo desde PostgreSQL real (misma tabla `inventory` que usa el Dashboard), nunca aproximado ni del mockup del Dashboard. Esta tool NUNCA modifica inventario -- no descuenta stock, no crea movimientos, no confirma ventas, no cambia precios ni mínimos. Úsala ante cualquier pregunta administrativa sobre el estado real del inventario. NUNCA le preguntes al remitente si es administrador -- llama a esta tool directamente: si no es admin, la tool lo dice sola (denegado:true) y respondes con naturalidad sin mencionarlo. Si el admin pide 'envíamelo por correo' / 'mándame el reporte de inventario', pon enviarPorCorreo:true (crea un BORRADOR real vía Gmail MCP, NUNCA lo envía directo -- el envío real requiere una confirmación aparte con adminEnviarBorradorAprobado). Si pide ver el detalle completo en el chat, pon mostrarReporteCompletoAqui:true -- si no lo pide así, responde solo con el resumen ejecutivo.",
    parameters: {
      type: "object",
      properties: {
        enviarPorCorreo: { type: "boolean", description: "true SOLO si el admin pidió explícitamente que se lo envíes/prepares por correo -- crea un BORRADOR real en Gmail, nunca lo envía directo." },
        mostrarReporteCompletoAqui: { type: "boolean", description: "true SOLO si el admin pidió explícitamente ver el reporte completo/formal en el chat, no solo un resumen." },
      },
      required: [],
    },
  },
};

export const adminReporteInventarioHandler: ToolHandler<AdminReporteInventarioArgs> = async (args) => {
  const phone = leadPhone(args.conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: true,
      denegado: true,
      message: "Acción administrativa DENEGADA: quien pregunta no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }

  let data;
  try {
    data = await generateInventoryReport();
  } catch (err) {
    return { ok: false, message: `No se pudo generar el reporte real de inventario: ${err instanceof Error ? err.message : String(err)}` };
  }

  const resumenEjecutivo = formatResumenInventario(data);
  let borradorCreado = false;
  let borradorId: string | undefined;
  let correoMensaje: string | undefined;

  if (args.enviarPorCorreo) {
    const formal = formatReporteInventarioFormal(data);
    const draft = await callEmailMcpTool("createDraft", {
      subject: `Reporte de Inventario — Vida Divina — ${data.actualizadoEn.slice(0, 10)}`,
      body: formal,
    });
    borradorCreado = draft.ok;
    correoMensaje = draft.message;
    borradorId = (draft.data as { draftId?: string } | undefined)?.draftId;
    if (borradorCreado && borradorId && args.conversationId) {
      registerDraftCreated(args.conversationId, borradorId);
    }
  }

  return {
    ok: true,
    denegado: false,
    reporteDatos: data,
    resumenEjecutivo,
    reporteFormal: args.mostrarReporteCompletoAqui ? formatReporteInventarioFormal(data) : undefined,
    borradorCreado,
    borradorId,
    instruccion: args.enviarPorCorreo
      ? (borradorCreado
          ? `Borrador real creado en Gmail (draftId: ${borradorId}) -- NO enviado. Dile al admin: "Preparé el reporte de inventario y lo dejé en borradores para revisión." y da el resumen ejecutivo. Solo envía el correo real si el admin lo pide explícitamente después, usando adminEnviarBorradorAprobado con este draftId.`
          : `El borrador NO se pudo crear (${correoMensaje}). Dilo con honestidad y ofrece el resumen igualmente.`)
      : "No se pidió correo -- responde con el resumen ejecutivo (o el detalle completo solo si mostrarReporteCompletoAqui era necesario).",
  };
};
