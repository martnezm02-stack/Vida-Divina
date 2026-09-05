// reporting.ts — Reporting administrativo real de Hermes (FASE
// "Attribution + Reporting + Email MCP + Alerta WhatsApp", 2026-09-04).
// SOLO ADMIN (misma identidad real de identity.ts, nunca por lo que el
// remitente diga). Un único tool consolidado: el LLM le pasa el periodo
// natural y las preferencias de envío que el admin pidió, y recibe TODA la
// métrica real de una vez -- responde luego cualquier pregunta natural
// sobre clientes/leads/productos/atribución/campañas con esos mismos datos
// reales, sin volver a consultar. Nunca aproxima, nunca inventa cifras.

import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { generateReport, formatResumenEjecutivo, formatReporteFormal } from "../vidaDivina/reportGenerator";
import { callEmailMcpTool } from "../vidaDivina/emailMcpClient";
import { registerDraftCreated } from "../vidaDivina/draftConfirmationRegistry";
import type { PeriodKeyword } from "../vidaDivina/reportPeriods";

interface AdminGenerarReporteArgs {
  periodo?: PeriodKeyword;
  rangoDesde?: string;
  rangoHasta?: string;
  enviarPorCorreo?: boolean;
  mostrarReporteCompletoAqui?: boolean;
  conversationId?: number;
}

export const adminGenerarReporteDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminGenerarReporte",
    description:
      "[SOLO ADMINISTRADOR] Genera el reporte administrativo REAL de Vida Divina para un periodo (clientes nuevos, leads, calificados, handoffs, productos por intención de compra, atribución first/last touch, campañas) -- todo desde PostgreSQL real, nunca aproximado. Úsala para CUALQUIER pregunta administrativa sobre clientes/leads/ventas/productos/atribución/campañas/plataformas, aunque solo se pida una cifra: trae todo el reporte y responde con el dato real que corresponda. REGLA DURA: llama a esta tool EN CADA turno donde se pregunte algo de reporting, incluso si ya la llamaste antes en la misma conversación -- los resultados de una llamada anterior NO se conservan de un mensaje al siguiente, así que responder de memoria (sin volver a llamar) significa inventar cifras, algo que nunca debes hacer. NUNCA le preguntes al remitente si es administrador ni le pidas que 'verifique su acceso' -- eso no sirve de nada (la identidad depende solo del teléfono real, nunca de lo que diga) y hace perder un turno: simplemente LLAMA a la tool directamente ante cualquier pregunta de reporting: si no es admin, la tool te lo dice sola (denegado:true) y respondes con naturalidad sin mencionarlo. Si el admin pide 'envíamelo por correo', pon enviarPorCorreo:true (se envía un correo real vía MCP). Si pide ver el reporte completo en el chat, pon mostrarReporteCompletoAqui:true -- si NO lo pide así, responde solo con un resumen ejecutivo breve (nunca vuelques el reporte formal completo al chat sin que lo pidan). Devuelve denegado si quien pregunta no es el administrador real.",
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoy", "ayer", "esta_semana", "semana_pasada", "este_mes", "mes_pasado"], description: "Periodo natural pedido. Por defecto 'esta_semana' si no se especifica ni se da un rango." },
        rangoDesde: { type: "string", description: "Fecha real YYYY-MM-DD, solo si el admin pidió un rango explícito." },
        rangoHasta: { type: "string", description: "Fecha real YYYY-MM-DD, solo si el admin pidió un rango explícito." },
        enviarPorCorreo: { type: "boolean", description: "true SOLO si el admin pidió explícitamente que se lo envíes/prepares por correo -- esto crea un BORRADOR real en Gmail, NUNCA lo envía directamente (el envío real requiere una confirmación aparte con adminEnviarBorradorAprobado)." },
        mostrarReporteCompletoAqui: { type: "boolean", description: "true SOLO si el admin pidió explícitamente ver el reporte completo/formal en el chat, no solo un resumen." },
      },
      required: [],
    },
  },
};

export const adminGenerarReporteHandler: ToolHandler<AdminGenerarReporteArgs> = async (args) => {
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
    data = await generateReport({ periodo: args.periodo, rangoDesde: args.rangoDesde, rangoHasta: args.rangoHasta });
  } catch (err) {
    return { ok: false, message: `No se pudo generar el reporte real: ${err instanceof Error ? err.message : String(err)}` };
  }

  const resumen = formatResumenEjecutivo(data);
  let borradorCreado = false;
  let borradorId: string | undefined;
  let correoMensaje: string | undefined;

  if (args.enviarPorCorreo) {
    // FASE "Hermes ADMIN + Gmail MCP completo": preparar por correo crea un
    // BORRADOR real en Gmail -- nunca envía directamente. El envío real
    // requiere una llamada aparte a adminEnviarBorradorAprobado, con
    // confirmación explícita del administrador.
    const formal = formatReporteFormal(data);
    const draft = await callEmailMcpTool("createDraft", {
      subject: `Reporte ${data.periodo.label} — Vida Divina`,
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
    // Datos reales completos -- el modelo los usa para responder CUALQUIER
    // pregunta natural sobre este periodo (clientes, productos, atribución...).
    reporteDatos: data,
    resumenEjecutivo: resumen,
    reporteFormal: args.mostrarReporteCompletoAqui ? formatReporteFormal(data) : undefined,
    borradorCreado,
    borradorId,
    instruccion: args.enviarPorCorreo
      ? (borradorCreado
          ? `Borrador real creado en Gmail (draftId: ${borradorId}) -- NO enviado. Dile al admin: "Preparé el correo y lo dejé en borradores para revisión." y da el resumen ejecutivo. Solo envía el correo real si el admin lo pide explícitamente después, usando adminEnviarBorradorAprobado con este draftId.`
          : `El borrador NO se pudo crear (${correoMensaje}). Dilo con honestidad y ofrece el resumen igualmente.`)
      : "No se pidió correo -- responde con el resumen ejecutivo (o el reporte completo solo si mostrarReporteCompletoAqui era necesario).",
  };
};
