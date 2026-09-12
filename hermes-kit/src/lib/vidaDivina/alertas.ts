// alertas.ts — Alerta interna de handoff para el vendedor (FASE "Alerta
// interna de handoff", 2026-09-04).
//
// NO crea un evento nuevo: un handoff real sin resolver (crm.handoffs,
// resuelto_en IS NULL) YA ES el evento -- esta capa solo LEE y compone esos
// handoffs con datos ya reales de otras tablas del mismo CRM (opportunities,
// messages, conversations) para dárselos al dashboard en forma legible. No
// se persiste nada nuevo aquí.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";
import { getConversationByPhone, type Conversation as LocalConversation } from "../db";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");

// Hallazgo real (2026-09-12): un import() con la ruta calculada en runtime
// (pathToFileURL(CRM_INDEX_PATH).href) funciona perfecto fuera de un
// bundler (tsx, el proceso del bot -- por eso Telegram sí recibía la
// alerta) pero Next.js/Turbopack (usado por /api/alertas, un proceso
// bundleado) no puede analizar estáticamente esa expresión y lanza
// "Cannot find module as expression is too dynamic" -- capturado por el
// try/catch de listHandoffAlerts()/route.ts y devuelto como alertas:[],
// indistinguible de "no hay handoffs" (el bug real reportado). El
// comentario mágico webpackIgnore (soportado también por Turbopack) le
// dice al bundler que NO intente resolver este import en tiempo de
// build -- lo deja para el resolver nativo de Node en tiempo de
// ejecución, igual que ya funciona en el proceso del bot.
const CRM_INDEX_URL = pathToFileURL(CRM_INDEX_PATH).href;

let _crm: any = null;
async function crm(): Promise<any> {
  if (!_crm) {
    _crm = await import(/* webpackIgnore: true */ CRM_INDEX_URL);
  }
  return _crm;
}

export interface HandoffAlert {
  handoffId: string;
  customerId: string | null;
  crmConversationId: string;
  localConversationId: number | null;
  phone: string | null;
  tipo: string | null;
  producto: string | null;
  necesidad: string | null;
  intencionCompra: boolean | null;
  prioridad: "alta" | "media" | "baja";
  motivo: string;
  timestamp: string;
  ultimoContexto: string | null;
}

// Parsea el motivo compuesto por derivar-humano.ts ("[tipo] razon · Producto: X · ...")
// -- nunca una segunda fuente de verdad: si el formato cambia, esta función
// simplemente no encuentra el campo (degrada a null), nunca rompe la alerta.
function parseMotivo(motivo: string): { tipo: string | null; prioridadTexto: string | null } {
  const tipoMatch = motivo.match(/^\[(\w+)\]/);
  const prioridadMatch = motivo.match(/Prioridad:\s*(alta|media|baja)/i);
  return {
    tipo: tipoMatch?.[1] ?? null,
    prioridadTexto: prioridadMatch?.[1]?.toLowerCase() ?? null,
  };
}

function prioridadPorDefecto(tipo: string | null): "alta" | "media" | "baja" {
  if (tipo === "compra") return "alta";
  if (tipo === "reclamo") return "media";
  return "media";
}

/**
 * Bandeja de alertas internas reales: un handoff real sin resolver por
 * fila. Compone producto/necesidad/intención desde la oportunidad real más
 * reciente de esa conversación (crm.opportunities, NUNCA re-parseado del
 * texto libre), prioridad desde el propio motivo (o un valor por defecto
 * por tipo si no viene), y el último mensaje real del lead como contexto.
 */
export async function listHandoffAlerts(opts: { limit?: number } = {}): Promise<HandoffAlert[]> {
  const c = await crm();
  const pendientes = await c.handoffs.listPendientes({ limit: opts.limit ?? 50 });

  const alertas: HandoffAlert[] = [];
  for (const h of pendientes) {
    let conversacion: any = null;
    let oportunidad: any = null;
    let mensajes: any[] = [];
    try {
      [conversacion, oportunidad, mensajes] = await Promise.all([
        c.conversations.findConversationById(h.conversationId),
        c.opportunities.findLatestByConversationId(h.conversationId),
        c.messages.listByConversationId(h.conversationId, { limit: 10 }),
      ]);
    } catch {
      // Un fallo puntual leyendo el contexto extra no debe tumbar toda la bandeja.
    }

    const phone: string | null = conversacion?.waIdConversacion ?? null;
    let localConversation: LocalConversation | null = null;
    if (phone) {
      try {
        localConversation = getConversationByPhone(phone);
      } catch {
        localConversation = null;
      }
    }

    const { tipo, prioridadTexto } = parseMotivo(h.motivo ?? "");
    const producto = oportunidad?.productoId ? await getProductTitleById(oportunidad.productoId).catch(() => null) : null;

    const ultimoMensajeLead = [...mensajes].reverse().find((m: any) => m.direccion === "entrante");

    alertas.push({
      handoffId: h.handoffId,
      customerId: conversacion?.customerId ?? null,
      crmConversationId: h.conversationId,
      localConversationId: localConversation?.id ?? null,
      phone,
      tipo,
      producto: producto ?? (oportunidad?.productoId ?? null),
      necesidad: oportunidad?.necesidadId ?? null,
      intencionCompra: oportunidad?.intencionCompra ?? null,
      prioridad: (prioridadTexto as "alta" | "media" | "baja" | null) ?? prioridadPorDefecto(tipo),
      motivo: h.motivo,
      timestamp: h.creadoEn,
      ultimoContexto: ultimoMensajeLead?.texto ?? null,
    });
  }

  return alertas;
}

export interface ResolveHandoffResult {
  ok: boolean;
  reason?: string;
}

/**
 * Marca un handoff real como resuelto (FASE "Hacer operativo
 * resolveHandoff", 2026-09-11) -- única vía real para que un handoff deje
 * de bloquear futuros handoffs de la misma conversación (ver
 * crmClient.ts#handoffToHuman, HANDOFF_DEDUP_WINDOW_MS). Reutiliza
 * exactamente resolveHandoff() del repositorio real (crm/repositories/
 * handoffRepository.js) -- nunca reimplementa la escritura ni crea una
 * tabla/estado paralelo. Solo cambia ESTE handoff (una fila, por
 * handoff_id): nunca toca otras conversaciones ni el modo AI/Humano local
 * (eso vive en hermes-kit/data/messages.db, un almacén completamente
 * distinto -- resolver un handoff en el CRM nunca reactiva la IA por sí
 * solo).
 */
export async function resolveHandoffAlert(handoffId: string): Promise<ResolveHandoffResult> {
  if (!handoffId || !handoffId.trim()) {
    return { ok: false, reason: "Falta handoffId." };
  }
  try {
    const c = await crm();
    const resuelto = await c.handoffs.resolveHandoff(handoffId, { resueltoPor: "dashboard" });
    if (!resuelto) {
      return { ok: false, reason: "No existe ese handoff, o ya estaba resuelto." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Error real al resolver el handoff: ${err instanceof Error ? err.message : String(err)}` };
  }
}
