// analytics.ts — adminConsultarInteraccionesProducto (Fase "Analytics
// admin de interacciones por producto", 2026-09-17). [SOLO ADMINISTRADOR]
// Responde preguntas reales tipo "¿cuántos clientes han preguntado hoy por
// las cápsulas Ripped?" sobre el SQLite real de WhatsApp (nunca el espejo
// parcial de Postgres) -- ver messageAnalytics.ts para la consulta real.

import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { resolvePeriodKeyword, type PeriodKeyword } from "../vidaDivina/reportPeriods";
import { consultarInteraccionesPorProducto } from "../vidaDivina/messageAnalytics";

function requireAdmin(conversationId?: number): { ok: true } | { ok: false; message: string } {
  const phone = leadPhone(conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: false,
      message: "Acción administrativa DENEGADA: quien pregunta no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }
  return { ok: true };
}

interface AdminConsultarInteraccionesProductoArgs {
  producto: string;
  periodo?: PeriodKeyword;
  rangoDesde?: string;
  rangoHasta?: string;
  conversationId?: number;
}

export const adminConsultarInteraccionesProductoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminConsultarInteraccionesProducto",
    description:
      "[SOLO ADMINISTRADOR] Cuenta clientes REALES únicos que preguntaron/mencionaron un producto real en un rango de fechas, sobre los mensajes reales de WhatsApp (nunca aproximado, nunca solo oportunidades registradas). Úsala ante cualquier pregunta tipo '¿cuántos clientes han preguntado hoy/esta semana por <producto>?'. Devuelve clientesUnicos (la cifra real a responder), totalMensajes, totalConversaciones, el producto real detectado y una muestra de los mensajes/conversaciones encontrados para trazabilidad. REGLA DURA: llama a esta tool en cada turno donde se pregunte esto, incluso si ya la llamaste antes -- los resultados no se conservan de un mensaje al siguiente. Devuelve denegado si quien pregunta no es el administrador real.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto tal como lo dijo el admin (puede ser parcial, ej. 'Ripped' o 'cápsulas Ripped') -- se resuelve contra el catálogo real." },
        periodo: { type: "string", enum: ["hoy", "ayer", "esta_semana", "semana_pasada", "este_mes", "mes_pasado"], description: "Periodo natural pedido. Por defecto 'hoy' si no se especifica ni se da un rango." },
        rangoDesde: { type: "string", description: "Fecha real YYYY-MM-DD, solo si el admin pidió un rango explícito." },
        rangoHasta: { type: "string", description: "Fecha real YYYY-MM-DD, solo si el admin pidió un rango explícito." },
      },
      required: ["producto"],
    },
  },
};

export const adminConsultarInteraccionesProductoHandler: ToolHandler<AdminConsultarInteraccionesProductoArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  let desde: Date;
  let hasta: Date;
  let periodoLabel: string;
  if (args.rangoDesde && args.rangoHasta) {
    desde = new Date(`${args.rangoDesde}T00:00:00`);
    hasta = new Date(`${args.rangoHasta}T00:00:00`);
    hasta.setDate(hasta.getDate() + 1); // hasta EXCLUSIVO, mismo criterio que reportPeriods.ts
    periodoLabel = `${args.rangoDesde} a ${args.rangoHasta}`;
  } else {
    const resuelto = resolvePeriodKeyword(args.periodo ?? "hoy");
    desde = resuelto.since;
    hasta = resuelto.until;
    periodoLabel = resuelto.label;
  }

  const resultado = await consultarInteraccionesPorProducto({ producto: args.producto, desde, hasta });
  if (!resultado.ok) {
    return { ok: false, denegado: false, message: resultado.reason };
  }

  return {
    ok: true,
    denegado: false,
    productoId: resultado.productoId,
    productoDetectado: resultado.tituloProducto,
    periodo: periodoLabel,
    clientesUnicos: resultado.clientesUnicos,
    totalMensajes: resultado.totalMensajes,
    totalConversaciones: resultado.totalConversaciones,
    mensajesEncontrados: resultado.mensajes.map((m) => ({
      conversationId: m.conversationId,
      telefono: m.phone,
      nombre: m.nombre,
      mensaje: m.content,
    })),
    message: `${resultado.clientesUnicos} cliente(s) único(s) real(es) preguntaron por "${resultado.tituloProducto}" en ${periodoLabel} (${resultado.totalMensajes} mensaje(s) en ${resultado.totalConversaciones} conversación(es)). Responde con esta cifra real, nunca la aproximes.`,
  };
};
