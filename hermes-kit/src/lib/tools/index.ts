import {
  guardarLeadDefinition,
  guardarLeadHandler,
} from "./guardar-lead";
import {
  calificarDefinition,
  calificarHandler,
} from "./calificar";
// agendar NO se registra: el kit de serie cierra por chat, sin agendar llamadas.
// El enlace de reserva (Cal.com/Calendly) se comparte por la sección de Enlaces
// de prompts/negocio.md. El archivo agendar.ts se conserva por si tu negocio
// necesita esa herramienta: regístrala aquí y rellena CAL_BOOKING_URL.
import { insertToolEvent } from "../db";
import type { IdiomaConversacion } from "../vidaDivina/languageDetection";
// FASE "Hermes end-to-end Vida Divina": derivarHumano SÍ se registra aquí
// (antes dormida) -- Vida Divina necesita derivación real a un humano
// (además del watchdog), con handoff persistido en el CRM real.
import {
  derivarHumanoDefinition,
  derivarHumanoHandler,
} from "./derivar-humano";
import {
  buscarProductosDefinition,
  buscarProductosHandler,
  consultarProductoDefinition,
  consultarProductoHandler,
} from "./consultar-producto";
import {
  buscarTestimoniosDefinition,
  buscarTestimoniosHandler,
  buscarContenidoComercialDefinition,
  buscarContenidoComercialHandler,
  buscarAssetDefinition,
  buscarAssetHandler,
} from "./buscar-media-comercial";
import { enviarMediaDefinition, enviarMediaHandler } from "./enviar-media";
import { verificarClaimDefinition, verificarClaimHandler } from "./verificar-claim";
import { generarVozDefinition, generarVozHandler } from "./generar-voz";
import { qualifyLeadDefinition, qualifyLeadHandler } from "./calificar-crm";
import {
  crearPedidoDefinition, crearPedidoHandler,
  registrarPagoDefinition, registrarPagoHandler,
  cerrarVentaTransferenciaDefinition, cerrarVentaTransferenciaHandler,
  confirmarPagoDefinition, confirmarPagoHandler,
  consultarPedidoDefinition, consultarPedidoHandler,
} from "./comercio";
import { adminEstadoSistemaDefinition, adminEstadoSistemaHandler, adminGenerarAudioAssetDefinition, adminGenerarAudioAssetHandler } from "./admin";
import { adminGenerarReporteDefinition, adminGenerarReporteHandler } from "./reporting";
import { adminReporteInventarioDefinition, adminReporteInventarioHandler } from "./inventario";
import { adminAgendarSeguimientoDefinition, adminAgendarSeguimientoHandler } from "./seguimiento";
import {
  adminBuscarCorreosDefinition, adminBuscarCorreosHandler,
  adminLeerCorreoDefinition, adminLeerCorreoHandler,
  adminResumirCorreosDefinition, adminResumirCorreosHandler,
  adminCrearBorradorCorreoDefinition, adminCrearBorradorCorreoHandler,
  adminActualizarBorradorCorreoDefinition, adminActualizarBorradorCorreoHandler,
  adminMoverCorreoAPapeleraDefinition, adminMoverCorreoAPapeleraHandler,
  adminEnviarBorradorAprobadoDefinition, adminEnviarBorradorAprobadoHandler,
} from "./gmail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ============================================================
// Tipos compartidos
// ============================================================

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// El handler de cada tool define sus propios argumentos.
// Aquí trabajamos con un wrapper que acepta unknown args (los validamos al entrar).
// `language` (2026-09-12, "Idioma + Nombre visible"): idioma real ya
// detectado de la conversación en este turno -- nunca decidido por el
// tool ni por el LLM, solo reenviado por executeTool() para que las tools
// que redactan texto de apoyo (consultarProducto/buscarProductos) puedan
// responder en el idioma correcto sin depender de una segunda detección.
export type ToolHandler<TArgs = Record<string, unknown>> = (
  args: TArgs & { conversationId?: number; language?: IdiomaConversacion }
) => Promise<Record<string, unknown>>;

