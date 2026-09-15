// transferenciaSinDerivar.test.ts — "pedir los datos para transferir" NUNCA
// deriva por sí solo (hallazgo real 2026-09-17, caso "Lucero"): el cliente
// pidió los datos de transferencia sin mencionar producto, y el LLM llamó
// a `derivarHumano` en vez de resolverlo con las tools de compra que ya
// existían. Causa real confirmada en `derivar-humano.ts`: la frase de
// ejemplo de `tipo='fuera_de_alcance'` decía literalmente "cuenta/número de
// envío", ambigua con "cuenta para transferir" (bancaria), y la excepción
// de compra+transferencia solo estaba redactada dentro de la rama
// tipo='compra', sin cubrir explícitamente "pedir los datos para
// transferir" como su propio caso.
//
// Regla de negocio (2026-09-17):
// - Pedido activo + pide los datos para transferir -> cerrarVentaTransferencia directo.
// - Sin pedido activo ni producto claro -> preguntar producto, NUNCA derivar.
// - Pedir los datos/la cuenta para transferir NUNCA es, por sí solo, un
//   caso 'fuera_de_alcance' ni motivo de derivar.
//
// Parte A: contenido de las descripciones de las tools reales (mismo estilo
// ya usado en test/tools.test.ts para fixes de instrucciones al LLM).
// Parte B: integrado (TEST_DATABASE_URL) -- prueba el CAMINO MECÁNICO real
// que las descripciones ahora instruyen al LLM a seguir: consultarPedido
// encuentra el pedido activo -> cerrarVentaTransferencia lo usa directo.
// Sin mensajes reales, sin venta real (Payment queda PENDING).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Parte A: contenido real de las descripciones -- sin DB.
// ============================================================

test("derivarHumanoDefinition: pedir los datos/cuenta para transferir NUNCA es motivo de derivar, y ya no colisiona con el ejemplo de fuera_de_alcance", async () => {
  const { derivarHumanoDefinition } = await import("../src/lib/tools/derivar-humano");
  const desc = derivarHumanoDefinition.function.description.toLowerCase();
  assert.match(desc, /nunca es por s[ií] solo motivo para derivar/, "debe existir la regla dura explícita sobre pedir datos de transferencia");
  assert.match(desc, /consultarpedido/, "debe instruir a consultar el pedido activo antes de decidir");
  assert.match(desc, /cerrarventatransferencia/i, "debe instruir a usar cerrarVentaTransferencia si hay pedido activo");
  // El ejemplo de 'fuera_de_alcance' ya no debe usar la palabra ambigua
  // "cuenta" (colisiona con "cuenta bancaria para transferir").
  assert.ok(!desc.includes("cuenta/número de envío") && !desc.includes("cuenta/numero de envio"), "no debe quedar la frase ambigua original");
  assert.match(desc, /gu[ií]a\/rastreo/, "el ejemplo de fuera_de_alcance debe ser sobre paquetería, no sobre datos bancarios");
});

test("consultarPedidoDefinition: instruye explícitamente consultarla cuando el cliente pide los datos para transferir sin pedido creado en el turno", async () => {
  const { consultarPedidoDefinition } = await import("../src/lib/tools/comercio");
  const desc = consultarPedidoDefinition.function.description.toLowerCase();
  assert.match(desc, /transferir/);
  assert.match(desc, /cerrarventatransferencia/i);
});

test("Regresión: derivarHumanoDefinition sigue cubriendo 'no quiero hablar con un bot' (comportamiento previo intacto)", async () => {
  const { derivarHumanoDefinition } = await import("../src/lib/tools/derivar-humano");
  const desc = derivarHumanoDefinition.function.description.toLowerCase();
  assert.match(desc, /no quiero hablar con un bot/);
  assert.match(desc, /p[aá]same con alguien/);
});

// ============================================================
// Parte B: integrado (TEST_DATABASE_URL) -- el camino mecánico real que
// las tools ahora instruyen a seguir cuando hay un pedido activo.
// ============================================================

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("transferenciaSinDerivar.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCTO_ID = "productos/01-control-de-peso/tedivina";
const TEST_PHONE = `52155995${Date.now()}TRANSFDIRECTO`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

async function sembrarProductoControlado(stock: number) {
  const c = await crm();
  await c.productPricing.upsertProductPricing({
    productoId: PRODUCTO_ID,
    precio: 1799,
    cantidadBase: "6 Sobres",
    promociones: [],
  });
  await c.inventory.upsertInventory({ productoId: PRODUCTO_ID, cantidadActual: stock, minimo: 1 });
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("Escenario 1: pedido activo + 'pásame los datos para transferir' -> consultarPedido lo encuentra y cerrarVentaTransferencia lo usa directo (Payment PENDING, sin pedir producto de nuevo)", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}A`;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { consultarPedidoHandler, cerrarVentaTransferenciaHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  // Turno anterior: el cliente ya había creado un pedido (producto conocido).
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1, nombre: "Lucero" });
  assert.equal(pedido.ok, true, pedido.reason);

  // Turno actual: "Lucero, me puedes pasar los datos para transferir?" --
  // sin mencionar producto. El camino que las descripciones ahora
  // instruyen: consultarPedido primero.
  const convo = db.getOrCreateConversation(phone, "Lucero");
  const activo: any = await consultarPedidoHandler({ conversationId: convo.id });
  assert.equal(activo.encontrado, true, "debe encontrar el pedido activo real, sin que el cliente lo repita");
  assert.equal(activo.orderId, pedido.orderId);

  // cerrarVentaTransferencia directo con ese orderId -- nunca se le vuelve
  // a preguntar el producto.
  const cierre: any = await cerrarVentaTransferenciaHandler({ orderId: activo.orderId, conversationId: convo.id });
  assert.equal(cierre.ok, true, cierre.message);
  assert.ok(cierre.paymentId);

  const c = await crm();
  const pago = await c.payments.findById(cierre.paymentId);
  assert.equal(pago.estado, "pendiente", "nunca se auto-confirma");

  const media = db.listOutboxMediaByConversation(convo.id);
  assert.equal(media.length, 1, "la imagen oficial de transferencia debe quedar encolada");
});

test("Escenario 3: 'pásame los datos para transferir' SIN pedido activo ni producto -> no hay nada que resolver de forma autónoma (debe preguntar producto, nunca inventar ni derivar por esto)", async () => {
  const { resolverCompraAutonoma, debeDerivarPorCompraClara, detectarIntencionCompraClara } = await import(
    "../src/lib/vidaDivina/purchaseIntent"
  );
  const { consultarPedidoHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  const phone = `${TEST_PHONE}B`; // cliente nuevo, sin ningún pedido previo
  const texto = "Hola soy Lucero, me puedes pasar los datos para transferir?";

  assert.equal(detectarIntencionCompraClara(texto), false, "no es una frase de compra clara");
  assert.equal(await resolverCompraAutonoma(texto), null, "sin producto, nunca debe inventar uno");
  assert.equal(await debeDerivarPorCompraClara(texto), false, "pedir datos de transferencia nunca fuerza handoff determinista");

  const convo = db.getOrCreateConversation(phone, "Lucero");
  const activo: any = await consultarPedidoHandler({ conversationId: convo.id });
  assert.equal(activo.encontrado, false, "cliente nuevo real: no hay ningún pedido activo que reutilizar");
  // Con esto (sin pedido activo, sin producto), la instrucción real de las
  // tools (ver Parte A) es preguntar qué producto quiere -- nunca derivar.
});
