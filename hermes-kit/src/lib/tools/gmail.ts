// gmail.ts — Tools ADMIN-only de Gmail real (FASE "Hermes ADMIN + Gmail
// MCP completo", 2026-09-04). Misma identidad real de identity.ts (nunca
// por lo que el remitente diga) -- ningún cliente normal puede leer,
// gestionar ni enviar correo de tienda.vivevidadivina@gmail.com bajo
// ninguna circunstancia. Cada tool llama a UNA acción real y parametrizada
// del servidor MCP (email-mcp-server/) -- nunca SQL ni comandos arbitrarios.

import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { callEmailMcpTool } from "../vidaDivina/emailMcpClient";
import { getRecentHistory } from "../db";
import { registerDraftCreated, getPendingDraft, clearPendingDraft } from "../vidaDivina/draftConfirmationRegistry";

function requireAdmin(conversationId?: number): { ok: true } | { ok: false; message: string } {
  const phone = leadPhone(conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: false,
      message: "Acción administrativa DENEGADA: quien escribe no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }
  return { ok: true };
}

interface BaseArgs { conversationId?: number }

// ============================================================
// LECTURA
// ============================================================

export const adminBuscarCorreosDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminBuscarCorreos",
    description: "[SOLO ADMINISTRADOR] Busca correos REALES en la bandeja de tienda.vivevidadivina@gmail.com (sintaxis real de búsqueda de Gmail, ej. 'is:unread from:proveedor@x.com'). Solo lectura. Devuelve denegado si no eres el administrador real.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Búsqueda real estilo Gmail. Vacío = bandeja reciente." }, maxResults: { type: "number" } },
      required: [],
    },
  },
};
export const adminBuscarCorreosHandler: ToolHandler<BaseArgs & { query?: string; maxResults?: number }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("searchEmails", { query: args.query ?? "", maxResults: args.maxResults ?? 10 });
  return { ok: res.ok, denegado: false, correos: res.data, message: res.ok ? "Búsqueda real completada." : res.message };
};

export const adminLeerCorreoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminLeerCorreo",
    description: "[SOLO ADMINISTRADOR] Lee el cuerpo REAL completo de un correo por su id real (obtenido de adminBuscarCorreos). Solo lectura.",
    parameters: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] },
  },
};
export const adminLeerCorreoHandler: ToolHandler<BaseArgs & { messageId: string }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("readEmail", { messageId: args.messageId });
  return { ok: res.ok, denegado: false, correo: res.data, message: res.ok ? "Correo real leído." : res.message };
};

export const adminResumirCorreosDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminResumirCorreos",
    description: "[SOLO ADMINISTRADOR] Trae metadata real (remitente, asunto, fecha, fragmento) de varios correos reales que coincidan con una búsqueda, para que TÚ compongas el resumen y la prioridad a partir de esos datos reales -- nunca inventes contenido que no esté en el resultado.",
    parameters: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "number" } }, required: [] },
  },
};
export const adminResumirCorreosHandler: ToolHandler<BaseArgs & { query?: string; maxResults?: number }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("summarizeEmails", { query: args.query ?? "", maxResults: args.maxResults ?? 10 });
  return { ok: res.ok, denegado: false, correos: res.data, message: res.ok ? "Metadata real obtenida -- compón el resumen/prioridad a partir de esto." : res.message };
};

// ============================================================
// GESTIÓN (nunca envía, nunca borra permanentemente)
// ============================================================

export const adminCrearBorradorCorreoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminCrearBorradorCorreo",
    description: "[SOLO ADMINISTRADOR] Crea un borrador REAL en Gmail (tienda.vivevidadivina@gmail.com). NUNCA lo envía -- para enviar hace falta adminEnviarBorradorAprobado, con confirmación explícita aparte. Tras crearlo, dile al admin: 'Preparé el correo y lo dejé en borradores para revisión.' Si no se especifica destinatario, se usa el correo administrativo por defecto.",
    parameters: {
      type: "object",
      properties: { to: { type: "string", description: "Destinatario real. Si se omite, usa el correo administrativo por defecto." }, subject: { type: "string" }, body: { type: "string" } },
      required: ["subject", "body"],
    },
  },
};
export const adminCrearBorradorCorreoHandler: ToolHandler<BaseArgs & { to?: string; subject: string; body: string }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("createDraft", { to: args.to, subject: args.subject, body: args.body });
  if (res.ok && args.conversationId) {
    const draftId = (res.data as { draftId?: string } | undefined)?.draftId;
    if (draftId) registerDraftCreated(args.conversationId, draftId);
  }
  return { ok: res.ok, denegado: false, borrador: res.data, message: res.ok ? "Borrador real creado, NO enviado." : res.message };
};

export const adminActualizarBorradorCorreoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminActualizarBorradorCorreo",
    description: "[SOLO ADMINISTRADOR] Reemplaza el contenido REAL de un borrador ya existente (por su draftId real). NUNCA lo envía.",
    parameters: {
      type: "object",
      properties: { draftId: { type: "string" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["draftId", "to", "subject", "body"],
    },
  },
};
export const adminActualizarBorradorCorreoHandler: ToolHandler<BaseArgs & { draftId: string; to: string; subject: string; body: string }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("updateDraft", { draftId: args.draftId, to: args.to, subject: args.subject, body: args.body });
  return { ok: res.ok, denegado: false, borrador: res.data, message: res.ok ? "Borrador real actualizado, NO enviado." : res.message };
};

export const adminMoverCorreoAPapeleraDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminMoverCorreoAPapelera",
    description: "[SOLO ADMINISTRADOR] Mueve un correo real a la papelera de Gmail (por su id real). NUNCA borra permanentemente.",
    parameters: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] },
  },
};
export const adminMoverCorreoAPapeleraHandler: ToolHandler<BaseArgs & { messageId: string }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };
  const res = await callEmailMcpTool("trashEmail", { messageId: args.messageId });
  return { ok: res.ok, denegado: false, message: res.ok ? "Correo real movido a la papelera (recuperable)." : res.message };
};

// ============================================================
// ENVÍO (requiere confirmación explícita real del admin)
// ============================================================

const PALABRAS_CONFIRMACION = /\b(s[ií]|confirmo|env[ií]alo|env[ií]a(lo)?|adelante|hazlo|dale|correcto|procede|manda(lo)?)\b/i;

export const adminEnviarBorradorAprobadoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminEnviarBorradorAprobado",
    description:
      "[SOLO ADMINISTRADOR] Envía REALMENTE un borrador ya existente -- acción irreversible. FLUJO OBLIGATORIO: primero muestra al admin destinatario + asunto reales del borrador y pregunta '¿confirmas el envío?'; SOLO en el turno siguiente, cuando el admin responda afirmativamente (sí/confirmo/envíalo/adelante...), llama a esta tool con confirmacionExplicita:true. Si la llamas sin que el admin haya confirmado en su último mensaje real, será rechazada.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string" },
        confirmacionExplicita: { type: "boolean", description: "true SOLO si el admin ya confirmó explícitamente el envío en su mensaje anterior." },
      },
      required: ["draftId", "confirmacionExplicita"],
    },
  },
};
export const adminEnviarBorradorAprobadoHandler: ToolHandler<BaseArgs & { draftId: string; confirmacionExplicita: boolean }> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const resumen = await callEmailMcpTool("getDraftSummary", { draftId: args.draftId });
  if (!resumen.ok) return { ok: false, message: resumen.message };

  if (!args.conversationId) return { ok: false, message: "Falta conversationId real para verificar la confirmación." };

  // INCIDENTE DE SEGURIDAD (2026-09-04): "el último mensaje del usuario" NO
  // basta -- podía ser una confirmación de una sesión/borrador anterior.
  // Ahora se exige que el borrador sea el ÚLTIMO creado en ESTA conversación
  // (pendingDraft.draftId === args.draftId, nunca uno cruzado) Y que el
  // último mensaje real del usuario sea POSTERIOR al instante real de
  // creación de ESE borrador específico -- nunca solo "está en el
  // historial". Ante cualquier ambigüedad (sin pendiente, borrador
  // distinto, mensaje anterior o inexistente): NUNCA se envía.
  const pendiente = getPendingDraft(args.conversationId);
  if (!pendiente || pendiente.draftId !== args.draftId) {
    return {
      ok: true,
      enviado: false,
      borrador: resumen.data,
      message: "NO se envió -- este borrador no es el que está pendiente de confirmación en esta conversación (o ya se resolvió antes). Vuelve a generarlo/solicitarlo y pide una confirmación real y nueva antes de reintentar.",
    };
  }

  const ultimoMensajeAdmin = [...getRecentHistory(args.conversationId, 5)].reverse().find((m) => m.role === "user");
  const esPosteriorAlBorrador = Boolean(ultimoMensajeAdmin && ultimoMensajeAdmin.created_at > pendiente.createdAtSec);
  const confirmacionRealEnTexto = Boolean(ultimoMensajeAdmin && PALABRAS_CONFIRMACION.test(ultimoMensajeAdmin.content));

  if (!args.confirmacionExplicita || !confirmacionRealEnTexto || !esPosteriorAlBorrador) {
    return {
      ok: true,
      enviado: false,
      borrador: resumen.data,
      message: `NO se envió -- falta una confirmación explícita real y NUEVA del administrador (posterior a haber preparado este borrador). Muéstrale este resumen y pide que confirme con claridad ('sí, envíalo') antes de volver a llamar a esta tool: destinatario/asunto arriba.`,
    };
  }

  const envio = await callEmailMcpTool("sendApprovedEmail", { draftId: args.draftId });
  if (envio.ok) clearPendingDraft(args.conversationId);
  return { ok: envio.ok, enviado: envio.ok, resultado: envio.data, message: envio.ok ? "Correo real enviado (confirmado por el administrador)." : envio.message };
};