// ============================================================
// Registry — usamos wrappers que aceptan unknown y delegan a los handlers tipados
// ============================================================

export const toolDefinitions: ToolDefinition[] = [
  guardarLeadDefinition,
  calificarDefinition,
  derivarHumanoDefinition,
  buscarProductosDefinition,
  consultarProductoDefinition,
  buscarTestimoniosDefinition,
  buscarContenidoComercialDefinition,
  buscarAssetDefinition,
  enviarMediaDefinition,
  verificarClaimDefinition,
  generarVozDefinition,
  qualifyLeadDefinition,
  crearPedidoDefinition,
  registrarPagoDefinition,
  cerrarVentaTransferenciaDefinition,
  confirmarPagoDefinition,
  consultarPedidoDefinition,
  adminEstadoSistemaDefinition,
  adminGenerarAudioAssetDefinition,
  adminGenerarReporteDefinition,
  adminReporteInventarioDefinition,
  adminAgendarSeguimientoDefinition,
  adminBuscarCorreosDefinition,
  adminLeerCorreoDefinition,
  adminResumirCorreosDefinition,
  adminCrearBorradorCorreoDefinition,
  adminActualizarBorradorCorreoDefinition,
  adminMoverCorreoAPapeleraDefinition,
  adminEnviarBorradorAprobadoDefinition,
];

type GenericHandler = (
  args: Record<string, unknown> & { conversationId?: number; language?: IdiomaConversacion }
) => Promise<Record<string, unknown>>;

