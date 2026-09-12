// crmClient.ts — CRM real de Vida Divina para las tools de Hermes.
//
// Reutiliza EXACTAMENTE crm/index.js -- la única puerta de acceso a
// PostgreSQL de todo el proyecto (Decisión Arquitectónica #12,
// docs/PROJECT_STATE.md). Nunca importa `pg` directamente, nunca ejecuta
// SQL propio, nunca crea un segundo CRM/tabla paralela. Mismo `tipo_canal`
// ('whatsapp', único valor que el schema real acepta hoy -- ver
// customerChannelRepository.js) que ya usa el canal de Meta: lo que separa
// un lead real de Hermes/Baileys de uno de Meta es únicamente el
// `identificador_externo` (el número de teléfono real de cada canal),
// nunca un tipo de canal inventado aparte.
//
// source: 'TEST' (nunca 'REAL') en todo lo que esta capa escribe -- Hermes
// no está conectado al número real de la tienda en esta fase (regla de
// seguridad explícita de la tarea). routes/whatsapp.js (la consola real de
// Meta) filtra por source=REAL por defecto, así que nada de lo que Hermes
// escriba aquí se mezcla con datos reales de clientes de Meta a menos que
// alguien cambie explícitamente ese filtro.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT } from "./productKnowledge";
import type { Attribution } from "./attribution";
import { getConversationByPhone } from "../db";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");

let _crm: any = null;
async function crm(): Promise<any> {
  if (!_crm) {
    _crm = await import(pathToFileURL(CRM_INDEX_PATH).href);
  }
  return _crm;
}

/** true si DATABASE_URL está configurada (ver scripts/env-loader.ts) -- si no, todo aquí degrada sin lanzar. */
export function crmConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const TIPO_CANAL = "whatsapp";
const HERMES_SOURCE = "TEST"; // ver nota de cabecera -- nunca 'REAL' desde Hermes en esta fase.

// Ventana de deduplicación real de handoffToHuman() (hallazgo 2026-09-11,
// ver el uso más abajo): un handoff pendiente creado dentro de esta ventana
// se trata como "mismo evento" (no se duplica el aviso); uno más antiguo
// nunca bloquea un handoff nuevo, sin importar que siga sin resolver.
const HANDOFF_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min, mismo criterio real que watchdog.ts#REALERT_SEC

export interface ConversationContext {
  customerId: string;
  customerChannelId: string;
  conversationId: string;
}

/**
 * Encuentra o crea, de forma atómica (withTransaction real), el
 * customer + customer_channel + conversation reales para un teléfono de
 * Hermes/Baileys -- mismo patrón conceptual que ya usa el canal de Meta
 * (customerRepository.findCustomerByChannel), nunca reinventado, solo
 * reutilizado desde este nuevo origen (canal Baileys, mismo tipo_canal).
 */
export async function getOrCreateConversationContext(
  phone: string,
  opts: { nombre?: string | null; firstTouch?: Attribution | null } = {}
): Promise<ConversationContext> {
  const c = await crm();
  return c.withTransaction(async (scoped: any) => {
    let customer = await scoped.customers.findCustomerByChannel(TIPO_CANAL, phone);
    let customerChannel = await scoped.customerChannels.findByTipoAndIdentificador(TIPO_CANAL, phone);

    if (!customer) {
      // firstTouch SOLO se escribe en la creación (ver customerRepository.js)
      // -- si el customer ya existía, nunca se toca su first_touch real aquí.
      customer = await scoped.customers.createCustomer({ nombre: opts.nombre ?? null, firstTouch: opts.firstTouch ?? null });
    } else if (opts.nombre && !customer.nombre) {
      customer = (await scoped.customers.updateCustomerProfile(customer.customerId, { nombre: opts.nombre })) ?? customer;
    }

    if (!customerChannel) {
      customerChannel = await scoped.customerChannels.createCustomerChannel({
        customerId: customer.customerId,
        tipoCanal: TIPO_CANAL,
        identificadorExterno: phone,
        esPrimario: true,
      });
    }

    let conversation = await scoped.conversations.findLatestByCustomerChannelId(customerChannel.customerChannelId);
    if (!conversation) {
      conversation = await scoped.conversations.createConversation({
        customerId: customer.customerId,
        customerChannelId: customerChannel.customerChannelId,
        waIdConversacion: phone,
        source: HERMES_SOURCE,
      });
    }

    return {
      customerId: customer.customerId,
      customerChannelId: customerChannel.customerChannelId,
      conversationId: conversation.conversationId,
    };
  });
}

