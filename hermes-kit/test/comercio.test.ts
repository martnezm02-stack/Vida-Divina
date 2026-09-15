// comercio.test.ts — Núcleo Comercial de Hermes Ventas (Fase "Hermes
// Ventas", 2026-09-15), contra TEST_DATABASE_URL (NUNCA la base real: a
// diferencia de crmClient.test.ts, esto crea orders/payments/SALE reales,
// demasiado consecuente para mezclarlo con datos comerciales reales). Sin
// mocks del CRM -- PostgreSQL real, solo que la instancia de test aislada.
//
// No se envía ningún mensaje real a ningún cliente en ningún momento.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lee TEST_DATABASE_URL directo de crm/.env y lo fija como DATABASE_URL
// ANTES de env-loader (que nunca sobreescribe una variable ya presente,
// ver scripts/env-loader.ts) -- mismo mecanismo real que ya usa
// crm/test/commerce.test.js para apuntar la API pública del CRM a la base
// de test en vez de a la real.
before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("comercio.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCTO_ID = "productos/01-control-de-peso/tedivina";
const TEST_PHONE = `52155999${Date.now()}COMERCIO`;
const ADMIN_PHONE = "+522225240044"; // HERMES_ADMIN_PHONE real de .env.local (ver identity.test.ts)
const NO_ADMIN_PHONE = `52155888${Date.now()}NOADMIN`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

/** Siembra product_pricing + inventory REALES y controlados para el
 *  producto de prueba -- mismos valores reales ya confirmados en esta
 *  sesión para Té Vida Divina (6 Sobres=$1,799 default, 2=$899, 18=$4,449),
 *  nunca inventados. Stock deliberadamente bajo (5) para poder probar
 *  también el rechazo por stock insuficiente. */
async function sembrarProductoControlado(stock: number) {
  const c = await crm();
  await c.productPricing.upsertProductPricing({
    productoId: PRODUCTO_ID,
    precio: 1799,
    cantidadBase: "6 Sobres",
    promociones: [
      { cantidad: "2 Sobres", precio: 899 },
      { cantidad: "18 Sobres", precio: 4449 },
    ],
  });
  await c.inventory.upsertInventory({ productoId: PRODUCTO_ID, cantidadActual: stock, minimo: 1 });
}

async function stockActual(): Promise<number> {
  const c = await crm();
  const row = await c.inventory.findByProductoId(PRODUCTO_ID);
  return row.cantidadActual;
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

// ============================================================
// 0) resolución de precio real -- nunca hardcodeada
// ============================================================
test("crearPedido resuelve el precio REAL desde product_pricing (default = 6 Sobres/$1,799, sin hardcodear nada)", async () => {
  await sembrarProductoControlado(5);
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const res = await crearPedido({ phone: `${TEST_PHONE}A`, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.precioUnitario, 1799);
  assert.equal(res.presentacion, "6 Sobres");
});

test("crearPedido resuelve presentaciones alternativas reales (2 sobres=$899, 18 sobres=$4,449)", async () => {
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const res2 = await crearPedido({ phone: `${TEST_PHONE}B`, productoId: PRODUCTO_ID, presentacion: "2 sobres" });
  assert.equal(res2.ok, true, res2.reason);
  assert.equal(res2.precioUnitario, 899);

  const res18 = await crearPedido({ phone: `${TEST_PHONE}C`, productoId: PRODUCTO_ID, presentacion: "18 sobres" });
  assert.equal(res18.ok, true, res18.reason);
  assert.equal(res18.precioUnitario, 4449);
});

test("crearPedido rechaza una presentación real que no existe (nunca inventa un precio)", async () => {
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const res = await crearPedido({ phone: `${TEST_PHONE}D`, productoId: PRODUCTO_ID, presentacion: "100 sobres" });
  assert.equal(res.ok, false);
  assert.ok(res.reason?.includes("no coincide"));
});

// ============================================================
// 1-9) flujo completo: intención -> order -> payment PENDING ->
// HUMAN_HANDOFF -> confirmación autorizada -> confirmarVenta -> SALE ->
// inventory -> segunda confirmación idempotente -> sin doble SALE
// ============================================================
test("flujo completo real: order -> payment -> handoff conserva contexto -> confirmación ADMIN -> SALE -> inventory -> idempotente", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}FLUJO`;
  const { crearPedido, registrarPago, consultarPedidoActivo, handoffToHuman, formatearPedidoParaHandoff } = await import(
    "../src/lib/vidaDivina/crmClient"
  );

  // 1) intención de compra -> 2) creación de order
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 2, nombre: "Cliente Prueba Comercio" });
  assert.equal(pedido.ok, true, pedido.reason);
  assert.equal(pedido.total, 3598); // 2 x 1799
  const orderId = pedido.orderId!;

  const stockAntes = await stockActual();
  assert.equal(stockAntes, 5); // crear la orden NUNCA toca inventario

  // 3) payment PENDING
  const pago = await registrarPago({ orderId, metodo: "transferencia", referencia: null });
  assert.equal(pago.ok, true, pago.reason);
  assert.equal(pago.estado, "pendiente");
  const paymentId = pago.paymentId!;

  assert.equal(await stockActual(), 5); // registrar el pago (aún pendiente) tampoco toca inventario

  // 4) HUMAN_HANDOFF sin perder contexto (Hermes no puede resolver el
  // método de pago / requiere verificación humana de la transferencia)
  const activo = await consultarPedidoActivo(phone);
  assert.ok(activo, "debe existir un pedido activo real para este cliente");
  assert.equal(activo!.orderId, orderId);
  assert.equal(activo!.paymentId, paymentId);

  const handoff = await handoffToHuman(phone, "Verificar transferencia Banorte real antes de confirmar la venta.", {});
  // El propio handoffToHuman no recibe el bloque comercial (eso lo arma
  // ejecutarHandoffReal en derivar-humano.ts) -- se verifica aquí
  // directamente que consultarPedidoActivo + formatearPedidoParaHandoff
  // (las mismas piezas reales que usa ese archivo) conservan TODO el
  // mínimo exigido.
  assert.equal(handoff.ok, true, handoff.reason);
  const bloqueComercial = formatearPedidoParaHandoff(activo!);
  assert.ok(bloqueComercial.includes(orderId), "debe conservar order_id");
  assert.ok(bloqueComercial.includes(paymentId), "debe conservar payment_id");
  assert.ok(bloqueComercial.includes(PRODUCTO_ID), "debe conservar el producto");
  assert.ok(bloqueComercial.includes("x2"), "debe conservar la cantidad");
  assert.ok(bloqueComercial.includes("1,799"), "debe conservar el precio unitario");
  assert.ok(bloqueComercial.includes("3,598"), "debe conservar el total");
  assert.ok(bloqueComercial.includes("pendiente"), "debe conservar el estado actual");

  // El handoff NO crea otra venta ni toca inventario.
  assert.equal(await stockActual(), 5);
  const c = await crm();
  const ordenTrasHandoff = await c.orders.findById(orderId);
  assert.equal(ordenTrasHandoff.estado, "pendiente");

  // 5) confirmación -- rechazada si NO es el admin real (nunca por texto del cliente)
  const { confirmarPagoHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;
  const convoNoAdmin = db.getOrCreateConversation(NO_ADMIN_PHONE, "No Admin");
  const negado = await confirmarPagoHandler({ orderId, paymentId, conversationId: convoNoAdmin.id });
  assert.equal((negado as any).denegado, true);
  assert.equal(await stockActual(), 5); // el intento denegado no descuenta nada

  // 5b) confirmación autorizada (teléfono real del admin, HERMES_ADMIN_PHONE)
  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const confirmado = await confirmarPagoHandler({ orderId, paymentId, conversationId: convoAdmin.id });
  assert.equal((confirmado as any).ok, true, (confirmado as any).message);
  assert.equal((confirmado as any).denegado, false);
  assert.equal((confirmado as any).estado, "confirmado");

  // 6-7-8) SALE -> inventory descontado
  assert.equal(await stockActual(), 3); // 5 - 2

  const movimientosSale = await c.inventoryMovements.listByOrderId(orderId);
  assert.equal(movimientosSale.length, 1);
  assert.equal(movimientosSale[0].tipo, "SALE");
  assert.equal(movimientosSale[0].cantidad, -2);
  assert.equal(movimientosSale[0].orderId, orderId);

  // 9) segunda confirmación -- idempotente, sin doble SALE
  const segundaConfirmacion = await confirmarPagoHandler({ orderId, paymentId, conversationId: convoAdmin.id });
  assert.equal((segundaConfirmacion as any).ok, true);
  assert.equal(await stockActual(), 3); // sigue en 3, NO 1
  const movimientosSaleTrasSegunda = await c.inventoryMovements.listByOrderId(orderId);
  assert.equal(movimientosSaleTrasSegunda.length, 1, "no debe existir un segundo SALE");
});

// ============================================================
// stock insuficiente -> no genera venta
// ============================================================
test("stock insuficiente: confirmarPago rechaza, no confirma la orden ni descuenta inventario", async () => {
  await sembrarProductoControlado(1); // deliberadamente insuficiente para 2 unidades
  const phone = `${TEST_PHONE}STOCK`;
  const { crearPedido, registrarPago } = await import("../src/lib/vidaDivina/crmClient");
  const { confirmarPagoHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 2 });
  assert.equal(pedido.ok, true, pedido.reason);
  const pago = await registrarPago({ orderId: pedido.orderId!, metodo: "mercadopago" });
  assert.equal(pago.ok, true, pago.reason);

  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const resultado = await confirmarPagoHandler({ orderId: pedido.orderId!, paymentId: pago.paymentId!, conversationId: convoAdmin.id });
  assert.equal((resultado as any).ok, false);

  const c = await crm();
  const orden = await c.orders.findById(pedido.orderId);
  assert.equal(orden.estado, "pendiente"); // nunca se confirmó
  assert.equal(await stockActual(), 1); // inventario intacto
  const movimientos = await c.inventoryMovements.listByOrderId(pedido.orderId);
  assert.equal(movimientos.length, 0); // ningún SALE
});

// ============================================================
// pago no confirmado (solo registrado) -> no descuenta inventario
// ============================================================
test("pago registrado pero no confirmado: inventario intacto", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}NOPAGO`;
  const { crearPedido, registrarPago } = await import("../src/lib/vidaDivina/crmClient");
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  await registrarPago({ orderId: pedido.orderId!, metodo: "transferencia" });
  // Nunca se llama a confirmarPago.
  assert.equal(await stockActual(), 5);
});

// ============================================================
// Reglas críticas verificables estáticamente en este mismo archivo
// ============================================================
test("registrarPago nunca confirma un pago solo porque se le pase un importe/referencia (nace pendiente siempre)", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}TEXTO`;
  const { crearPedido, registrarPago } = await import("../src/lib/vidaDivina/crmClient");
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID });
  const pago = await registrarPago({ orderId: pedido.orderId!, metodo: "transferencia", referencia: "el cliente dice que ya pagó" });
  assert.equal(pago.estado, "pendiente"); // el texto de "referencia" nunca confirma nada
});

// ============================================================
// Fase "Primer Cierre de Venta — Transferencia" (2026-09-15)
// ============================================================

const MENSAJE_TRANSFERENCIA_ESPERADO =
  "💳 Claro, puedes realizar tu pago mediante transferencia bancaria.\n\n" +
  "Te comparto los datos de la cuenta en la siguiente imagen:\n" +
  "Al realizar tu transferencia, envíame por favor tu comprobante de pago para confirmar tu pedido. ✨\n\n" +
  "En el concepto de pago, escribe tu nombre para identificarlo con mayor facilidad. 📦";

test("IMAGE_ASSET: el activo oficial real existe en disco tal cual (sin recrearlo)", async () => {
  const rutaOficial = path.join(REPO_ROOT, "assets", "payments", "transferencia-banorte-vida-divina.png");
  assert.ok(fs.existsSync(rutaOficial), `debe existir el archivo real: ${rutaOficial}`);
  const buf = fs.readFileSync(rutaOficial);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "debe ser un PNG real (firma de archivo)");
});

test("cerrarVentaTransferencia: registra Payment PENDING, encola la imagen oficial real y devuelve el mensaje EXACTO autorizado", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}TRANSFER`;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { cerrarVentaTransferenciaHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const convo = db.getOrCreateConversation(phone, "Cliente Transferencia");
  const res: any = await cerrarVentaTransferenciaHandler({ orderId: pedido.orderId!, conversationId: convo.id });

  assert.equal(res.ok, true, res.message);
  assert.ok(res.paymentId);
  // MENSAJE correcto: EXACTO, sin recortar ni parafrasear.
  assert.equal(res.mensajeAutorizado, MENSAJE_TRANSFERENCIA_ESPERADO);

  // PAYMENT_PENDING real.
  const c = await crm();
  const pago = await c.payments.findById(res.paymentId);
  assert.equal(pago.estado, "pendiente");
  assert.ok(String(pago.metodo).toLowerCase().includes("transferencia"));

  // IMAGE_ASSET: la imagen real quedó encolada para ESTA conversación, con
  // la ruta real al archivo oficial (nunca una recreada/regenerada).
  const media = db.listOutboxMediaByConversation(convo.id);
  assert.equal(media.length, 1);
  assert.equal(media[0].type, "image");
  assert.equal(
    path.resolve(media[0].media_path),
    path.resolve(REPO_ROOT, "assets", "payments", "transferencia-banorte-vida-divina.png")
  );

  // No se generó ninguna venta real todavía.
  assert.equal(await stockActual(), 5);

  // Llamarla de nuevo (ej. el cliente vuelve a pedir los datos) reutiliza
  // el MISMO Payment -- nunca duplica.
  const res2: any = await cerrarVentaTransferenciaHandler({ orderId: pedido.orderId!, conversationId: convo.id });
  assert.equal(res2.ok, true);
  assert.equal(res2.paymentId, res.paymentId);
  assert.equal(res2.reused, true);
  const pagosDelPedido = await c.payments.findByOrderId(pedido.orderId);
  assert.equal(pagosDelPedido.length, 1, "no debe duplicarse el Payment");
});