const handlers: Record<string, GenericHandler> = {
  guardarLead: (args) =>
    guardarLeadHandler(args as unknown as Parameters<typeof guardarLeadHandler>[0]),
  calificar: (args) =>
    calificarHandler(args as unknown as Parameters<typeof calificarHandler>[0]),
  derivarHumano: (args) =>
    derivarHumanoHandler(args as unknown as Parameters<typeof derivarHumanoHandler>[0]),
  buscarProductos: (args) =>
    buscarProductosHandler(args as unknown as Parameters<typeof buscarProductosHandler>[0]),
  consultarProducto: (args) =>
    consultarProductoHandler(args as unknown as Parameters<typeof consultarProductoHandler>[0]),
  buscarTestimonios: (args) =>
    buscarTestimoniosHandler(args as unknown as Parameters<typeof buscarTestimoniosHandler>[0]),
  buscarContenidoComercial: (args) =>
    buscarContenidoComercialHandler(args as unknown as Parameters<typeof buscarContenidoComercialHandler>[0]),
  buscarAsset: (args) =>
    buscarAssetHandler(args as unknown as Parameters<typeof buscarAssetHandler>[0]),
  enviarMedia: (args) =>
    enviarMediaHandler(args as unknown as Parameters<typeof enviarMediaHandler>[0]),
  verificarClaim: (args) =>
    verificarClaimHandler(args as unknown as Parameters<typeof verificarClaimHandler>[0]),
  generarVoz: (args) =>
    generarVozHandler(args as unknown as Parameters<typeof generarVozHandler>[0]),
  qualifyLead: (args) =>
    qualifyLeadHandler(args as unknown as Parameters<typeof qualifyLeadHandler>[0]),
  crearPedido: (args) =>
    crearPedidoHandler(args as unknown as Parameters<typeof crearPedidoHandler>[0]),
  registrarPago: (args) =>
    registrarPagoHandler(args as unknown as Parameters<typeof registrarPagoHandler>[0]),
  cerrarVentaTransferencia: (args) =>
    cerrarVentaTransferenciaHandler(args as unknown as Parameters<typeof cerrarVentaTransferenciaHandler>[0]),
  confirmarPago: (args) =>
    confirmarPagoHandler(args as unknown as Parameters<typeof confirmarPagoHandler>[0]),
  consultarPedido: (args) =>
    consultarPedidoHandler(args as unknown as Parameters<typeof consultarPedidoHandler>[0]),
  adminEstadoSistema: (args) =>
    adminEstadoSistemaHandler(args as unknown as Parameters<typeof adminEstadoSistemaHandler>[0]),
  adminGenerarAudioAsset: (args) =>
    adminGenerarAudioAssetHandler(args as unknown as Parameters<typeof adminGenerarAudioAssetHandler>[0]),
  adminGenerarReporte: (args) =>
    adminGenerarReporteHandler(args as unknown as Parameters<typeof adminGenerarReporteHandler>[0]),
  adminReporteInventario: (args) =>
    adminReporteInventarioHandler(args as unknown as Parameters<typeof adminReporteInventarioHandler>[0]),
  adminAgendarSeguimiento: (args) =>
    adminAgendarSeguimientoHandler(args as unknown as Parameters<typeof adminAgendarSeguimientoHandler>[0]),
  adminBuscarCorreos: (args) =>
    adminBuscarCorreosHandler(args as unknown as Parameters<typeof adminBuscarCorreosHandler>[0]),
  adminLeerCorreo: (args) =>
    adminLeerCorreoHandler(args as unknown as Parameters<typeof adminLeerCorreoHandler>[0]),
  adminResumirCorreos: (args) =>
    adminResumirCorreosHandler(args as unknown as Parameters<typeof adminResumirCorreosHandler>[0]),
  adminCrearBorradorCorreo: (args) =>
    adminCrearBorradorCorreoHandler(args as unknown as Parameters<typeof adminCrearBorradorCorreoHandler>[0]),
  adminActualizarBorradorCorreo: (args) =>
    adminActualizarBorradorCorreoHandler(args as unknown as Parameters<typeof adminActualizarBorradorCorreoHandler>[0]),
  adminMoverCorreoAPapelera: (args) =>
    adminMoverCorreoAPapeleraHandler(args as unknown as Parameters<typeof adminMoverCorreoAPapeleraHandler>[0]),
  adminEnviarBorradorAprobado: (args) =>
    adminEnviarBorradorAprobadoHandler(args as unknown as Parameters<typeof adminEnviarBorradorAprobadoHandler>[0]),
};

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { conversationId: number; language?: IdiomaConversacion }
): Promise<Record<string, unknown>> {
  const handler = handlers[toolName];
  if (!handler) {
    return { ok: false, message: `Tool desconocida: ${toolName}` };
  }

  // El teléfono real del lead es el del propio chat de WhatsApp. Los modelos
  // tienden a inventarlo o dejarlo vacío; por eso guardarLead/calificar lo
  // toman del conversationId (ver leadPhone en airtable.ts), nunca de los args.
  // Un fallo DENTRO de una tool nunca debe dejar al bot sin responder: se captura
  // y se devuelve como resultado controlado para que el modelo siga la charla.
  let result: Record<string, unknown>;
  try {
    result = await handler({ ...args, conversationId: context.conversationId, language: context.language });
  } catch (err) {
    return {
      ok: false,
      message: `La herramienta ${toolName} falló (${
        err instanceof Error ? err.message : String(err)
      }). Continúa la conversación con normalidad; no menciones este error al lead.`,
    };
  }

  // Registro para métricas (leads y embudo). Nunca debe romper la ejecución.
  // `detail` es genérico (no específico de derivarHumano): captura el
  // discriminador real `args.tipo` cuando la propia tool lo define (ver
  // derivar-humano.ts, enum "compra"/"persona"/"reclamo"/"fuera_de_alcance")
  // para poder medir costo externo real por conversión de compra (ver
  // db.ts#getCostByPurchaseConversion) -- nunca un payload completo.
  if (result?.ok !== false) {
    try {
      const hasEmail = toolName === "guardarLead" && EMAIL_RE.test(String(args.email ?? ""));
      const detail = typeof args.tipo === "string" ? args.tipo : null;
      insertToolEvent(context.conversationId, toolName, hasEmail, detail);
    } catch {
      // ignorar fallos de métricas
    }
  }

  return result;
}
