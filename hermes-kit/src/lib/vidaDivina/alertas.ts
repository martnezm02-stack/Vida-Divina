// alertas.ts — Alerta interna de handoff para el vendedor (FASE "Alerta
// interna de handoff", 2026-09-04).
//
// NO crea un evento nuevo: un handoff real sin resolver (crm.handoffs,
// resuelto_en IS NULL) YA ES el evento -- esta capa solo LEE y compone esos
// handoffs con datos ya reales de otras tablas del mismo CRM (messages,
// conversations) para dárselos al dashboard en forma legible. No se
// persiste nada nuevo aquí.
//
// Producto/necesidad/intención de compra NUNCA salen de crm.opportunities
// (hallazgo real 2026-09-12: esa tabla es historial del CLIENTE, no del
// evento -- podía contradecir el propio handoff, ver parseMotivo/
// resolverProductoDelHandoffActual más abajo). Siempre HANDOFF ACTUAL >
// datos históricos.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductKnowledge } from "./productKnowledge";
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
//
// Metadatos del HANDOFF ACTUAL (2026-09-12, hallazgo real: una alerta de
// "[compra] Cliente confirma intención de compra: 'Quiero comprar las
// cápsulas Venus...'" mostraba producto/necesidad de OTRA conversación
// anterior sobre Té Divina/estreñimiento, e "intención de compra: no" --
// exactamente lo contrario del propio handoff). `productoTexto`/
// `necesidadTexto` YA existen en `motivo` cuando derivarHumano (tool LLM)
// los recibió explícitos ("Producto: X"/"Necesidad: Y") -- se extraen aquí
// tal cual, nunca inventados.
function parseMotivo(motivo: string): {
  tipo: string | null;
  prioridadTexto: string | null;
  productoTexto: string | null;
  necesidadTexto: string | null;
} {
  const tipoMatch = motivo.match(/^\[(\w+)\]/);
  const prioridadMatch = motivo.match(/Prioridad:\s*(alta|media|baja)/i);
  // " · " separa cada campo real (ver ejecutarHandoffReal#partesMotivo) --
  // el valor termina en el siguiente " · " o en el fin de la cadena, nunca
  // se traga el resto de campos.
  const productoMatch = motivo.match(/Producto:\s*([^·]+)/i);
  const necesidadMatch = motivo.match(/Necesidad:\s*([^·]+)/i);
  return {
    tipo: tipoMatch?.[1] ?? null,
    prioridadTexto: prioridadMatch?.[1]?.toLowerCase() ?? null,
    productoTexto: productoMatch?.[1]?.trim() || null,
    necesidadTexto: necesidadMatch?.[1]?.trim() || null,
  };
}

function prioridadPorDefecto(tipo: string | null): "alta" | "media" | "baja" {
  if (tipo === "compra") return "alta";
  if (tipo === "reclamo") return "media";
  return "media";
}

// Fallback determinista SOLO para el camino sin "Producto:" explícito -- el
// detector de intención de compra (handler.ts#detectarIntencionCompraClara)
// deriva el handoff ANTES de llamar al LLM, así que motivo nunca trae
// "Producto:"/"Necesidad:" en ese camino, solo el mensaje real del cliente
// entre comillas ("Cliente confirma intención de compra: \"...\"").
// Reutiliza EXACTAMENTE el motor de búsqueda de producto ya existente
// (productKnowledge.ts, mismo que usa consultarProducto) -- nunca un LLM,
// nunca un segundo mecanismo de matching. Si no hay comillas o el texto no
// resuelve a ningún producto real, devuelve null -- NUNCA inventa uno ni
// cae a un dato histórico de otra conversación.
async function resolverProductoDelHandoffActual(motivo: string): Promise<string | null> {
  const mensajeCitado = motivo.match(/"([^"]+)"/)?.[1];
  if (!mensajeCitado) return null;
  try {
    const res = await getProductKnowledge(mensajeCitado);
    if (!res.found) return null;
    return res.nombreVisible ?? res.titulo;
  } catch {
    return null;
  }
}

/**
 * Bandeja de alertas internas reales: un handoff real sin resolver por
 * fila. Producto/necesidad/intención de compra se componen SIEMPRE a
 * partir del propio HANDOFF ACTUAL (su `motivo` real, ver parseMotivo/
 * resolverProductoDelHandoffActual) -- NUNCA de `crm.opportunities`
 * (hallazgo real 2026-09-12: esa tabla guarda el ÚLTIMO producto/necesidad
 * conocido del CLIENTE a lo largo de TODA su historia, que puede ser de
 * una conversación/necesidad completamente distinta a la que disparó este
 * handoff en concreto -- mostrar eso contradecía el propio evento, ej.
 * "intención de compra: no" en una alerta cuyo motivo real es
 * "[compra] Cliente confirma intención de compra..."). Regla aplicada:
 * HANDOFF ACTUAL > datos históricos -- si el handoff actual no trae un
 * dato (producto/necesidad explícitos, o un producto derivable del propio
 * mensaje citado), la alerta lo deja ausente (null) en vez de inventarlo o
 * de heredarlo de otra conversación. Prioridad sigue viniendo del propio
 * motivo (o un valor por defecto por tipo si no viene), y el último
 * mensaje real del lead sigue como contexto.
 */
