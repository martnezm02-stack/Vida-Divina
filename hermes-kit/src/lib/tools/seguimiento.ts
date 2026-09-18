// seguimiento.ts — Seguimiento post-venta real en Google Calendar para
// Hermes Ventas (FASE "Hermes Ventas: Gmail + Google Calendar",
// 2026-09-18). SOLO ADMIN (misma identidad real de identity.ts, mismo gate
// que confirmarPago/comercio.ts). El pedido objetivo se identifica por
// orderId real -- nunca por el teléfono de quien llama (el admin gestiona
// pedidos de otros clientes desde su propia conversación, mismo criterio
// real que confirmarPago). El núcleo real (CRM + Calendar, idempotente)
// vive en ../vidaDivina/seguimientoService.ts -- compartido con la ruta
// /api/calendario del Dashboard (FASE "Rediseño Dashboard Hermes Ventas"),
// nunca dos implementaciones del mismo agendamiento.

import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { agendarSeguimiento, type TipoSeguimiento } from "../vidaDivina/seguimientoService";

interface AdminAgendarSeguimientoArgs {
  orderId: string;
  tipo: TipoSeguimiento;
  notas?: string;
  conversationId?: number;
}

function requireAdmin(conversationId?: number): { ok: true } | { ok: false; message: string } {
  const phone = leadPhone(conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: false,
      message: "Acción administrativa DENEGADA: quien pide esto no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }
  return { ok: true };
}

export const adminAgendarSeguimientoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminAgendarSeguimiento",
    description:
      "[SOLO ADMINISTRADOR] Agenda un seguimiento post-venta REAL asociado a un pedido real ya existente (orderId real, ej. el que devolvió crearPedido/consultarPedido) -- guarda/reutiliza el follow-up real en PostgreSQL (fuente de verdad) y crea/reutiliza su evento correspondiente en Google Calendar (IDEMPOTENTE: nunca duplica el evento si ya existe). Esta tool NUNCA modifica inventario, precios, pagos ni pedidos -- solo agenda el seguimiento. tipo: 'dia3' (día 3 después de la venta) o 'semana1' (semana 1 después de la venta) -- los dos primeros seguimientos reales ya definidos de Vida Divina. Si el orderId no existe realmente, dilo con honestidad. Si Google Calendar no está disponible, el seguimiento real ya quedó guardado en el CRM antes de intentar sincronizar -- nunca se pierde, solo se reporta el error de sincronización.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "orderId real del pedido al que se asocia el seguimiento." },
        tipo: { type: "string", enum: ["dia3", "semana1"] },
        notas: { type: "string", description: "Notas reales adicionales del administrador para este seguimiento (opcional)." },
      },
      required: ["orderId", "tipo"],
    },
  },
};

export const adminAgendarSeguimientoHandler: ToolHandler<AdminAgendarSeguimientoArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const res = await agendarSeguimiento({ orderId: args.orderId, tipo: args.tipo, notas: args.notas });
  return { ...res, denegado: false };
};
