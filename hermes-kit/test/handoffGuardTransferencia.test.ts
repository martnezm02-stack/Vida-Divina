// handoffGuardTransferencia.test.ts — Guard determinista PRE-handoff
// (hallazgo real 2026-09-17, segunda ocurrencia confirmada con evidencia
// real en `tool_events`: conversation_id=422, "Me pasas los datos para
// transferir porfa" -> el LLM llamó `derivarHumano` con tipo='fuera_de_alcance'
// pese a que la descripción de la tool ya lo prohibía por escrito). Un
// cambio de wording no bastó dos veces seguidas -- `derivarHumanoHandler`
// ahora bloquea el EFECTO real (mode=HUMAN) cuando el último mensaje del
// cliente es sobre transferencia y no menciona un método no soportado, sin
// importar qué `tipo` haya elegido el modelo.
//
// Contra TEST_DATABASE_URL (NUNCA la base real) -- mismo arnés que
// comercio.test.ts. Sin mensajes reales, sin venta real.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("handoffGuardTransferencia.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCTO_ID = "productos/01-control-de-peso/tedivina";
const TEST_PHONE = `52155994${Date.now()}GUARDTRANSF`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

async function sembrarProductoControlado(stock: number) {
  const c = await crm();
  await c.productPricing.upsertProductPricing({ productoId: PRODUCTO_ID, precio: 1799, cantidadBase: "6 Sobres", promociones: [] });
  await c.inventory.upsertInventory({ productoId: PRODUCTO_ID, cantidadActual: stock, minimo: 1 });
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("A) 'Me pasas los datos para transferir porfa' SIN pedido activo NI producto identificable -> el guard bloquea el handoff, NO HUMAN, instruye preguntar el producto", async () => {
  const phone = `${TEST_PHONE}A`;
  const db = (await import("../src/lib/db")) as any;
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Lucero");
  assert.equal(convo.mode, "AI");
  db.insertMessage(convo.id, "user", "Me pasas los datos para transferir porfa");

  // Mismo tool_call real confirmado en tool_events: tipo='fuera_de_alcance'.
  const resultado: any = await derivarHumanoHandler({
    conversationId: convo.id,
    razon: "Cliente pide datos de transferencia",
    tipo: "fuera_de_alcance",
  });

  assert.equal(resultado.ok, false, "el guard debe bloquear la ejecución real del handoff");
  assert.match(resultado.instruccion, /NO derives/i);
  assert.match(resultado.instruccion, /pregúntale/i);

  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI", "la conversación NUNCA debe quedar en HUMAN por esto");
});

test("B) 'Me puedes pasar los datos para transferir lo de unas cápsulas Ripped, porfi' SIN pedido activo, CON producto claro -> el guard crea el pedido real y redirige a cerrarVentaTransferencia (nunca pregunta el producto de nuevo)", async () => {
  const RIPPED_ID = "productos/07-rendimiento-fisico/ripped-capsules";
  const c = await crm();
  await c.productPricing.upsertProductPricing({ productoId: RIPPED_ID, precio: 999, cantidadBase: "60 Cápsulas", promociones: [] });
  await c.inventory.upsertInventory({ productoId: RIPPED_ID, cantidadActual: 5, minimo: 1 });

  const phone = `${TEST_PHONE}RIPPED`;
  const db = (await import("../src/lib/db")) as any;
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente Ripped");
  db.insertMessage(convo.id, "user", "Me puedes pasar los datos para transferir lo de unas cápsulas Ripped, porfi");

  const resultado: any = await derivarHumanoHandler({
    conversationId: convo.id,
    razon: "Cliente pide datos de transferencia para Ripped",
    tipo: "fuera_de_alcance",
  });

  assert.equal(resultado.ok, false, "no debe derivar: producto identificado + transferencia");
  assert.doesNotMatch(resultado.instruccion, /pregúntale/i, "nunca debe pedirle el producto de nuevo, ya lo dijo");
  assert.match(resultado.instruccion, /cerrarVentaTransferencia/);

  // El pedido real debe haberse creado de verdad para Ripped Capsules.
  const pedidoReal = await (await import("../src/lib/vidaDivina/crmClient")).consultarPedidoActivo(phone);
  assert.ok(pedidoReal, "debe existir un pedido real recién creado");
  assert.equal(pedidoReal!.items[0]?.productoId, RIPPED_ID);
  assert.ok(resultado.instruccion.includes(pedidoReal!.orderId), "el orderId indicado debe ser el del pedido real recién creado");

  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI");
});

test("C) pedido activo + 'Me pasas los datos para transferir porfa' -> el guard bloquea el handoff y redirige a cerrarVentaTransferencia con el orderId real", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}B`;
  const db = (await import("../src/lib/db")) as any;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1, nombre: "Lucero" });
  assert.equal(pedido.ok, true, pedido.reason);

  const convo = db.getOrCreateConversation(phone, "Lucero");
  db.insertMessage(convo.id, "user", "Me pasas los datos para transferir porfa");

  const resultado: any = await derivarHumanoHandler({
    conversationId: convo.id,
    razon: "Cliente pide datos de transferencia",
    tipo: "fuera_de_alcance",
  });

  assert.equal(resultado.ok, false, "no debe derivar: hay pedido activo");
  assert.match(resultado.instruccion, /cerrarVentaTransferencia/);
  assert.ok(resultado.instruccion.includes(pedido.orderId!), "debe indicar el orderId REAL del pedido activo, nunca uno inventado");

  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI");
});

test("D) OXXO -> el guard NO bloquea; el handoff real SÍ ocurre (mode=HUMAN)", async () => {
  const phone = `${TEST_PHONE}C`;
  const db = (await import("../src/lib/db")) as any;
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente OXXO");
  db.insertMessage(convo.id, "user", "Quiero pagar con OXXO, me pasas los datos?");

  const resultado: any = await derivarHumanoHandler({
    conversationId: convo.id,
    razon: "Cliente pide pagar con OXXO, método no soportado",
    tipo: "fuera_de_alcance",
  });

  assert.equal(resultado.ok, true, resultado.message);
  const convoTrasHandoff = db.getConversationById(convo.id);
  assert.equal(convoTrasHandoff.mode, "HUMAN", "OXXO sigue siendo motivo real de HUMAN_HANDOFF");
});

test("E) Venus Capsules + transferencia -> regresión del gate determinista de purchaseIntent (intacto, sin pasar por este guard)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Venus Capsules y pagar por transferencia";
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta);
  assert.equal(resuelta!.productoId, "productos/08-intimidad-libido/venus-capsules");
  assert.equal(await debeDerivarPorCompraClara(texto), false);
});
