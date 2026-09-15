// compraClaraSinMetodoPago.test.ts — Causa raíz confirmada en producción
// (2026-09-17, conversation_id=469 real): "hola quiero comprar las capsulas
// ripped" -- producto claro, SIN mencionar ningún método de pago -- forzaba
// `debeDerivarPorCompraClara`=true (porque `resolverCompraAutonoma` exige
// la palabra "transfer..." en el MISMO mensaje) y disparaba
// `ejecutarHandoffReal()` de inmediato, sin darle chance al cliente ni
// siquiera a decir cómo iba a pagar. Regla corregida: compra clara sin
// método de pago -> permanece AI, nunca deriva por este camino; solo un
// método de pago NO soportado (OXXO/tarjeta/Mercado Pago/etc.) en el mismo
// mensaje sigue forzando el handoff aquí.
//
// Reproduce el caso real completo: mensaje 1 sin método -> NO HUMAN, mensaje
// 2 (pidiendo cómo pagar) -> flujo de transferencia existente
// (`intentarSolicitudPagoDeterminista`, ya probado en
// solicitudPagoDeterminista.test.ts). Contra TEST_DATABASE_URL (nunca la
// base real). Sin mensajes reales, sin venta real.

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
  if (!match) throw new Error("compraClaraSinMetodoPago.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RIPPED_ID = "productos/07-rendimiento-fisico/ripped-capsules";
const TEST_PHONE = `52155990${Date.now()}SINMETODO`;

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

test("1) 'hola quiero comprar las capsulas ripped' (caso real de producción) -> NO HUMAN, mode permanece AI", async () => {
  const { debeDerivarPorCompraClara } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "hola quiero comprar las capsulas ripped";
  assert.equal(await debeDerivarPorCompraClara(texto), false, "producto claro sin método de pago NUNCA debe forzar el handoff determinista");
});

test("2) Mismo caso real completo: turno 1 sin método (NO HUMAN) -> turno 2 'me puedes pasar los datos para pagar' resuelve por el flujo de transferencia existente", async () => {
  await sembrarRipped();
  const phone = `${TEST_PHONE}FLUJO`;
  const db = (await import("../src/lib/db")) as any;
  const { debeDerivarPorCompraClara } = await import("../src/lib/vidaDivina/purchaseIntent");
  const { intentarSolicitudPagoDeterminista } = await import("../src/lib/baileys/handler");

  const convo = db.getOrCreateConversation(phone, "Cliente Ripped Real");

  // Turno 1: "quiero comprar las capsulas ripped" -- el gate determinista
  // de compra NO debe derivar (regla corregida).
  const texto1 = "hola quiero comprar las capsulas ripped";
  assert.equal(await debeDerivarPorCompraClara(texto1), false);
  db.insertMessage(convo.id, "user", texto1);
  assert.equal(db.getConversationById(convo.id).mode, "AI", "sigue en AI tras el primer mensaje");

  // Turno 2: "me puedes pasar los datos para pagar" -- ahora sí resuelve
  // autónomamente (mismo mecanismo ya probado en solicitudPagoDeterminista.test.ts).
  const texto2 = "me puedes pasar los datos para pagar";
  db.insertMessage(convo.id, "user", texto2);
  const history = db.getRecentHistory(convo.id, 20);
  const { sock, enviados } = fakeSockOk();
  const manejado = await intentarSolicitudPagoDeterminista(sock, "jid-fake@s.whatsapp.net", phone, convo.id, history, texto2);

  assert.equal(manejado, true, "debe resolver el flujo de transferencia autónomamente");
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /transferencia bancaria/i);

  const pedidoReal = await (await import("../src/lib/vidaDivina/crmClient")).consultarPedidoActivo(phone);
  assert.ok(pedidoReal);
  assert.equal(pedidoReal!.items[0]?.productoId, RIPPED_ID);
  assert.equal(pedidoReal!.estadoPago, "pendiente");

  assert.equal(db.getConversationById(convo.id).mode, "AI", "transferencia nunca deriva a HUMAN");
});

test("3) producto + transferencia en el mismo mensaje -> sigue resolviendo autónomo (regresión, sin cambios)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Venus Capsules y pagar por transferencia";
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta);
  assert.equal(resuelta!.productoId, "productos/08-intimidad-libido/venus-capsules");
  assert.equal(await debeDerivarPorCompraClara(texto), false);
});

test("4) producto + OXXO en el mismo mensaje -> sigue forzando HUMAN (único caso real que conserva el handoff determinista)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar las capsulas ripped pero pago con OXXO";
  assert.equal(await resolverCompraAutonoma(texto), null);
  assert.equal(await debeDerivarPorCompraClara(texto), true, "OXXO explícito en el mismo mensaje sigue forzando el handoff");
});