/**
 * Actualiza el last_touch REAL de un cliente ya existente -- se llama SOLO
 * cuando existe una atribución real nueva (nunca por defecto en cada
 * mensaje). Si el customer no existe todavía, no lo crea (last_touch es
 * "el más reciente origen conocido de un cliente que ya existe" -- crearlo
 * sin first_touch real sería inventar contexto).
 */
export async function recordLastTouch(phone: string, attribution: Attribution): Promise<{ ok: boolean; reason?: string }> {
  if (!crmConfigured()) return { ok: false, reason: "CRM no configurado en este proceso (falta DATABASE_URL)." };
  try {
    const c = await crm();
    const customer = await c.customers.findCustomerByChannel(TIPO_CANAL, phone);
    if (!customer) return { ok: false, reason: "No existe un customer real para este teléfono todavía." };
    await c.customers.updateLastTouch(customer.customerId, attribution);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Error real al registrar last_touch: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Mismo vocabulario real de estados que ya usa el motor comercial de Meta
// (simulator/src/stateMachine.js#ESTADOS_VENTA_REAL, documentado como la
// ÚNICA fuente de verdad de este vocabulario -- ver
// crm/migrations/0001_init_schema.sql, nota de diseño (2): opportunities.estado
// es TEXT sin CHECK constraint precisamente para no duplicar esa lista aquí).
// Hermes NO seguía el flujo rígido paso a paso de ese motor (esta fase lo
// prohíbe explícitamente), pero al escribir en la MISMA columna sí reutiliza
// las MISMAS etiquetas -- nunca un vocabulario paralelo inventado.
function estimarEstadoInicial(input: { productoId?: string | null; intencionCompra?: boolean }): string {
  if (input.intencionCompra) return "NecesidadIdentificada";
  if (input.productoId) return "ProductoIdentificado";
  return "MensajeInicialEnviado";
}

export interface SaveLeadInput {
  phone: string;
  nombre?: string;
  email?: string;
  productoId?: string | null;
  intencionCompra?: boolean;
  necesidadId?: string | null;
}

export interface SaveLeadResult {
  ok: boolean;
  reason?: string;
  opportunityId?: string;
  conversationId?: string;
}

/**
 * Registra/actualiza un lead real en el CRM (crm.opportunities) -- la
 * tool `saveLead` de Hermes. Nunca escribe si DATABASE_URL no está
 * configurada (degrada explícito, no silencioso: devuelve ok:false con el
 * motivo, para que Hermes pueda avisar en vez de fingir que se guardó).
 */
export async function saveLead(input: SaveLeadInput): Promise<SaveLeadResult> {
  if (!crmConfigured()) {
    return { ok: false, reason: "CRM no configurado en este proceso (falta DATABASE_URL) -- el lead no se guardó." };
  }
  if (!input.phone) return { ok: false, reason: "Falta el teléfono real del lead." };

  try {
    const ctx = await getOrCreateConversationContext(input.phone, { nombre: input.nombre ?? null });
    const c = await crm();
    // Una oportunidad activa por conversación (mismo modelo que ya documenta
    // opportunityRepository.findLatestByConversationId): si ya existe una para
    // esta conversación, se ACTUALIZA (nunca se duplica); si no, se crea.
    const existente = await c.opportunities.findLatestByConversationId(ctx.conversationId);

    // opportunities.producto_id es NOT NULL en el schema real (referencia
    // lógica al Knowledge Package, ver crm/migrations/0001_init_schema.sql
    // línea 167) -- no se puede abrir una oportunidad sin un producto real
    // identificado. Si aún no hay ninguno (ni en este turno ni en una
    // oportunidad previa de esta conversación), el contexto de cliente SÍ
    // queda guardado, pero la oportunidad se pospone -- nunca se inventa un
    // producto para poder escribir la fila.
    if (!existente && !input.productoId) {
      return {
        ok: true,
        conversationId: ctx.conversationId,
        reason: "Contacto registrado en el CRM. Aún no se abre una oportunidad porque no hay un producto real identificado todavía -- identifica uno con buscarProductos/consultarProducto y vuelve a llamar con productoId.",
      };
    }

    const opportunity = existente
      ? await c.opportunities.updateOpportunity(existente.opportunityId, {
          productoId: input.productoId ?? existente.productoId,
          intencionCompra: input.intencionCompra ?? existente.intencionCompra,
          necesidadId: input.necesidadId ?? existente.necesidadId,
        })
      : await c.opportunities.createOpportunity({
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          productoId: input.productoId as string,
          intencionCompra: Boolean(input.intencionCompra),
          estado: estimarEstadoInicial(input),
          necesidadId: input.necesidadId ?? null,
        });
    return { ok: true, opportunityId: opportunity.opportunityId, conversationId: ctx.conversationId };
  } catch (err) {
    return { ok: false, reason: `Error real al guardar el lead en el CRM: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface QualifyLeadInput {
  phone: string;
  temperatura: "Caliente" | "Templado" | "Frío";
  productoId?: string | null;
  necesidadId?: string | null;
}

export interface QualifyLeadResult {
  ok: boolean;
  reason?: string;
  opportunityId?: string;
  estado?: string;
}

// Mapea la temperatura (juicio del propio Hermes sobre el interés real del
// lead, en lenguaje natural -- nunca un flujo Q1/Q2/Q3 fijo) al estado real
// más cercano de ESTADOS_VENTA_REAL, mismo criterio que estimarEstadoInicial.
function estadoPorTemperatura(temperatura: QualifyLeadInput["temperatura"], necesidadId?: string | null): string {
  if (temperatura === "Caliente") return "PrecioEnviado";
  if (temperatura === "Templado" && necesidadId) return "NecesidadIdentificada";
  return "ProductoIdentificado";
}

/**
 * Registra/actualiza la calificación real de un lead (tool `qualifyLead`).
 * Encuentra o crea la oportunidad de esta conversación y actualiza su
 * `estado` según el juicio de Hermes sobre el interés real -- nunca inventa
 * una segunda tabla de calificación paralela al CRM.
 */
export async function qualifyLead(input: QualifyLeadInput): Promise<QualifyLeadResult> {
  if (!crmConfigured()) {
    return { ok: false, reason: "CRM no configurado en este proceso (falta DATABASE_URL) -- la calificación no se guardó." };
  }
  if (!input.phone) return { ok: false, reason: "Falta el teléfono real del lead." };

  try {
    const ctx = await getOrCreateConversationContext(input.phone);
    const c = await crm();
    const estado = estadoPorTemperatura(input.temperatura, input.necesidadId);
    const existente = await c.opportunities.findLatestByConversationId(ctx.conversationId);

    // Mismo motivo que en saveLead(): producto_id es NOT NULL en el schema
    // real -- calificar a alguien sin ningún producto real identificado
    // todavía (ni en esta llamada ni en una oportunidad previa) no puede
    // escribir una fila real; se pide honestamente el producto primero.
    if (!existente && !input.productoId) {
      return {
        ok: false,
        reason: "No se puede calificar todavía: no hay un producto real identificado en esta conversación. Identifica uno con buscarProductos/consultarProducto y vuelve a llamar a qualifyLead con productoId.",
      };
    }

    const opportunity = existente
      ? await c.opportunities.updateOpportunity(existente.opportunityId, {
          estado,
          productoId: input.productoId ?? existente.productoId,
          necesidadId: input.necesidadId ?? existente.necesidadId,
        })
      : await c.opportunities.createOpportunity({
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          productoId: input.productoId as string,
          estado,
          necesidadId: input.necesidadId ?? null,
        });
    return { ok: true, opportunityId: opportunity.opportunityId, estado };
  } catch (err) {
    return { ok: false, reason: `Error real al calificar el lead en el CRM: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface PricingPromocion {
  cantidad: string;
  precio: number;
}

export interface ProductPricing {
  precio: number | null;
  disponibleStock: boolean | null;
  // Qué compra el precio normal (ej. "6 sobres", "1 paquete", "1 botella").
  // Real, nunca inventado -- null si no está registrado.
  cantidadBase: string | null;
  // Bundles reales de promoción vigentes (ver crm/migrations/0004). [] o
  // null si el producto no tiene ninguna promoción activa.
  promociones: PricingPromocion[] | null;
}

/**
 * Precio/stock operativo REAL de un producto (crm.productPricing, tabla
 * `product_pricing` -- Fase A §19, distinta del catálogo estático de
 * `docs/productos/`: aquí vive el precio que de verdad puede cambiar).
 * `productoId` es la MISMA referencia lógica que ya usa
 * getProductKnowledge()/searchKnowledge() (id del Knowledge Package
 * compilado) -- nunca un id paralelo. Devuelve null si no hay fila (nunca
 * inventa un precio) o si el CRM no está configurado en este proceso.
 *
 * Hallazgo real (2026-09-10, actualización de catálogo): `product_pricing.precio`
 * es NUMERIC en Postgres y el pool (crm/db/pool.js) no registra un type
 * parser para ese OID -- el driver `pg` devuelve NUMERIC como STRING
 * ("1799.00"), nunca como number. Sin este `Number(...)` explícito, esa
 * cadena cruda llegaba tal cual a la tool de Hermes y de ahí al LLM, que
 * la reformateaba por su cuenta al escribir la respuesta -- la causa real
 * de precios como "$1.799" (el modelo interpretando el separador a su
 * manera) en vez de "$1,799". Los `precio` DENTRO de `promociones` no
 * sufren esto: son JSONB, no NUMERIC, y el driver ya los deserializa como
 * number nativo.
 */
export async function getProductPricing(productoId: string): Promise<ProductPricing | null> {
  if (!crmConfigured()) return null;
  try {
    const c = await crm();
    const row = await c.productPricing.findByProductoId(productoId);
    if (!row) return null;
    return {
      precio: row.precio != null ? Number(row.precio) : null,
      disponibleStock: row.disponibleStock ?? null,
      cantidadBase: row.cantidadBase ?? null,
      promociones: row.promociones ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Formatea un precio real (siempre en pesos, sin decimales salvo que el
 * valor real los tenga) al ÚNICO formato que Hermes debe mostrar: separador
 * de miles con coma, sin punto ("$1,799", nunca "$1.799"), sin ".00" de
 * relleno cuando el importe es entero. `toLocaleString('en-US', ...)` usa
 * coma para miles y punto para decimales -- exactamente la convención
 * pedida, sin reimplementar el formateo a mano.
 */
export function formatearPrecio(precio: number): string {
  const monto = Number(precio);
  const decimales = Number.isInteger(monto) ? 0 : 2;
  return `$${monto.toLocaleString("en-US", { minimumFractionDigits: decimales, maximumFractionDigits: 2 })}`;
}

export interface HandoffResult {
  ok: boolean;
  reason?: string;
  handoffId?: string;
  conversationId?: string;
  // true si YA existía un handoff sin resolver para esta conversación --
  // no se creó una fila nueva ni se disparó una alerta nueva (idempotencia
  // real, hallazgo 2026-09-08: evita duplicar handoff/alerta cuando el
  // detector determinista de intención de compra y el propio LLM intentan
  // derivar la misma conversación).
  duplicate?: boolean;
}

export interface HandoffMensaje {
  role: "user" | "assistant";
  content: string;
  createdAt: number; // epoch segundos (mismo formato que hermes-kit/src/lib/db.ts#Message.created_at)
}

export interface HandoffMedia {
  tipo: string; // 'image' | 'audio' | 'video'
  descripcion: string;
}

/**
 * Vuelca el historial reciente (y la media real enviada) de la conversación
 * LOCAL de Hermes al log real de mensajes del CRM (crm.messages, tabla
 * append-only ya existente -- Fase A §9) justo antes de un handoff, para que
 * el humano que retome NO tenga que pedirle de nuevo al cliente nada de lo
 * que ya contó. Best-effort por mensaje: un fallo puntual no aborta el
 * handoff ni el resto del volcado.
 */
async function mirrorHistoryToCrm(conversationId: string, mensajes: HandoffMensaje[], media: HandoffMedia[]): Promise<void> {
  const c = await crm();
  for (const m of mensajes) {
    try {
      await c.messages.insertMessage({
        conversationId,
        direccion: m.role === "user" ? "entrante" : "saliente",
        texto: m.content,
        timestamp: new Date(m.createdAt * 1000).toISOString(),
      });
    } catch {
      // best-effort -- un mensaje que no se pudo volcar no debe bloquear el handoff real.
    }
  }
  for (const med of media) {
    try {
      await c.messages.insertMessage({
        conversationId,
        direccion: "saliente",
        texto: med.descripcion,
        timestamp: new Date().toISOString(),
        recursoTipo: med.tipo,
      });
    } catch {
      // best-effort, ver nota de arriba.
    }
  }
}

/**
 * Deriva la conversación a un humano REAL (crm.handoffs) -- la tool
 * `handoffToHuman`. Reutiliza handoffRepository.insertHandoff tal cual
 * existe; no inventa un mecanismo de resolución (documentado como
 * pendiente en docs/PROJECT_STATE.md -- fuera de alcance de esta fase).
 *
 * `opts.mensajes`/`opts.media` (opcionales): si se pasan, se vuelcan al log
 * real de mensajes del CRM ANTES de crear el handoff (ver
 * mirrorHistoryToCrm) -- así el humano tiene el contexto real completo, no
 * solo la frase suelta de `motivo`.
 */
export async function handoffToHuman(
  phone: string,
  motivo: string,
  opts: { nombre?: string | null; mensajes?: HandoffMensaje[]; media?: HandoffMedia[] } = {}
): Promise<HandoffResult> {
  if (!crmConfigured()) {
    return { ok: false, reason: "CRM no configurado en este proceso (falta DATABASE_URL) -- el handoff no quedó registrado en el CRM (el modo Humano local del kit sí se activó)." };
  }
  try {
    const ctx = await getOrCreateConversationContext(phone, { nombre: opts.nombre ?? null });
    const c = await crm();

    // El volcado de historial/media al log real del CRM siempre es útil
    // para el humano (incluida una conversación que sigue después de un
    // handoff ya existente) -- se hace siempre, independientemente de si
    // esta llamada termina creando una fila nueva o no.
    if (opts.mensajes?.length || opts.media?.length) {
      await mirrorHistoryToCrm(ctx.conversationId, opts.mensajes ?? [], opts.media ?? []);
    }

    // Idempotencia REAL (hallazgo 2026-09-08, acotada por tiempo 2026-09-11):
    // si esta conversación ya tiene un handoff sin resolver MUY RECIENTE, no
    // se crea una fila nueva ni se dispara otra alerta -- tanto el detector
    // determinista de intención de compra como el propio LLM (vía la tool)
    // pueden intentar derivar la misma conversación EN EL MISMO EVENTO;
    // ambos caminos pasan por aquí, un solo punto de verdad.
    //
    // Hallazgo real (2026-09-11): sin ventana de tiempo, un handoff pendiente
    // de DÍAS antes (nunca resuelto -- ver resolveHandoff más abajo, antes
    // no operativo desde el Dashboard) bloqueaba SILENCIOSAMENTE cualquier
    // handoff nuevo de esa conversación, aunque fuera un evento totalmente
    // distinto -- "duplicado" pasó a significar "cualquier pendiente
    // histórico", no "el mismo evento". HANDOFF_DEDUP_WINDOW_MS acota la
    // idempotencia a su propósito real: evitar el doble aviso del MISMO
    // evento (segundos de diferencia), nunca bloquear eventos futuros no
    // relacionados. listPendientesByConversationId ya viene ordenado
    // ascendente por creado_en -- el más reciente es el último elemento.
    const pendientes = await c.handoffs.listPendientesByConversationId(ctx.conversationId);
    const masReciente = pendientes[pendientes.length - 1];
    const esMismoEventoReciente =
      masReciente && Date.now() - Date.parse(masReciente.creadoEn) < HANDOFF_DEDUP_WINDOW_MS;
    if (esMismoEventoReciente) {
      return { ok: true, handoffId: masReciente.handoffId, conversationId: ctx.conversationId, duplicate: true };
    }

    const handoff = await c.handoffs.insertHandoff({
      conversationId: ctx.conversationId,
      motivo,
      fuente: "hermes-baileys",
    });

    // Alerta real al admin por WhatsApp + Telegram (best-effort, nunca
    // rompe el handoff si alguno falla o no está configurado -- ver
    // watchdog.ts#alertHandoff, que ya trata ambos canales como
    // independientes entre sí). Solo se dispara aquí, en la rama que
    // realmente creó una fila nueva -- nunca en la rama duplicada de
    // arriba (misma idempotencia real para ambos canales).
    try {
      const { alertHandoff } = await import("../watchdog");
      // Nombre real ya conocido localmente (WhatsApp push name), si lo hay
      // -- nunca inventado, nunca vía LLM. opts.nombre tiene prioridad si
      // se pasó explícitamente.
      let nombreParaAlerta = opts.nombre ?? null;
      if (!nombreParaAlerta) {
        try {
          nombreParaAlerta = getConversationByPhone(phone)?.name ?? null;
        } catch {
          nombreParaAlerta = null;
        }
      }
      await alertHandoff(phone, motivo, nombreParaAlerta);
    } catch {
      // el aviso es best-effort -- el handoff real ya quedó registrado
    }

    return { ok: true, handoffId: handoff.handoffId, conversationId: ctx.conversationId };
  } catch (err) {
    return { ok: false, reason: `Error real al registrar el handoff en el CRM: ${err instanceof Error ? err.message : String(err)}` };
  }
}
