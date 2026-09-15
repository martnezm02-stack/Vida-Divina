// solicitudPagoDeterminista.test.ts — Flujo de transferencia 100%
// determinista (Fase "Hacer determinista el flujo de transferencia",
// 2026-09-17). Hallazgo real: "me interesan las cápsulas Ripped" -> "me
// puedes dar información para pagar" quedaba enteramente en manos del LLM,
// que en un caso real pidió CORREO ELECTRÓNICO (dato que este negocio no
// usa) y terminó derivando con el mensaje genérico de handoff.
//
// `intentarSolicitudPagoDeterminista` (handler.ts) resuelve esto ANTES de
// llamar al LLM -- reutiliza EXACTAMENTE `consultarPedidoActivo`,
// `resolverCompraAutonoma`, `crearPedido` y `cerrarVentaTransferenciaHandler`
// (ya existentes), nunca un segundo mecanismo de pago. Se prueba con un
// WASocket falso (solo se usa `sendMessage`, igual que
// outboundIntegrity.test.ts) contra TEST_DATABASE_URL -- sin mensajes
// reales de WhatsApp, sin venta real (Payment queda PENDING).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fakeSock(sendMessage: (jid: string, content: unknown) => Promise<unknown>) {
  return { sendMessage } as any;
}
function fakeSockOk() {
  const enviados: string[] = [];
  const sock = fakeSock(async (_jid, content: any) => {
    enviados.push(content.text);
    return { key: { id: `WAMID-${enviados.length}` } };
  });
  return { sock, enviados };
}

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("solicitudPagoDeterminista.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RIPPED_ID = "productos/07-rendimiento-fisico/ripped-capsules";
const TEST_PHONE = `52155991${Date.now()}PAGODET`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

async function sembrarRipped() {
  const c = await crm();
  await c.productPricing.upsertProductPricing({ productoId: RIPPED_ID, precio: 999, cantidadBase: "60 Cápsulas", promociones: [] });
  await c.inventory.upsertInventory({ productoId: RIPPED_ID, cantidadActual: 5, minimo: 1 });
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("1) Ripped mencionado antes + 'me puedes dar información para pagar' -> resuelve producto, crea pedido y envía el mensaje de transferencia -- NUNCA pide correo ni deriva", async () => {
  await sembrarRipped();
  const phone = `${TEST_PHONE}A`;
  const db = (await import("../src/lib/db")) as any;
  const { intentarSolicitudPagoDeterminista } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente Ripped");
  db.insertMessage(convo.id, "user", "me interesan las cápsulas Ripped");
  db.insertMessage(convo.id, "user", "me puedes dar información para pagar");

  const history = db.getRecentHistory(convo.id, 20);
  const { sock, enviados } = fakeSockOk();

  const manejado = await intentarSolicitudPagoDeterminista(sock, "jid-fake@s.whatsapp.net", phone, convo.id, history, "me puedes dar información para pagar");

  assert.equal(manejado, true, "debe resolver el flujo autónomamente, sin depender del LLM");
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /transferencia bancaria/i);
  assert.doesNotMatch(enviados[0].toLowerCase(), /correo|email/, "nunca debe pedir correo electrónico -- eso no existe en este negocio");

  const pedidoReal = await (await import("../src/lib/vidaDivina/crmClient")).consultarPedidoActivo(phone);
  assert.ok(pedidoReal, "debe existir un pedido real creado por el flujo determinista");
  assert.equal(pedidoReal!.items[0]?.productoId, RIPPED_ID);
  assert.ok(pedidoReal!.paymentId, "debe existir un Payment real (encola la imagen Banorte vía outbox)");
  assert.equal(pedidoReal!.estadoPago, "pendiente", "nunca se auto-confirma");

  const media = db.listOutboxMediaByConversation(convo.id);
  assert.equal(media.length, 1, "la imagen oficial Banorte debe quedar encolada en outbox");
  assert.equal(media[0].type, "image");

  const convoTrasFlujo = db.getConversationById(convo.id);
  assert.equal(convoTrasFlujo.mode, "AI", "transferencia nunca deriva a HUMAN");
});

test("2) pedido activo + 'me pasas los datos para transferir' -> usa el pedido existente directamente, nunca crea uno nuevo", async () => {
  await sembrarRipped();
  const phone = `${TEST_PHONE}B`;
  const db = (await import("../src/lib/db")) as any;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { intentarSolicitudPagoDeterminista } = await import("../src/lib/baileys/handler");

  const pedidoPrevio = await crearPedido({ phone, productoId: RIPPED_ID, cantidadUnidades: 1 });
  assert.equal(pedidoPrevio.ok, true, pedidoPrevio.reason);

  const convo = db.getOrCreateConversation(phone, "Cliente Con Pedido");
  db.insertMessage(convo.id, "user", "me pasas los datos para transferir");
  const history = db.getRecentHistory(convo.id, 20);
  const { sock, enviados } = fakeSockOk();

  const manejado = await intentarSolicitudPagoDeterminista(sock, "jid-fake@s.whatsapp.net", phone, convo.id, history, "me pasas los datos para transferir");

  assert.equal(manejado, true);
  assert.equal(enviados.length, 1);

  const c = await crm();
  const pagosDelPedido = await c.payments.findByOrderId(pedidoPrevio.orderId);
  assert.equal(pagosDelPedido.length, 1, "debe reutilizar el pedido activo, nunca crear uno nuevo");

  const convoTrasFlujo = db.getConversationById(convo.id);
  assert.equal(convoTrasFlujo.mode, "AI");
});

test("3) transferencia sin producto ni pedido activo -> no resuelve nada, el LLM debe preguntar el producto (nunca deriva, nunca inventa)", async () => {
  const phone = `${TEST_PHONE}C`;
  const db = (await import("../src/lib/db")) as any;
  const { intentarSolicitudPagoDeterminista } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente Sin Producto");
  db.insertMessage(convo.id, "user", "me puedes dar información para pagar");
  const history = db.getRecentHistory(convo.id, 20);
  const { sock, enviados } = fakeSockOk();

  const manejado = await intentarSolicitudPagoDeterminista(sock, "jid-fake@s.whatsapp.net", phone, convo.id, history, "me puedes dar información para pagar");

  assert.equal(manejado, false, "sin pedido ni producto identificable, debe devolver false y dejar que el LLM pregunte");
  assert.equal(enviados.length, 0, "no debe enviar ningún mensaje por este camino");

  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI");
});

test("4) OXXO -> detectarSolicitudPago no activa este flujo (el camino normal de HUMAN_HANDOFF sigue intacto)", async () => {
  const { detectarSolicitudPago } = await import("../src/lib/vidaDivina/purchaseIntent");
  assert.equal(detectarSolicitudPago("Quiero pagar con OXXO, me pasas los datos?"), false);
  assert.equal(detectarSolicitudPago("Me interesa pagar con tarjeta, cómo le hago?"), false);
  assert.equal(detectarSolicitudPago("Puedo pagar con Mercado Pago?"), false);

  const phone = `${TEST_PHONE}D`;
  const db = (await import("../src/lib/db")) as any;
  const { intentarSolicitudPagoDeterminista } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente OXXO");
  db.insertMessage(convo.id, "user", "Quiero pagar con OXXO, me pasas los datos?");
  const history = db.getRecentHistory(convo.id, 20);
  const { sock, enviados } = fakeSockOk();

  const manejado = await intentarSolicitudPagoDeterminista(sock, "jid-fake@s.whatsapp.net", phone, convo.id, history, "Quiero pagar con OXXO, me pasas los datos?");

  assert.equal(manejado, false, "OXXO debe seguir su camino normal (LLM/derivarHumano), nunca este atajo");
  assert.equal(enviados.length, 0);
});
