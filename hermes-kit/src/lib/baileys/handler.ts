import type { WASocket, BaileysEventMap, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";
import {
  getOrCreateConversation,
  getConversationById,
  getConversationByPhone,
  insertMessage,
  getRecentHistory,
  getSetting,
  reconcileLidToPn,
  insertVoiceCall,
  setConversationLanguage,
} from "../db";
import type { Message } from "../db";
import { generateReply } from "../openrouter";
import { getLeadMemory, memoryToPrompt, rememberConversation, logMessage } from "../memory";
import { guardInbound, guardOutbound, GUARD_FALLBACK } from "../guardrails";
import { transcribeAudio, transcriptionConfigured } from "../transcribe";
import { describeImage, visionConfigured } from "../vision";
import { saneaHumano, dividirMensajes, delayEscritura, aptoParaNotaDeVoz } from "../humanize";
import { registrarFallback } from "../watchdog";
import { decideResponseMode } from "../vidaDivina/responseMode";
import { generateVoice } from "../vidaDivina/voiceEngineClient";
import { debeDerivarPorCompraClara, resolverCompraAutonoma, construirRefuerzoCompraAutonoma, detectarSolicitudPago } from "../vidaDivina/purchaseIntent";
import { getProductTitleById } from "../vidaDivina/productKnowledge";
import { detectarIntencionPrecio, textoSinRuidoDePrecio, construirRefuerzoPrecio } from "../vidaDivina/priceIntent";
import { detectarIdioma, idiomaEfectivo } from "../vidaDivina/languageDetection";
import { ejecutarHandoffReal, FRASE_CIERRE_COMPRA_EXACTA } from "../tools/derivar-humano";
import { consultarProductoHandler } from "../tools/consultar-producto";
import { cerrarVentaTransferenciaHandler } from "../tools/comercio";
import { consultarPedidoActivo, crearPedido } from "../vidaDivina/crmClient";

const logger = pino({ level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info" });

// Aviso suave cuando algo falla (LLM caído, sin saldo, error de tool): mejor
// esto que dejar al lead con "escribiendo…" y silencio para siempre.
const RESPUESTA_FALLBACK = "Perdona, se me cruzó un cable un momento. ¿Me lo repites?";

/** Enmascara el teléfono para los logs (deja solo los últimos 4 dígitos) — PII. */
function phoneMasked(phone: string): string {
  return phone.length > 4 ? "***" + phone.slice(-4) : "***";
}

// Integridad de envío outbound (hallazgo real 2026-09-17): `sock.sendMessage`
// (Baileys) devuelve `Promise<proto.WebMessageInfo | undefined>` -- puede
// RESOLVER SIN LANZAR aunque el mensaje nunca se haya confirmado de verdad
// (ej. conexión cayendo/reconectando), devolviendo `undefined` o un objeto
// sin `key.id` real. En todos los puntos de envío de este archivo ese valor
// de retorno se descartaba (`await sock.sendMessage(...)` sin capturarlo),
// así que un envío realmente fallido pasaba como éxito silencioso: el
// mensaje quedaba igual `insertMessage`ado (visible en el Dashboard) como si
// WhatsApp lo hubiera recibido. Este helper es el ÚNICO punto real de envío
// de texto del archivo -- no crea outbox/cola nueva, solo confirma con el
// dato que Baileys YA devuelve antes de dar el envío por bueno.
export async function enviarTextoConfirmado(sock: WASocket, jid: string, texto: string): Promise<boolean> {
  try {
    const info = await sock.sendMessage(jid, { text: texto });
    if (!info?.key?.id) {
      logger.error(`[bot] sendMessage resolvió sin confirmar entrega real (jid=${jid.slice(0, 6)}…)`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[bot] sendMessage lanzó excepción");
    return false;
  }
}

/**
 * Solicitud de pago determinista (Fase "Hacer determinista el flujo de
 * transferencia", 2026-09-17) -- hallazgo real: un cliente que ya mostró
 * interés en un producto y luego solo pregunta "¿me puedes dar información
 * para pagar?" (sin decir literalmente "transferencia") quedaba
 * enteramente en manos del LLM -- en un caso real pidió CORREO ELECTRÓNICO
 * (dato que este negocio no usa) y terminó derivando con el mensaje
 * genérico de handoff. Transferencia es HOY el único método autónomo real:
 * si el cliente pregunta genéricamente cómo pagar/pide los datos SIN
 * mencionar un método no soportado (`detectarSolicitudPago` ya lo
 * descarta), la respuesta NUNCA depende del criterio del LLM.
 *
 * Reutiliza EXACTAMENTE las mismas piezas comerciales ya existentes
 * (`consultarPedidoActivo`, `resolverCompraAutonoma`, `crearPedido`,
 * `cerrarVentaTransferenciaHandler`) -- nunca un segundo mecanismo de pago.
 * Transferencia NUNCA deriva a HUMAN por este camino: si no hay pedido
 * activo ni producto identificable en la conversación reciente, no se
 * inventa nada -- devuelve `false` y el flujo normal (LLM) continúa, que
 * debe preguntar qué producto quiere (ver derivar-humano.ts, regla dura
 * sobre transferencia).
 *
 * Devuelve `true` SOLO si ya envió (confirmado) el mensaje autorizado de
 * transferencia al cliente -- el llamador debe cortar el turno ahí mismo.
 */
export async function intentarSolicitudPagoDeterminista(
  sock: WASocket,
  jid: string,
  phone: string,
  conversationId: number,
  history: Message[],
  texto: string
): Promise<boolean> {
  if (!detectarSolicitudPago(texto)) return false;
  try {
    let orderId: string | null = null;

    const pedidoActivo = await consultarPedidoActivo(phone);
    if (pedidoActivo) {
      orderId = pedidoActivo.orderId;
    } else {
      // Producto claro en la conversación reciente (no necesariamente en
      // ESTE mensaje, ej. "me interesan las cápsulas Ripped" ... "me
      // puedes dar información para pagar") -- se concatenan los últimos
      // mensajes reales del cliente. Se añade "transferencia" al final
      // SOLO para satisfacer la condición interna de `resolverCompraAutonoma`:
      // ya sabemos, por `detectarSolicitudPago` (sin método no soportado
      // mencionado), que el método implicado es transferencia, el único
      // autónomo real hoy.
      const textoReciente = [...history]
        .filter((m) => m.role === "user")
        .slice(-5)
        .map((m) => m.content)
        .join(" ");
      const resuelto = await resolverCompraAutonoma(`${textoReciente} transferencia`);
      if (resuelto) {
        const nuevoPedido = await crearPedido({ phone, productoId: resuelto.productoId });
        if (nuevoPedido.ok && nuevoPedido.orderId) orderId = nuevoPedido.orderId;
      }
    }

    if (!orderId) return false; // sin producto identificable -- el LLM debe preguntar, nunca inventar

    const cierre = (await cerrarVentaTransferenciaHandler({ orderId, conversationId })) as {
      ok?: boolean;
      mensajeAutorizado?: string;
    };
    if (!cierre.ok || !cierre.mensajeAutorizado) return false;

    const enviado = await enviarTextoConfirmado(sock, jid, cierre.mensajeAutorizado);
    if (!enviado) return false;

    insertMessage(conversationId, "assistant", cierre.mensajeAutorizado);
    logMessage(phone, "assistant", cierre.mensajeAutorizado);
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[bot] solicitud de pago determinista falló, sigue el flujo normal"
    );
    return false;
  }
}

/**
 * Teléfono CANÓNICO del lead, el que lo identifica en memoria, CRM y conversación.
 *
 * WhatsApp (2025+) entrega algunos mensajes directos con dirección `@lid`, cuyo
 * número NO es el teléfono real sino un identificador interno. En esos casos
 * Baileys adjunta el número real en `key.senderPn` (viene del atributo `sender_pn`
 * del propio WhatsApp): lo usamos como identidad para no duplicar a la persona ni
 * perder su memoria entre visitas. El `@lid` completo se sigue usando SOLO como
 * dirección de respuesta (remoteJid / conversations.jid). Si no llega `senderPn`,
 * caemos al número del jid (degradado, pero estable dentro de esa dirección).
 */
function canonicalPhone(remoteJid: string, senderPn?: string): string {
  const digits = (jid: string) => jid.split("@")[0].split(":")[0];
  if (remoteJid.endsWith("@lid") && senderPn && senderPn.includes("@") && /\d/.test(senderPn)) {
    return digits(senderPn);
  }
  return digits(remoteJid);
}

// Buffer de agrupación: cuando llega un mensaje, esperamos unos segundos por si
// el lead escribe más (típico en WhatsApp: varios mensajes cortos seguidos).
// Cada mensaje nuevo reinicia el temporizador; al expirar, se responde UNA vez
// a todo lo acumulado. Editable en caliente desde Ajustes (buffer_seconds),
// con fallback a la variable de entorno BUFFER_SECONDS (por defecto 10).
function bufferMs(): number {
  const s = Number(getSetting("buffer_seconds")) || Number(process.env.BUFFER_SECONDS) || 10;
  return Math.min(Math.max(s, 0), 120) * 1000;
}
const pending = new Map<
  number,
  { timer: ReturnType<typeof setTimeout>; jid: string; phone: string; isIncomingAudio: boolean }
>();

/**
 * Resumen corto de lo último hablado (últimos ~8 mensajes) para la memoria de
 * largo plazo. No usa LLM: es la propia conversación condensada, suficiente para
 * que el agente retome si la persona vuelve semanas después.
 */
function resumenConversacion(history: Message[], ultimaRespuesta: string): string {
  const lineas = history.map(
    (m) => `${m.role === "user" ? "Lead" : "Agente"}: ${String(m.content).replace(/\s+/g, " ").trim()}`
  );
  lineas.push(`Agente: ${ultimaRespuesta.replace(/\s+/g, " ").trim()}`);
  let texto = lineas.slice(-8).join("\n");
  if (texto.length > 1200) texto = texto.slice(texto.length - 1200);
  return texto;
}

/**
 * Envía el aviso suave y SOLO lo persiste (Dashboard) si Baileys confirmó
 * la entrega real -- antes se insertaba primero y se enviaba después,
 * dentro de un catch que tragaba cualquier fallo en silencio: si el envío
 * fallaba, el Dashboard igual mostraba el aviso como si hubiera llegado.
 * Best-effort real: si ni esto se puede confirmar, queda en el log de error
 * (ya existente), nunca lanza hacia el llamador.
 */
async function enviarFallback(sock: WASocket, jid: string, conversationId: number): Promise<void> {
  // Cuenta el evento para la alarma del watchdog (picos de mensajes de emergencia).
  registrarFallback(conversationId);
  try {
    const fb = saneaHumano(RESPUESTA_FALLBACK);
    const enviado = await enviarTextoConfirmado(sock, jid, fb);
    if (enviado) {
      insertMessage(conversationId, "assistant", fb);
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[bot] enviarFallback: no se pudo confirmar el envío");
  }
}

export async function handleIncomingMessages(
  sock: WASocket,
  event: BaileysEventMap["messages.upsert"]
): Promise<void> {
  if (event.type !== "notify") return;

  for (const msg of event.messages) {
    if (msg.key.fromMe) continue;

    const remoteJid = msg.key.remoteJid ?? "";
    if (
      remoteJid.endsWith("@g.us") ||
      remoteJid.endsWith("@broadcast") ||
      remoteJid.endsWith("@newsletter")
    ) {
      continue;
    }
    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) continue;

    // Teléfono real, calculado temprano (puro, sin efectos secundarios --
    // nunca crea nada en DB) para poder pasarle a la transcripción el
    // idioma YA conocido de esta conversación como pista (ver
    // languageDetection.ts) -- getConversationByPhone es de solo lectura,
    // nunca crea una fila nueva (a diferencia de getOrCreateConversation,
    // que sigue ejecutándose más abajo, en su mismo punto de siempre).
    const senderPnTemprano = msg.key.senderPn ?? undefined;
    const phone = canonicalPhone(remoteJid, senderPnTemprano);

    // Texto directo o, si es nota de voz, la transcripción.
    let text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
    const isAudio = Boolean(msg.message?.audioMessage);
    const isImage = Boolean(msg.message?.imageMessage);

    if ((!text || text.trim() === "") && isAudio) {
      const idiomaConocido = idiomaEfectivo(getConversationByPhone(phone)?.language);
      text = await transcribeIncomingAudio(sock, msg, remoteJid, idiomaConocido);
      if (text === null) continue; // ya se respondió al lead pidiendo texto
    }

    // Imagen: el agente la "ve" a través de una descripción del modelo de visión.
    if (isImage) {
      const caption = msg.message?.imageMessage?.caption?.trim() || undefined;
      const desc = await describeIncomingImage(sock, msg);
      if (desc) {
        text = caption
          ? `${caption}\n[El cliente ha enviado una imagen: ${desc}]`
          : `[El cliente ha enviado una imagen: ${desc}]`;
      } else if (caption) {
        text = caption; // no se pudo ver, pero al menos hay texto que la acompaña
      } else {
        await sock
          .sendMessage(remoteJid, {
            text: "He recibido tu imagen pero no consigo verla bien. ¿Me cuentas qué es o qué necesitas?",
          })
          .catch(() => {});
        continue;
      }
    }

    if (!text || text.trim() === "") {
      // Sticker, documento, etc. — fuera de alcance por ahora.
      continue;
    }

    if (remoteJid.endsWith("@lid")) {
      if (senderPnTemprano) {
        logger.info(`[bot] @lid resuelto a número real ${phoneMasked(phone)}`);
        // Reconcilia una conversación antigua creada bajo el LID (antes de este
        // arreglo): la re-indexa o fusiona con la del número real, sin duplicar.
        reconcileLidToPn(remoteJid.split("@")[0].split(":")[0], phone, remoteJid);
      } else {
        logger.warn("[bot] mensaje @lid sin senderPn: uso el LID como identidad (degradado)");
      }
    }
    const pushName = msg.pushName ?? undefined;
    logger.info(`[bot] ← ${isAudio ? "(voz) " : isImage ? "(imagen) " : ""}mensaje de ${phoneMasked(phone)}: "${text.slice(0, 60)}"`);

    const convo = getOrCreateConversation(phone, pushName, remoteJid);

    // Guardrail de entrada: trunca lo desproporcionado y corta el flood.
    // En flood simplemente NO respondemos (ni gastamos ni alimentamos abuso).
    const inbound = guardInbound(convo.id, text);
    insertMessage(convo.id, "user", inbound.text);
    logMessage(phone, "user", inbound.text); // espejo a Supabase (best-effort)
    if (!inbound.allowed) {
      logger.warn(`[guardrails] entrada bloqueada (${inbound.reason}) — no respondo a ${phoneMasked(phone)}`);
      continue;
    }

    // Si un humano tomó la conversación desde el dashboard, el bot calla.
    const fresh = getConversationById(convo.id);
    if (!fresh || fresh.mode !== "AI") {
      logger.info(`[bot] conversación ${convo.id} en modo HUMAN, no respondo`);
      continue;
    }

    // Pausa global desde Ajustes: el mensaje se guarda y se ve en el panel,
    // pero el agente no responde a nadie hasta reanudar.
    if (getSetting("paused") === "1") {
      logger.info(`[bot] en PAUSA global — mensaje de ${phoneMasked(phone)} guardado, no respondo`);
      continue;
    }

    scheduleReply(sock, convo.id, remoteJid, phone, isAudio);
  }
}

/** (Re)programa la respuesta agrupada tras BUFFER_MS de silencio. */
function scheduleReply(sock: WASocket, conversationId: number, jid: string, phone: string, isAudio: boolean): void {
  const existing = pending.get(conversationId);
  if (existing) clearTimeout(existing.timer);

  // Si CUALQUIER mensaje del lote agrupado fue una nota de voz, se trata el
  // lote entero como "llegó audio" para la decisión de formato de salida.
  const isIncomingAudio = isAudio || existing?.isIncomingAudio || false;

  const timer = setTimeout(() => {
    pending.delete(conversationId);
    void generateAndSend(sock, conversationId, jid, phone, isIncomingAudio);
  }, bufferMs());

  pending.set(conversationId, { timer, jid, phone, isIncomingAudio });

  // Señal de vida durante la espera: "escribiendo…" (best-effort).
  void sock.sendPresenceUpdate("composing", jid).catch(() => {});
}

/** Genera y envía UNA respuesta a todo lo acumulado en la conversación. */
async function generateAndSend(
  sock: WASocket,
  conversationId: number,
  jid: string,
  phone: string,
  isIncomingAudio = false
): Promise<void> {
  const fresh = getConversationById(conversationId);
  if (!fresh || fresh.mode !== "AI") return; // pudo pasar a HUMAN durante la espera

  const start = Date.now();
  try {
    const history = getRecentHistory(conversationId, 20);

    // Detección DETERMINISTA de intención de compra clara (hallazgo real,
    // 2026-09-08): el modelo puede narrar la regla de derivarHumano en vez
    // de ejecutarla. Para las frases de compra más inequívocas, el handoff
    // se dispara aquí, en código, ANTES de llamar al LLM -- nunca depende
    // de que el modelo decida cooperar. El cliente recibe SOLO la frase de
    // cierre exacta ya existente, nunca el razonamiento del LLM (que en
    // este camino ni siquiera se invoca). Idempotente de verdad: si ya
    // había un handoff pendiente para esta conversación, ejecutarHandoffReal
    // no crea uno nuevo ni dispara otra alerta (ver crmClient.ts).
    //
    // Precedencia de compra autónoma (2026-09-15, decisión de negocio real):
    // `debeDerivarPorCompraClara` (purchaseIntent.ts) SOLO da true aquí si,
    // además de intención de compra clara, el mensaje NO resuelve ya un
    // flujo autónomo completo (producto real + transferencia, el único
    // método autónomo hoy) -- cuando sí lo resuelve, este bloque se salta
    // entero y el flujo normal de abajo (LLM + tools) sigue, donde
    // crearPedido/cerrarVentaTransferencia están disponibles. Cualquier
    // caso ambiguo (sin producto, sin método, u otro método no autónomo)
    // sigue derivando exactamente igual que antes.
    const ultimoMensajeUsuario = [...history].reverse().find((m) => m.role === "user");

    // Idioma real de esta conversación (2026-09-12, "idioma de la
    // conversación") -- detección determinista local, NUNCA vía LLM (ver
    // languageDetection.ts). Se recalcula y se persiste EN CADA TURNO
    // (nunca solo la primera vez): si el cliente cambia de idioma, el
    // siguiente turno ya responde en el nuevo idioma. Un mensaje ambiguo
    // conserva el idioma previo tal cual (nunca lo cambia sin evidencia).
    const idiomaPrevio = idiomaEfectivo(fresh.language);
    const idiomaDetectado = ultimoMensajeUsuario
      ? detectarIdioma(ultimoMensajeUsuario.content, idiomaPrevio)
      : idiomaPrevio;
    if (idiomaDetectado !== fresh.language) {
      try {
        setConversationLanguage(conversationId, idiomaDetectado);
      } catch {
        // nunca debe romper la respuesta -- en el peor caso, el próximo turno lo reintenta
      }
    }

    if (ultimoMensajeUsuario && (await debeDerivarPorCompraClara(ultimoMensajeUsuario.content))) {
      // Orden de integridad (hallazgo real 2026-09-17): antes, el handoff
      // (`ejecutarHandoffReal` -- pone `mode=HUMAN` YA MISMO) se ejecutaba
      // ANTES de siquiera intentar enviar la frase de cierre al cliente, y
      // el envío no se confirmaba (ver `enviarTextoConfirmado`). Si el envío
      // fallaba (ej. socket cayendo/reconectando), la conversación quedaba
      // en HUMAN (bot desconectado) y el Dashboard mostraba el mensaje como
      // enviado (`insertMessage` corría igual), pero el cliente nunca lo
      // recibía. Ahora: se intenta y confirma el envío PRIMERO; el handoff
      // real (y su persistencia en el Dashboard) solo ocurre si el cliente
      // sí recibió la frase de cierre. Si el envío falla, esta conversación
      // NO pasa a HUMAN todavía -- sigue el flujo normal con el LLM abajo
      // (mismo fallback ya existente para cuando el handoff no se completa).
      const fb = saneaHumano(FRASE_CIERRE_COMPRA_EXACTA);
      const enviado = await enviarTextoConfirmado(sock, jid, fb);
      if (enviado) {
        const resultado = await ejecutarHandoffReal({
          conversationId,
          tipo: "compra",
          razon: `Cliente confirma intención de compra: "${ultimoMensajeUsuario.content.slice(0, 200)}"`,
        });
        if (resultado.ok) {
          insertMessage(conversationId, "assistant", fb);
          logMessage(phone, "assistant", fb);
          logger.info(`[bot] → (${Date.now() - start}ms) handoff determinista (compra) a ${phoneMasked(phone)}`);
          return;
        }
        // El cliente YA recibió la frase de cierre pero el handoff real
        // (CRM/mode) falló -- se deja constancia en el Dashboard igual
        // (el mensaje sí llegó) aunque el mecanismo de handoff no se haya
        // completado; nunca se inventa un handoff que no ocurrió.
        insertMessage(conversationId, "assistant", fb);
        logMessage(phone, "assistant", fb);
        logger.warn(`[bot] handoff determinista (compra) falló tras envío confirmado a ${phoneMasked(phone)}`);
        return;
      }
      logger.warn(`[bot] no se pudo confirmar el envío de la frase de cierre de compra a ${phoneMasked(phone)}, no se deriva todavía`);
      // Si por lo que sea el envío no se pudo confirmar, sigue el flujo
      // normal con el LLM -- nunca deja al cliente sin respuesta por esto,
      // y nunca pasa a HUMAN sin que el cliente haya recibido nada.
    }

    // Solicitud de pago determinista (hallazgo real 2026-09-17: "me puedes
    // dar información para pagar", tras ya mostrar interés en un producto,
    // dejaba la decisión enteramente al LLM -- en un caso real pidió CORREO
    // ELECTRÓNICO, dato que este negocio no usa, y terminó derivando con el
    // mensaje genérico de handoff). Ver `intentarSolicitudPagoDeterminista`.
    if (ultimoMensajeUsuario) {
      const manejado = await intentarSolicitudPagoDeterminista(
        sock,
        jid,
        phone,
        conversationId,
        history,
        ultimoMensajeUsuario.content
      );
      if (manejado) {
        logger.info(`[bot] → (${Date.now() - start}ms) solicitud de pago determinista a ${phoneMasked(phone)}`);
        return;
      }
    }

    // Memoria de largo plazo: qué sabemos de esta persona de conversaciones
    // anteriores (Supabase). Degrada en silencio si no está configurada o falla.
    // El resumen de lo hablado solo se inyecta si VUELVE tras un rato (>1h desde
    // la última vez); en una charla en curso sería redundante con el historial.
    let memoryContext = "";
    try {
      const mem = await getLeadMemory(phone);
      if (mem) {
        const lastSeenMs = mem.last_seen ? Date.parse(mem.last_seen) : 0;
        const reencuentro = !lastSeenMs || Date.now() - lastSeenMs > 60 * 60 * 1000;
        memoryContext = memoryToPrompt(mem, reencuentro);
      }
    } catch {
      memoryContext = "";
    }

    // Refuerzo determinista de precio (hallazgo real 2026-09-11): ante
    // "¿Cuánto cuestan las cápsulas Reishi?" el LLM llamó a buscarProductos
    // (sin precio) en vez de consultarProducto -- nunca depender solo de
    // que elija bien la tool. Si el último mensaje pide claramente precio/
    // costo/promoción, se resuelve el producto y se trae el precio REAL
    // aquí, en código, y se entrega ya verificado en el contexto -- el LLM
    // sigue pudiendo llamar a consultarProducto igualmente, esto es un
    // refuerzo, nunca un reemplazo. Nunca hardcodea un producto concreto.
    if (ultimoMensajeUsuario && detectarIntencionPrecio(ultimoMensajeUsuario.content)) {
      try {
        let res = (await consultarProductoHandler({ producto: ultimoMensajeUsuario.content, language: idiomaDetectado })) as {
          encontrado: boolean;
          titulo?: string;
          precioFormateado?: string | null;
          cantidadBase?: string | null;
        };
        if (!res.encontrado) {
          const textoLimpio = textoSinRuidoDePrecio(ultimoMensajeUsuario.content);
          if (textoLimpio) {
            res = (await consultarProductoHandler({ producto: textoLimpio, language: idiomaDetectado })) as typeof res;
          }
        }
        if (res.encontrado) {
          // Idioma (2026-09-12): este refuerzo determinista estaba SIEMPRE
          // en español -- causa raíz real confirmada, competía contra la
          // instrucción de idioma en cada pregunta de precio. El precio/
          // monto real nunca se traduce, solo la instrucción que lo rodea
          // (ver priceIntent.ts#construirRefuerzoPrecio).
          memoryContext += construirRefuerzoPrecio(idiomaDetectado, {
            titulo: res.titulo ?? "",
            precioFormateado: res.precioFormateado ?? null,
            cantidadBase: res.cantidadBase ?? null,
          });
        }
      } catch {
        // red de seguridad best-effort -- nunca debe romper la respuesta normal
      }
    }

    // Refuerzo determinista de compra autónoma (hallazgo real 2026-09-16):
    // el gate de arriba solo IMPIDE el handoff forzado cuando
    // `detectarIntencionCompraClara` da true; nunca obliga al LLM a llamar
    // a crearPedido/cerrarVentaTransferencia, y frases reales de compra
    // ("quiero hacer un pedido de cápsulas venus, pago por transferencia
    // porfavor") ni siquiera activan esa detección -- el LLM quedaba sin
    // ningún refuerzo y, en un caso real, decidió por su cuenta llamar a
    // derivarHumano en vez de continuar el flujo autónomo. Mismo patrón que
    // el refuerzo de precio de arriba: se evalúa SIEMPRE que haya mensaje,
    // independiente de `debeDerivarPorCompraClara` (ver
    // purchaseIntent.ts#construirRefuerzoCompraAutonoma).
    if (ultimoMensajeUsuario) {
      try {
        const compraResuelta = await resolverCompraAutonoma(ultimoMensajeUsuario.content);
        if (compraResuelta) {
          const tituloReal = await getProductTitleById(compraResuelta.productoId);
          if (tituloReal) {
            memoryContext += construirRefuerzoCompraAutonoma(idiomaDetectado, { titulo: tituloReal });
          }
        }
      } catch {
        // red de seguridad best-effort -- nunca debe romper la respuesta normal
      }
    }

    logger.info(
      `[bot] llamando al LLM con ${history.length} mensajes${memoryContext ? " + memoria" : ""}...`
    );

    // turnMessageId: id real del mensaje del lead que dispara este turno
    // (auditoría de costo, ver usage_calls) -- reutiliza ultimoMensajeUsuario
    // ya calculado arriba, nunca un id inventado.
    const reply = await generateReply({
      history,
      conversationId,
      memoryContext,
      turnMessageId: ultimoMensajeUsuario?.id ?? null,
      phone,
      language: idiomaDetectado,
    });
    if (!reply || reply.trim() === "") {
      logger.warn("[bot] LLM devolvió respuesta vacía, envío aviso suave");
      await enviarFallback(sock, jid, conversationId);
      return;
    }

    // Contexto del lead (lo que ha escrito) para que el guard permita que el
    // agente repita cifras que mencionó el propio lead (p.ej. lo que cobró a un cliente).
    const contextoLead = history.filter((m) => m.role === "user").map((m) => m.content).join(" ");
    const guard = guardOutbound(reply, contextoLead);
    if (!guard.ok) {
      logger.warn(`[guardrails] respuesta bloqueada (${guard.reason}) — enviado fallback`);
      const fb = saneaHumano(GUARD_FALLBACK);
      const enviado = await enviarTextoConfirmado(sock, jid, fb);
      if (enviado) insertMessage(conversationId, "assistant", fb);
      return;
    }

    // El modelo puede pedir varios mensajes (con "|||") para adaptarse a quien
    // escribe a ráfagas. Se envían por separado, con "escribiendo…" y un
    // pequeño retardo entre ellos para que suene humano.
    const partes = dividirMensajes(reply);

    // Decisión texto/voz (Voice Engine real de Vida Divina, nunca un TTS
    // nuevo -- ver vidaDivina/responseMode.ts y vidaDivina/voiceEngineClient.ts).
    // Se decide UNA vez por respuesta completa, no por cada parte.
    const ultimoTextoLead = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
    const formato = decideResponseMode({ userText: ultimoTextoLead, isIncomingAudio, responseText: reply });

    let enviadoComoVoz = false;
    if (formato === "voice") {
      const textoParaVoz = partes.join(" ");
      const palabrasTexto = textoParaVoz.trim().split(/\s+/).filter(Boolean).length;
      const metricaBase = {
        conversationId,
        messageId: ultimoMensajeUsuario?.id ?? null,
        characters: textoParaVoz.length,
        words: palabrasTexto,
      };

      if (!aptoParaNotaDeVoz(textoParaVoz)) {
        // Nunca se trunca el texto -- solo se decide que, por su longitud,
        // conviene entregarlo como mensajes de texto (respuesta completa
        // igual) en vez de una nota de voz artificialmente larga.
        logger.info(`[bot] respuesta demasiado larga para nota de voz natural (${palabrasTexto} palabras), enviando como texto`);
        try {
          insertVoiceCall({ ...metricaBase, attempted: false, success: false, fallbackToText: true, reason: "respuesta demasiado larga para nota de voz natural" });
        } catch {
          // el registro de métricas nunca debe romper la respuesta
        }
      } else {
        // language (2026-09-12): la voz debe sonar en el mismo idioma real
        // de la respuesta textual -- antes siempre caía al default "es" del
        // Voice Engine, sin importar el idioma real de esta conversación.
        // context sigue siendo "whatsapp" siempre (sin cambios, ver
        // voiceEngineClient.ts) -- son dos parámetros independientes.
        const voz = await generateVoice(textoParaVoz, { language: idiomaDetectado });
        if (voz.ok) {
          try {
            await sock.sendMessage(jid, {
              audio: fs.readFileSync(voz.oggPath),
              mimetype: "audio/ogg; codecs=opus",
              ptt: true,
            });
            enviadoComoVoz = true;
          } catch (err) {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[bot] fallo enviando la nota de voz real, degrado a texto"
            );
          }
        } else {
          logger.warn(`[bot] Voice Engine no disponible (${voz.reason}), degrado a texto`);
        }
        try {
          insertVoiceCall({
            ...metricaBase,
            attempted: true,
            success: voz.ok && enviadoComoVoz,
            fallbackToText: !enviadoComoVoz,
            durationSeconds: voz.ok ? voz.durationSeconds : null,
            generationSeconds: voz.ok ? voz.generationSeconds : null,
            sampleRate: voz.ok ? voz.sampleRate : null,
            reason: voz.ok ? null : voz.reason,
          });
        } catch {
          // el registro de métricas nunca debe romper la respuesta
        }
      }
    }

    if (enviadoComoVoz) {
      // El audio ya se envió como UN mensaje; el texto completo queda igual
      // en el historial (para el dashboard y la memoria), pero no se reenvía
      // como burbujas de texto aparte.
      insertMessage(conversationId, "assistant", reply);
      logMessage(phone, "assistant", reply);
    } else {
      for (let i = 0; i < partes.length; i++) {
        if (i > 0) {
          await sock.sendPresenceUpdate("composing", jid).catch(() => {});
          await new Promise((r) => setTimeout(r, delayEscritura(partes[i])));
        }
        const enviado = await enviarTextoConfirmado(sock, jid, partes[i]);
        if (!enviado) {
          // No se confirma la entrega real de esta parte -- no se persiste
          // (el Dashboard nunca debe mostrarla como enviada) y se corta el
          // resto de la ráfaga: mejor un aviso suave real que partes sueltas
          // que el cliente nunca recibió.
          logger.warn(`[bot] parte ${i + 1}/${partes.length} no confirmada a ${phoneMasked(phone)}, corto la ráfaga`);
          await enviarFallback(sock, jid, conversationId);
          return;
        }
        insertMessage(conversationId, "assistant", partes[i]);
        logMessage(phone, "assistant", partes[i]); // espejo a Supabase (best-effort)
      }
    }
    // Memoria de largo plazo: guarda el nombre de WhatsApp (si falta) y un
    // resumen de lo último hablado, para reconocer a esta persona si vuelve.
    void rememberConversation(phone, {
      waName: fresh.name,
      resumen: resumenConversacion(history, partes.join("\n")),
    });
    logger.info(`[bot] → (${Date.now() - start}ms) ${partes.length} msg a ${phoneMasked(phone)}: "${partes[0]?.slice(0, 50)}"`);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      `[bot] error procesando mensaje de ${phoneMasked(phone)}`
    );
    // No dejar al lead con "escribiendo…" y silencio si falla el LLM/red/saldo.
    await enviarFallback(sock, jid, conversationId);
  }
}

/**
 * Descarga y transcribe una nota de voz. Devuelve el texto, o null si no se
 * pudo (en cuyo caso ya se ha respondido al lead pidiéndole que escriba).
 */
async function transcribeIncomingAudio(
  sock: WASocket,
  msg: WAMessage,
  jid: string,
  idiomaConocido?: "es" | "en"
): Promise<string | null> {
  // Audios desactivados desde Ajustes, o sin transcripción disponible.
  if (getSetting("audio_enabled") === "0" || !transcriptionConfigured()) {
    await sock
      .sendMessage(jid, {
        text: "Perdona, ahora mismo no puedo escuchar notas de voz. ¿Me lo escribes en un mensaje y te ayudo al momento?",
      })
      .catch(() => {});
    return null;
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    )) as Buffer;

    const text = await transcribeAudio(buffer, "ogg", idiomaConocido);
    if (text && text.trim()) return text.trim();
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[bot] error transcribiendo audio"
    );
  }

  await sock
    .sendMessage(jid, {
      text: "No he conseguido entender bien el audio. ¿Me lo escribes en un mensaje, porfa?",
    })
    .catch(() => {});
  return null;
}

/**
 * Descarga y describe una imagen entrante con el modelo de visión. Devuelve la
 * descripción, o null si la visión está apagada, no hay OpenRouter o falla (en
 * ese caso el handler decide el fallback).
 */
async function describeIncomingImage(sock: WASocket, msg: WAMessage): Promise<string | null> {
  if (getSetting("vision_enabled") === "0" || !visionConfigured()) return null;
  try {
    const buffer = (await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    )) as Buffer;
    const mimetype = msg.message?.imageMessage?.mimetype ?? "image/jpeg";
    const caption = msg.message?.imageMessage?.caption ?? undefined;
    return await describeImage(buffer, mimetype, caption);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[bot] error interpretando imagen"
    );
    return null;
  }
}