export async function listHandoffAlerts(opts: { limit?: number } = {}): Promise<HandoffAlert[]> {
  const c = await crm();
  const pendientes = await c.handoffs.listPendientes({ limit: opts.limit ?? 50 });

  const alertas: HandoffAlert[] = [];
  for (const h of pendientes) {
    let conversacion: any = null;
    let mensajes: any[] = [];
    try {
      [conversacion, mensajes] = await Promise.all([
        c.conversations.findConversationById(h.conversationId),
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

    const motivoReal = h.motivo ?? "";
    const { tipo, prioridadTexto, productoTexto, necesidadTexto } = parseMotivo(motivoReal);
    // Producto: 1) el que ya viene explícito en el motivo (derivarHumano
    // con `producto` real); 2) si no, derivado del propio mensaje citado
    // del handoff actual (camino determinista, ver la función); nunca un
    // tercer intento contra datos de otra conversación.
    const producto = productoTexto ?? (await resolverProductoDelHandoffActual(motivoReal).catch(() => null));
    // Intención de compra: el único dato REAL y actual disponible hoy es
    // el propio tipo del handoff -- "[compra]" ES la confirmación real de
    // intención de compra de este evento. Nunca se infiere "no" por
    // ausencia de dato (eso sería inventar); se deja null (ausente) si el
    // tipo no es 'compra' y no hay otra señal explícita del propio handoff.
    const intencionCompra = tipo === "compra" ? true : null;

    const ultimoMensajeLead = [...mensajes].reverse().find((m: any) => m.direccion === "entrante");

    alertas.push({
      handoffId: h.handoffId,
      customerId: conversacion?.customerId ?? null,
      crmConversationId: h.conversationId,
      localConversationId: localConversation?.id ?? null,
      phone,
      tipo,
      producto,
      necesidad: necesidadTexto,
      intencionCompra,
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

// ============================================================
// Fuentes de alerta adicionales (FASE "Rediseño Dashboard Hermes Ventas",
// 2026-09-18) -- extienden la bandeja con fuentes reales YA existentes,
// nunca alertas inventadas. Cada función es solo lectura.
// ============================================================

export interface SeguimientoAlerta {
  followUpId: string;
  tipo: string;
  fechaProgramada: string;
  cliente: string | null;
  telefono: string | null;
}

/** Seguimientos reales vencidos (pendientes cuya fecha_programada ya pasó) -- mismo followUpRepository.listPendingDueBy real, nunca un cálculo paralelo. */
export async function listSeguimientosVencidos(): Promise<SeguimientoAlerta[]> {
  const c = await crm();
  const pendientes = await c.followUps.listPendingDueBy(new Date());
  return Promise.all(
    pendientes.map(async (f: any) => {
      const conversacion = await c.conversations.findConversationById(f.conversationId);
      let cliente: string | null = null;
      let telefono: string | null = null;
      if (conversacion) {
        const [customer, canales] = await Promise.all([
          c.customers.findCustomerById(conversacion.customerId),
          c.customerChannels.listByCustomerId(conversacion.customerId),
        ]);
        cliente = customer?.nombre ?? null;
        telefono = canales[0]?.identificadorExterno ?? null;
      }
      return { followUpId: f.followUpId, tipo: f.tipo, fechaProgramada: f.fechaProgramada, cliente, telefono };
    })
  );
}

export interface PagoPendienteAlerta {
  paymentId: string;
  orderId: string;
  metodo: string;
  importe: number;
  creadoEn: string;
  cliente: string | null;
  telefono: string | null;
}

/** Pagos/comprobantes reales pendientes de confirmación real del administrador -- mismo paymentRepository.listPending real (payments.estado='pendiente'), nunca un estado inventado. El pedido asociado sigue 'pendiente' mientras esto no se confirme, así que también cubre "pedido que requiere atención". */
export async function listPagosPendientes(): Promise<PagoPendienteAlerta[]> {
  const c = await crm();
  const pagos = await c.payments.listPending();
  return Promise.all(
    pagos.map(async (p: any) => {
      const order = await c.orders.findById(p.orderId);
      let cliente: string | null = null;
      let telefono: string | null = null;
      if (order) {
        const [customer, canales] = await Promise.all([
          c.customers.findCustomerById(order.customerId),
          c.customerChannels.listByCustomerId(order.customerId),
        ]);
        cliente = customer?.nombre ?? null;
        telefono = canales[0]?.identificadorExterno ?? null;
      }
      return { paymentId: p.paymentId, orderId: p.orderId, metodo: p.metodo, importe: Number(p.importe), creadoEn: p.creadoEn, cliente, telefono };
    })
  );
}
