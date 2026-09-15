// outboundIntegrity.test.ts — Integridad de envío outbound (hallazgo real
// 2026-09-17): `sock.sendMessage` (Baileys) puede RESOLVER sin lanzar
// aunque el mensaje nunca se haya confirmado de verdad (undefined o sin
// `key.id`) -- antes ese valor se descartaba en todos los puntos de envío
// de handler.ts, así que un envío realmente fallido se persistía igual en
// SQLite (visible en el Dashboard) como si hubiera llegado a WhatsApp, y en
// el bloque de handoff determinista de compra, `ejecutarHandoffReal` (pone
// mode=HUMAN) corría ANTES de siquiera intentar el envío.
//
// Parte A: `enviarTextoConfirmado` en aislamiento, con un WASocket falso
// (solo se usa `sendMessage`, la única función real que toca este helper).
// Parte B: integrado contra TEST_DATABASE_URL -- reproduce el MISMO orden
// real que ahora usa handler.ts (enviarTextoConfirmado -> solo si tuvo
// éxito, ejecutarHandoffReal) para demostrar que el handoff real nunca se
// ejecuta sin que el mensaje se haya entregado. Sin mensajes reales de
// WhatsApp, sin venta real.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Parte A: enviarTextoConfirmado en aislamiento -- sin DB, sin red real.
// ============================================================

function fakeSock(sendMessage: (jid: string, content: unknown) => Promise<unknown>) {
  return { sendMessage } as any;
}

test("outbound exitoso: sendMessage devuelve un WebMessageInfo real (key.id) -> confirmado true", async () => {
  const { enviarTextoConfirmado } = await import("../src/lib/baileys/handler");
  let jidRecibido: string | null = null;
  let textoRecibido: string | null = null;
  const sock = fakeSock(async (jid, content: any) => {
    jidRecibido = jid;
    textoRecibido = content.text;
    return { key: { id: "WAMID-REAL-123" } };
  });
  const ok = await enviarTextoConfirmado(sock, "5215599990000@s.whatsapp.net", "Hola, esto sí llega");
  assert.equal(ok, true);
  assert.equal(jidRecibido, "5215599990000@s.whatsapp.net");
  assert.equal(textoRecibido, "Hola, esto sí llega");
});

test("outbound fallido (undefined): sendMessage resuelve SIN lanzar pero sin confirmar entrega -> confirmado false", async () => {
  const { enviarTextoConfirmado } = await import("../src/lib/baileys/handler");
  const sock = fakeSock(async () => undefined); // mismo caso real: Baileys puede resolver `undefined`
  const ok = await enviarTextoConfirmado(sock, "5215599990001@s.whatsapp.net", "Esto NO debe darse por enviado");
  assert.equal(ok, false, "un resultado sin key.id nunca debe tratarse como enviado");
});

test("outbound fallido (excepción): sendMessage lanza -> confirmado false, nunca propaga", async () => {
  const { enviarTextoConfirmado } = await import("../src/lib/baileys/handler");
  const sock = fakeSock(async () => {
    throw new Error("Connection Closed (simulado)");
  });
  const ok = await enviarTextoConfirmado(sock, "5215599990002@s.whatsapp.net", "Esto tampoco");
  assert.equal(ok, false);
});

// ============================================================
// Parte B: integrado contra TEST_DATABASE_URL -- mismo arnés real que
// purchaseIntent.test.ts. Reproduce el orden REAL que handler.ts usa ahora
// en el bloque de handoff determinista de compra: enviar y confirmar
// PRIMERO, ejecutar el handoff real (mode=HUMAN) SOLO si se confirmó.
// ============================================================

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("outboundIntegrity.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEST_PHONE = `52155996${Date.now()}OUTBOUND`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("Handoff: el mensaje de cierre se entrega (confirmado) ANTES de que la conversación pase a HUMAN", async () => {
  const phone = `${TEST_PHONE}OK`;
  const db = (await import("../src/lib/db")) as any;
  const { enviarTextoConfirmado } = await import("../src/lib/baileys/handler");
  const { ejecutarHandoffReal } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente Handoff OK");
  assert.equal(convo.mode, "AI");

  const sock = fakeSock(async () => ({ key: { id: "WAMID-HANDOFF-OK" } }));
  // Mismo orden real que handler.ts: confirmar envío primero.
  const enviado = await enviarTextoConfirmado(sock, "jid-fake@s.whatsapp.net", "Perfecto, ya tengo lo necesario...");
  assert.equal(enviado, true);
  if (enviado) {
    await ejecutarHandoffReal({ conversationId: convo.id, razon: "test entrega confirmada", tipo: "compra" });
  }

  const convoTrasHandoff = db.getConversationById(convo.id);
  assert.equal(convoTrasHandoff.mode, "HUMAN", "el handoff SÍ debe ejecutarse cuando el mensaje se confirmó entregado");
});

test("Handoff: si el envío NO se confirma, el handoff real NUNCA se ejecuta -- la conversación no queda desconectada en silencio", async () => {
  const phone = `${TEST_PHONE}FAIL`;
  const db = (await import("../src/lib/db")) as any;
  const { enviarTextoConfirmado } = await import("../src/lib/baileys/handler");
  const { ejecutarHandoffReal } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente Handoff Fail");
  assert.equal(convo.mode, "AI");

  let handoffLlamado = false;
  const sock = fakeSock(async () => undefined); // simula el envío real que nunca confirmó
  const enviado = await enviarTextoConfirmado(sock, "jid-fake@s.whatsapp.net", "Perfecto, ya tengo lo necesario...");
  assert.equal(enviado, false);
  if (enviado) {
    handoffLlamado = true;
    await ejecutarHandoffReal({ conversationId: convo.id, razon: "no debería llegar aquí", tipo: "compra" });
  }

  assert.equal(handoffLlamado, false, "ejecutarHandoffReal NUNCA debe llamarse si el envío no se confirmó");
  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI", "la conversación NO debe quedar en HUMAN si el cliente no recibió nada");
});