test("Flujo completo con transferencia: comprobante recibido sigue PENDING -> handoff conserva contexto -> confirmación admin -> SALE -> inventory -> idempotente", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}FULLTRANSFER`;
  const { crearPedido, consultarPedidoActivo, handoffToHuman, formatearPedidoParaHandoff } = await import("../src/lib/vidaDivina/crmClient");
  const { cerrarVentaTransferenciaHandler, confirmarPagoHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  const convo = db.getOrCreateConversation(phone, "Cliente Full Transfer");
  const cierre: any = await cerrarVentaTransferenciaHandler({ orderId: pedido.orderId!, conversationId: convo.id });
  assert.equal(cierre.ok, true);
  const { paymentId } = cierre;

  // "Comprobante recibido" -- en este sistema eso es solo texto del
  // cliente; ningún camino de código lo confirma. Sigue PENDING.
  const c = await crm();
  let pago = await c.payments.findById(paymentId);
  assert.equal(pago.estado, "pendiente");

  // HUMAN_HANDOFF conserva el contexto comercial completo (método
  // transferencia incluido).
  const activo = await consultarPedidoActivo(phone);
  assert.ok(activo);
  const handoff = await handoffToHuman(phone, "Cliente envió comprobante, requiere verificación humana.", {});
  assert.equal(handoff.ok, true, handoff.reason);
  const bloque = formatearPedidoParaHandoff(activo!);
  assert.ok(bloque.includes(pedido.orderId!));
  assert.ok(bloque.includes(paymentId));
  assert.ok(bloque.includes("transferencia"));
  assert.ok(bloque.includes("pendiente"));

  // Confirmación administrativa -> flujo comercial YA existente (sin
  // segundo camino): confirmarPago -> crm.confirmarVenta -> SALE -> inventory.
  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const confirmado: any = await confirmarPagoHandler({ orderId: pedido.orderId!, paymentId, conversationId: convoAdmin.id });
  assert.equal(confirmado.ok, true, confirmado.message);
  assert.equal(confirmado.estado, "confirmado");
  assert.equal(await stockActual(), 4); // 5 - 1

  const movimientos = await c.inventoryMovements.listByOrderId(pedido.orderId);
  assert.equal(movimientos.length, 1);
  assert.equal(movimientos[0].tipo, "SALE");

  // Doble confirmación -- idempotente, sin doble SALE.
  const segunda: any = await confirmarPagoHandler({ orderId: pedido.orderId!, paymentId, conversationId: convoAdmin.id });
  assert.equal(segunda.ok, true);
  assert.equal(await stockActual(), 4);
  const movimientosTrasSegunda = await c.inventoryMovements.listByOrderId(pedido.orderId);
  assert.equal(movimientosTrasSegunda.length, 1, "no debe existir un segundo SALE");
});

test("cerrarVentaTransferencia rechaza honestamente si el activo real no está en disco (nunca inventa/recrea uno)", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}NOASSET`;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { cerrarVentaTransferenciaHandler } = await import("../src/lib/tools/comercio");
  const db = (await import("../src/lib/db")) as any;

  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID });
  const convo = db.getOrCreateConversation(phone, "Cliente Sin Asset");

  // La constante de ruta se resuelve una sola vez al importar el módulo
  // (config leída al arrancar, no reactiva a process.env después) -- para
  // probar honestamente la guarda real sin depender de reimportar el
  // módulo, se mueve el archivo REAL a un lado un instante y se restaura
  // siempre, ocurra lo que ocurra.
  const rutaOficial = path.join(REPO_ROOT, "assets", "payments", "transferencia-banorte-vida-divina.png");
  const rutaTemporal = `${rutaOficial}.bak-test`;
  fs.renameSync(rutaOficial, rutaTemporal);
  try {
    const res: any = await cerrarVentaTransferenciaHandler({ orderId: pedido.orderId!, conversationId: convo.id });
    assert.equal(res.ok, false);
    assert.ok(res.message.includes("no está en disco"));
  } finally {
    fs.renameSync(rutaTemporal, rutaOficial);
  }
  assert.ok(fs.existsSync(rutaOficial), "el archivo real debe quedar restaurado exactamente igual");
});
