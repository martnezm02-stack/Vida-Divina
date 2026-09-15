import type { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { getPendingOutbox, markOutboxSent, getConversationById } from "../db";

const logger = pino({ level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info" });

// Mimetype real por extensión para documentos adjuntos desde el panel
// (Modo Humano, botón "Adjuntar" -- ver ConversationPanel.tsx). Solo cubre
// los formatos que ya se aceptan en la subida (route.ts de media) -- nunca
// una lista abierta.
const DOCUMENT_MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
};

let outboxTimer: NodeJS.Timeout | null = null;

// Reclamo en memoria de filas "en proceso" (hallazgo real, 2026-09-05): el
// setInterval de 2s puede lanzar un nuevo ciclo antes de que el anterior
// termine de enviar un archivo real (un vídeo tarda más de 2s en subirse),
// y como la fila solo se marca sent=1 DESPUÉS de que sock.sendMessage
// termine, un ciclo solapado volvía a leerla con sent=0 y la reenviaba --
// el mismo testimonio llegó a enviarse 3 veces de verdad por WhatsApp para
// una sola fila real de la base de datos. Este Set reclama el id ANTES de
// intentar el envío (nunca lo recoge un ciclo solapado mientras sigue
// reclamado) y lo libera SIEMPRE al terminar -- con éxito (ya quedó
// sent=1, liberar es solo higiene) o con fallo (vuelve a estado seguro
// para reintentarse en el siguiente tick, comportamiento ya existente).
const enProceso = new Set<number>();

/**
 * Loop que cada 2s revisa la tabla outbox y manda los mensajes humanos
 * pendientes a través de Baileys.
 *
 * Patrón outbox: bot y Next.js son procesos separados, no comparten memoria.
 * El dashboard escribe en outbox cuando el humano envía un mensaje.
 * El bot lee el outbox y lo envía por WhatsApp.
 */
export function startOutboxLoop(sock: WASocket): void {
  if (outboxTimer) return;

  outboxTimer = setInterval(async () => {
    const pending = getPendingOutbox(20).filter((item) => !enProceso.has(item.id));
    if (pending.length === 0) return;

    for (const item of pending) {
      enProceso.add(item.id);
      // Usar la dirección completa guardada en la conversación (soporta @lid).
      // Fallback al formato clásico para filas antiguas sin jid registrado.
      const convo = getConversationById(item.conversation_id);
      const jid = convo?.jid ?? `${item.phone}@s.whatsapp.net`;
      try {
        if (item.type === "image" && item.media_path) {
          if (!fs.existsSync(item.media_path)) {
            logger.warn(`[bot] outbox #${item.id}: imagen no encontrada, descartada`);
            markOutboxSent(item.id);
            continue;
          }
          await sock.sendMessage(jid, {
            image: fs.readFileSync(item.media_path),
            caption: item.content || undefined,
          });
        } else if (item.type === "audio" && item.media_path) {
          if (!fs.existsSync(item.media_path)) {
            logger.warn(`[bot] outbox #${item.id}: audio no encontrado, descartado`);
            markOutboxSent(item.id);
            continue;
          }
          // Nota de voz real (ptt: true) -- requiere OGG/Opus, ver voiceEngineClient.ts.
          await sock.sendMessage(jid, {
            audio: fs.readFileSync(item.media_path),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          });
        } else if (item.type === "video" && item.media_path) {
          if (!fs.existsSync(item.media_path)) {
            logger.warn(`[bot] outbox #${item.id}: vídeo no encontrado, descartado`);
            markOutboxSent(item.id);
            continue;
          }
          await sock.sendMessage(jid, {
            video: fs.readFileSync(item.media_path),
            caption: item.content || undefined,
          });
        } else if (item.type === "document" && item.media_path) {
          if (!fs.existsSync(item.media_path)) {
            logger.warn(`[bot] outbox #${item.id}: documento no encontrado, descartado`);
            markOutboxSent(item.id);
            continue;
          }
          // fileName real: el propio route.ts de media guarda el nombre
          // original del archivo en `content` (columna de outbox, no la de
          // `messages` -- son independientes). Fallback al nombre en disco
          // solo si llegara vacío (nunca debería, pero nunca sin nombre).
          const fileName = item.content || path.basename(item.media_path);
          const ext = path.extname(item.media_path).slice(1).toLowerCase();
          await sock.sendMessage(jid, {
            document: fs.readFileSync(item.media_path),
            mimetype: DOCUMENT_MIME_BY_EXT[ext] ?? "application/octet-stream",
            fileName,
          });
        } else {
          await sock.sendMessage(jid, { text: item.content });
        }
        markOutboxSent(item.id);
        logger.info(`[bot] → outbox enviado a ${item.phone}: "${item.content.slice(0, 40)}..."`);
      } catch (err) {
        // Dejar sent=0 para reintentar en el siguiente tick.
        // Útil cuando la conexión cae transitoriamente.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          `[bot] outbox #${item.id} falló, reintentando`
        );
      } finally {
        // Libera el reclamo SIEMPRE -- éxito (ya sent=1, no se volverá a
        // recoger) o fallo (vuelve a estado seguro, sent=0, reintentable).
        enProceso.delete(item.id);
      }
    }
  }, 2000);
}

export function stopOutboxLoop(): void {
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
}
