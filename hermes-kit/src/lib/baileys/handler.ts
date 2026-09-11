import type { WASocket, BaileysEventMap, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
  getSetting,
  reconcileLidToPn,
  insertVoiceCall,
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
import { detectarIntencionCompraClara } from "../vidaDivina/purchaseIntent";
import { detectarIntencionPrecio, textoSinRuidoDePrecio } from "../vidaDivina/priceIntent";
import { ejecutarHandoffReal, FRASE_CIERRE_COMPRA_EXACTA } from "../tools/derivar-humano";
import { consultarProductoHandler } from "../tools/consultar-producto";

const logger = pino({ level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info" });

// Aviso suave cuando algo falla (LLM caído, sin saldo, error de tool): mejor
// esto que dejar al lead con "escribiendo…" y silencio para siempre.
const RESPUESTA_FALLBACK = "Perdona, se me cruzó un cable un momento. ¿Me lo repites?";

/** Enmascara el teléfono para los logs (deja solo los últimos 4 dígitos) — PII. */
function phoneMasked(phone: string): string {
  return phone.length > 4 ? "***" + phone.slice(-4) : "***";
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

/** Envía el aviso suave y lo persiste. Best-effort: si ni esto sale, no lanza. */
async function enviarFallback(sock: WASocket, jid: string, conversationId: number): Promise<void> {
  // Cuenta el evento para la alarma del watchdog (picos de mensajes de emergencia).
  registrarFallback(conversationId);
  try {
    const fb = saneaHumano(RESPUESTA_FALLBACK);
    insertMessage(conversationId, "assistant", fb);
    await sock.sendMessage(jid, { text: fb });
  } catch {
    // si ni el fallback se puede enviar, el error original ya quedó en el log
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

    // Texto directo o, si es nota de voz, la transcripción.
    let text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
    const isAudio = Boolean(msg.message?.audioMessage);
    const isImage = Boolean(msg.message?.imageMessage);

    if ((!text || text.trim() === "") && isAudio) {
      text = await transcribeIncomingAudio(sock, msg, remoteJid);
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

    const senderPn = msg.key.senderPn ?? undefined;
    const phone = canonicalPhone(remoteJid, senderPn);
    if (remoteJid.endsWith("@lid")) {
      if (senderPn) {
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
    const ultimoMensajeUsuario = [...history].reverse().find((m) => m.role === "user");
    if (ultimoMensajeUsuario && detectarIntencionCompraClara(ultimoMensajeUsuario.content)) {
      const resultado = await ejecutarHandoffReal({
        conversationId,
        tipo: "compra",
        razon: `Cliente confirma intención de compra: "${ultimoMensajeUsuario.content.slice(0, 200)}"`,
      });
      if (resultado.ok) {
        const fb = saneaHumano(FRASE_CIERRE_COMPRA_EXACTA);
        insertMessage(conversationId, "assistant", fb);
        logMessage(phone, "assistant", fb);
        await sock.sendMessage(jid, { text: fb });
        logger.info(`[bot] → (${Date.now() - start}ms) handoff determinista (compra) a ${phoneMasked(phone)}`);
        return;
      }
      // Si por lo que sea el handoff determinista falló (ej. CRM no
      // configurado), sigue el flujo normal con el LLM -- nunca deja al
      // cliente sin respuesta por esto.
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
        let res = (await consultarProductoHandler({ producto: ultimoMensajeUsuario.content })) as {
          encontrado: boolean;
          titulo?: string;
          precioFormateado?: string | null;
          cantidadBase?: string | null;
        };
        if (!res.encontrado) {
          const textoLimpio = textoSinRuidoDePrecio(ultimoMensajeUsuario.content);
          if (textoLimpio) {
            res = (await consultarProductoHandler({ producto: textoLimpio })) as typeof res;
          }
        }
        if (res.encontrado) {
          memoryContext += `\n\nDATO DE PRECIO YA VERIFICADO para este turno (producto "${res.titulo}"): precio real = ${res.precioFormateado ?? "no hay precio registrado todavía, no inventes uno"}${res.cantidadBase ? `, presentación real = ${res.cantidadBase}` : ""}. Si respondes sobre precio, usa este precioFormateado tal cual, literal, siempre en pesos mexicanos (nunca en dólares, nunca con punto de miles). Si mencionas la presentación y viene como "Contenedor / Detalle" (ej. "Bolsa / 20 sobres individuales"), exprésala como "un/una {contenedor} con {detalle}" (ej. "una bolsa con 20 sobres individuales"), nunca como "presentación de X".`;
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
      insertMessage(conversationId, "assistant", fb);
      await sock.sendMessage(jid, { text: fb });
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
        const voz = await generateVoice(textoParaVoz);
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
        await sock.sendMessage(jid, { text: partes[i] });
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
  jid: string
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

    const text = await transcribeAudio(buffer);
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
