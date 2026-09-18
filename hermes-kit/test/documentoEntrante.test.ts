// documentoEntrante.test.ts — Fix real (auditoría de persistencia,
// 2026-09-18): un documento/PDF entrante (ej. comprobante de pago) caía en
// el `continue` silencioso de handler.ts ("Sticker, documento, etc. --
// fuera de alcance por ahora") -- se perdía sin dejar ningún rastro, ni
// siquiera un mensaje guardado en la conversación.
//
// Este test usa handleIncomingMessages() real (handler.ts), un WASocket
// falso (solo se usan las funciones que este flujo realmente toca) y la
// base SQLite real de hermes-kit/data/messages.db -- MISMO criterio ya
// usado por outboundIntegrity.test.ts (teléfonos únicos con sufijo de
// Date.now(), sin mockear db.ts). Se fuerza mode="HUMAN" en la conversación
// de prueba ANTES de llamar a handleIncomingMessages: eso hace que el
// código corte justo después de insertMessage() (línea real de handler.ts
// que ahora sí se ejecuta para documentos) y ANTES de scheduleReply(), que
// programaría una llamada real a OpenRouter vía setTimeout -- así el test
// nunca dispara una llamada de LLM real ni deja timers vivos.
//
// NUNCA toca CRM/PostgreSQL, payments, orders, inventory ni confirmarPago/
// markConfirmed -- ningún código de ese camino se importa ni se ejecuta
// aquí. La prueba de que esos caminos no cambiaron es la suite existente
// de crm/test/ y hermes-kit/test/comercio.test.ts, sin modificar.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function fakeSock() {
  return {
    sendMessage: async () => ({ key: { id: "WAMID-FAKE" } }),
    sendPresenceUpdate: async () => {},
    updateMediaMessage: async (m: unknown) => m,
  } as any;
}

/** Mensaje de documento SIN `url` real -- downloadMediaMessage (Baileys) falla
 * rápido con "no es un mensaje de media" (ver messages.js#downloadMsg), sin
 * ningún intento de red. Eso ejerce el manejo real de "no se pudo conservar
 * el archivo" sin depender de credenciales/medios reales de WhatsApp. */
function fakeDocumentMessage(phone: string, fileName: string) {
  const jid = `${phone}@s.whatsapp.net`;
  return {
    key: { remoteJid: jid, fromMe: false, id: `TEST-${Date.now()}` },
    message: {
      documentMessage: {
        fileName,
        mimetype: "application/pdf",
      },
    },
  } as any;
}

function fakeImageMessageWithCaption(phone: string, caption: string) {
  const jid = `${phone}@s.whatsapp.net`;
  return {
    key: { remoteJid: jid, fromMe: false, id: `TEST-${Date.now()}` },
    message: {
      imageMessage: {
        mimetype: "image/jpeg",
        caption,
      },
    },
  } as any;
}

test("guardarBufferDeDocumento: escribe el archivo real en data/media/ con el nombre/extensión correctos (parte pura, sin Baileys)", async () => {
  const { guardarBufferDeDocumento } = await import("../src/lib/baileys/handler");
  const contenido = Buffer.from("contenido de prueba -- no es un PDF real, solo bytes de test");

  const resultado = guardarBufferDeDocumento(contenido, {
    fileName: "comprobante_transferencia.pdf",
    mimetype: "application/pdf",
  });

  assert.ok(resultado, "debe conservar el archivo cuando el buffer y el nombre son válidos");
  assert.equal(resultado!.fileName, "comprobante_transferencia.pdf");

  // Confirma que el archivo físico realmente existe en data/media/ (mismo
  // directorio que ya usan los adjuntos salientes) con el contenido exacto
  // -- y lo limpia después para no dejar basura de test en el volumen real.
  const mediaDir = path.resolve(process.cwd(), "data", "media");
  const archivos = fs.readdirSync(mediaDir).filter((f) => f.endsWith(".pdf"));
  const creadoAhora = archivos
    .map((f) => ({ f, stat: fs.statSync(path.join(mediaDir, f)) }))
    .filter(({ stat }) => Date.now() - stat.mtimeMs < 5000)
    .map(({ f }) => f);
  assert.ok(creadoAhora.length > 0, "debe existir al menos un .pdf recién escrito en data/media/");
  const rutaCreada = path.join(mediaDir, creadoAhora[creadoAhora.length - 1]);
  assert.equal(fs.readFileSync(rutaCreada, "utf8"), contenido.toString("utf8"));
  fs.unlinkSync(rutaCreada);
});

test("guardarBufferDeDocumento: un buffer más grande que el límite no se escribe (mismo límite que media/route.ts)", async () => {
  const { guardarBufferDeDocumento } = await import("../src/lib/baileys/handler");
  const enorme = Buffer.alloc(17 * 1024 * 1024); // > 16 MB
  const resultado = guardarBufferDeDocumento(enorme, { fileName: "demasiado_grande.pdf", mimetype: "application/pdf" });
  assert.equal(resultado, null);
});

test("A) documento PDF entrante: ya no se descarta silenciosamente -- queda registrado como mensaje real de la conversación", async () => {
  const phone = `52155998${Date.now()}DOCA`;
  const db = (await import("../src/lib/db")) as any;
  const { handleIncomingMessages } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente Comprobante");
  assert.equal(convo.mode, "AI");
  db.setMode(convo.id, "HUMAN"); // corta el flujo justo tras insertMessage, ver cabecera del archivo

  const sock = fakeSock();
  // Sin `url` real: downloadMediaMessage (Baileys) falla al intentar
  // descifrar/descargar -- ejerce el manejo real de "no se pudo conservar
  // el archivo" (guardarBufferDeDocumento arriba prueba el camino de éxito
  // por separado, con un buffer real). Lo importante aquí es que, a
  // diferencia de ANTES de este fix, el mensaje NUNCA desaparece en
  // silencio: sigue insertándose como evidencia de que algo llegó.
  const msg = fakeDocumentMessage(phone, "comprobante_pago.pdf");
  await handleIncomingMessages(sock, { type: "notify", messages: [msg] } as any);

  const mensajes = db.getMessages(convo.id, 5);
  const ultimo = mensajes[mensajes.length - 1];
  assert.ok(ultimo, "el documento debe haber quedado registrado como mensaje -- ya no se descarta en silencio");
  assert.equal(ultimo.role, "user");
  assert.match(ultimo.content, /documento/i);
});

test("B) el documento queda asociado a SU conversación, no a la de otro cliente ni a un registro global", async () => {
  const phoneA = `52155998${Date.now()}DOCB1`;
  const phoneB = `52155998${Date.now()}DOCB2`;
  const db = (await import("../src/lib/db")) as any;
  const { handleIncomingMessages } = await import("../src/lib/baileys/handler");

  const convoA = db.getOrCreateConversation(phoneA, "Cliente A");
  const convoB = db.getOrCreateConversation(phoneB, "Cliente B");
  db.setMode(convoA.id, "HUMAN");
  db.setMode(convoB.id, "HUMAN");

  const antesA = db.getMessages(convoA.id, 10).length;
  const antesB = db.getMessages(convoB.id, 10).length;

  const sock = fakeSock();
  // Solo A recibe el documento -- B nunca escribe a la conversación de B.
  await handleIncomingMessages(sock, {
    type: "notify",
    messages: [fakeDocumentMessage(phoneA, "solo_para_cliente_a.pdf")],
  } as any);

  const despuesA = db.getMessages(convoA.id, 10);
  const despuesB = db.getMessages(convoB.id, 10);

  assert.equal(despuesB.length, antesB, "la conversación de B no debe recibir ningún mensaje nuevo");
  assert.equal(despuesA.length, antesA + 1, "la conversación de A (la que realmente envió el documento) sí debe registrar el mensaje nuevo");
  assert.match(despuesA[despuesA.length - 1].content, /documento/i);
});

test("C) el flujo existente de imágenes con pie de foto sigue intacto (no lo interceptó la nueva rama de documentos)", async () => {
  const phone = `52155998${Date.now()}IMGC`;
  const db = (await import("../src/lib/db")) as any;
  const { handleIncomingMessages } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente Imagen");
  db.setMode(convo.id, "HUMAN");

  const sock = fakeSock();
  const msg = fakeImageMessageWithCaption(phone, "Aquí está mi comprobante");
  await handleIncomingMessages(sock, { type: "notify", messages: [msg] } as any);

  const mensajes = db.getMessages(convo.id, 5);
  const ultimo = mensajes[mensajes.length - 1];
  assert.ok(ultimo, "el mensaje con imagen+caption debe seguir guardándose, igual que antes de este fix");
  assert.equal(ultimo.role, "user");
  // Mismo comportamiento de SIEMPRE (image/route.ts sin url real -> vision
  // falla al descargar -> cae al fallback "caption" ya existente, nunca al
  // "[El cliente ha enviado un documento...]" de la rama nueva).
  assert.equal(ultimo.content, "Aquí está mi comprobante");
  assert.doesNotMatch(ultimo.content, /documento/i);
});
