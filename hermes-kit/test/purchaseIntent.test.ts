// purchaseIntent.test.ts — Precedencia compra autónoma vs. HUMAN_HANDOFF
// (Fase "Corregir precedencia handoff vs. flujo comercial autónomo",
// 2026-09-15). Decisión de negocio real: una intención de compra clara que
// YA trae producto real + método de pago autónomo soportado (transferencia)
// debe dejar que Hermes continúe solo (crearPedido -> cerrarVentaTransferencia)
// en vez de derivar de inmediato a HUMAN. El handoff se conserva intacto
// para todo lo demás (producto ambiguo, otro método de pago, etc.).
//
// Parte A: funciones puras (detectarIntencionCompraClara/resolverCompraAutonoma/
// debeDerivarPorCompraClara) -- sin base de datos.
// Parte B: integrado contra TEST_DATABASE_URL (NUNCA la base real), mismo
// arnés real que comercio.test.ts -- reproduce la misma condición que usa
// handler.ts para demostrar que la conversación NO cae en mode=HUMAN antes
// de que Hermes pueda procesar el flujo autónomo, y que sí cae en HUMAN
// cuando corresponde (método no soportado). Sin mensajes reales, sin venta
// real fuera de este flujo controlado.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Parte A: funciones puras -- no requieren DATABASE_URL en absoluto
// (resolverCompraAutonoma solo usa el Knowledge Package real vía
// productKnowledge.ts, nunca el CRM).
// ============================================================

test("Escenario 1: 'Quiero comprar Té Vida Divina y pagar por transferencia' -> NO deriva, resuelve TéDivina + transferencia", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma, detectarIntencionCompraClara } = await import(
    "../src/lib/vidaDivina/purchaseIntent"
  );
  const texto = "Quiero comprar Té Vida Divina y pagar por transferencia";
  assert.equal(detectarIntencionCompraClara(texto), true);
  assert.equal(await debeDerivarPorCompraClara(texto), false, "no debe derivar: producto + método autónomo ya resueltos");
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta, "debe resolver producto + método");
  assert.equal(resuelta!.productoId, "productos/01-control-de-peso/tedivina");
  assert.equal(resuelta!.metodoPago, "transferencia");
});

test("Escenario 2 (corregido 2026-09-17): 'Quiero comprar' sola -> no asume producto/método, pero YA NO deriva a HUMAN (producto ambiguo debe aclararse en conversación, nunca desconectar)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma, detectarIntencionCompraClara } = await import(
    "../src/lib/vidaDivina/purchaseIntent"
  );
  const texto = "Quiero comprar";
  assert.equal(detectarIntencionCompraClara(texto), true, "sigue siendo intención de compra clara (comportamiento previo)");
  assert.equal(await resolverCompraAutonoma(texto), null, "no debe inventar ni asumir ningún producto");
  assert.equal(await debeDerivarPorCompraClara(texto), false, "producto ambiguo, sin método no soportado -> ya NO fuerza handoff (regla de negocio corregida)");
});

test("Escenario 3: 'Quiero comprar Té Vida Divina pero pago con OXXO' -> HUMAN_HANDOFF (método no autónomo)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Té Vida Divina pero pago con OXXO";
  assert.equal(await resolverCompraAutonoma(texto), null, "OXXO no es el método autónomo soportado -- nunca resuelve");
  assert.equal(await debeDerivarPorCompraClara(texto), true, "debe derivar: método de pago no soportado autónomamente");
});

test("Corrección real 2026-09-17: verbo 'transferir' -- producto + 'transferencia' -> autónomo (regresión del sustantivo)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Venus Capsules y pagar por transferencia";
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta);
  assert.equal(resuelta!.productoId, "productos/08-intimidad-libido/venus-capsules");
  assert.equal(await debeDerivarPorCompraClara(texto), false);
});

test("Corrección real 2026-09-17: producto + 'transferir' (verbo, no sustantivo) -> autónomo", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Venus Capsules y pagar por transferir";
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta, "'transferir' debe reconocerse como el mismo método autónomo que 'transferencia'");
  assert.equal(resuelta!.productoId, "productos/08-intimidad-libido/venus-capsules");
  assert.equal(resuelta!.metodoPago, "transferencia");
  assert.equal(await debeDerivarPorCompraClara(texto), false);
});

test("Corrección real 2026-09-17: producto + 'voy a transferir'/'transfiero' -> autónomo (formas conjugadas reales)", async () => {
  const { resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const voyATransferir = await resolverCompraAutonoma("Quiero comprar Té Vida Divina, voy a transferir");
  assert.ok(voyATransferir);
  assert.equal(voyATransferir!.productoId, "productos/01-control-de-peso/tedivina");

  // "transfiero" cambia de raíz (transfer- -> transfier-, como "preferir"
  // -> "prefiero") -- caso real explícitamente exigido, antes NO
  // reconocido ni por /transferenc/i ni por /transfer/i a secas.
  const transfiero = await resolverCompraAutonoma("Quiero comprar Venus Capsules, transfiero ahorita");
  assert.ok(transfiero, "'transfiero' debe reconocerse como transferencia autónoma");
  assert.equal(transfiero!.productoId, "productos/08-intimidad-libido/venus-capsules");
});

test("Corrección real 2026-09-17: regresión -- transferencia sin producto sigue sin derivar ni inventar producto", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Me puedes compartir la forma de pago, voy a transferir";
  assert.equal(await resolverCompraAutonoma(texto), null);
  assert.equal(await debeDerivarPorCompraClara(texto), false, "mencionar transferir por sí solo nunca debe derivar");
});

test("Corrección real 2026-09-17: regresión -- OXXO sigue derivando a HUMAN (el ensanche de 'transfer' no lo afecta)", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "Quiero comprar Té Vida Divina pero pago con OXXO";
  assert.equal(await resolverCompraAutonoma(texto), null);
  assert.equal(await debeDerivarPorCompraClara(texto), true);
});

test("Fallo real 2026-09-16 (b): 'Me puedes compartir la forma de pago, voy a pagar por transferencia' -- SIN producto -- no debe derivar ni inventar un producto (nunca 'Youth Capsules')", async () => {
  const { debeDerivarPorCompraClara, resolverCompraAutonoma, detectarIntencionCompraClara } = await import(
    "../src/lib/vidaDivina/purchaseIntent"
  );
  const texto = "Me puedes compartir la forma de pago, voy a pagar por transferencia";
  assert.equal(detectarIntencionCompraClara(texto), false, "no es una frase de compra clara -- solo pregunta por la forma de pago");
  // Bug real confirmado: el fallback FUZZY de searchKnowledge (tolerante a
  // errores de tipeo) "resolvía" esta frase sin producto contra "Youth
  // Capsules" por pura casualidad de distancia de edición -- nunca debe
  // inventar un producto que el cliente no mencionó.
  assert.equal(await resolverCompraAutonoma(texto), null, "no debe inventar NINGÚN producto: el cliente no mencionó ninguno");
  assert.equal(await debeDerivarPorCompraClara(texto), false, "mencionar transferencia por sí sola NUNCA debe derivar a HUMAN");
});

test("Fallo real 2026-09-16: 'quiero hacer un pedido de capsulas venus, pago por transferencia' resuelve Venus + transferencia y genera el refuerzo determinista (nunca instruye derivarHumano)", async () => {
  const { resolverCompraAutonoma, debeDerivarPorCompraClara, detectarIntencionCompraClara, construirRefuerzoCompraAutonoma } = await import(
    "../src/lib/vidaDivina/purchaseIntent"
  );
  const { getProductTitleById } = await import("../src/lib/vidaDivina/productKnowledge");
  const texto = "Hola 👋 buena noche, quiero hacer un pedido de capsulas venus, pago por transferencia porfavor";

  // Esta frase real NUNCA activó detectarIntencionCompraClara (no calza
  // ninguna FRASE_COMPRA_CLARA) -- por eso el refuerzo de abajo debe
  // evaluarse SIEMPRE vía resolverCompraAutonoma, nunca solo cuando este
  // detector da true.
  assert.equal(detectarIntencionCompraClara(texto), false);
  assert.equal(await debeDerivarPorCompraClara(texto), false, "no debe forzar handoff determinista");

  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta, "debe resolver Venus Capsules + transferencia");
  assert.equal(resuelta!.productoId, "productos/08-intimidad-libido/venus-capsules");
  assert.equal(resuelta!.metodoPago, "transferencia");

  const titulo = await getProductTitleById(resuelta!.productoId);
  assert.equal(titulo, "Venus Capsules");
  const refuerzo = construirRefuerzoCompraAutonoma("es", { titulo: titulo! });
  assert.ok(refuerzo.includes("Venus Capsules"));
  assert.ok(refuerzo.includes("crearPedido"));
  assert.ok(refuerzo.includes("cerrarVentaTransferencia"));
  assert.ok(refuerzo.includes("NO llames a derivarHumano"));
});

test("Regresión: negación cerca de la frase de compra sigue sin disparar nada (comportamiento previo intacto)", async () => {
  const { detectarIntencionCompraClara, debeDerivarPorCompraClara } = await import("../src/lib/vidaDivina/purchaseIntent");
  const texto = "no quiero comprar nada todavía";
  assert.equal(detectarIntencionCompraClara(texto), false);
  assert.equal(await debeDerivarPorCompraClara(texto), false);
});

test("Regresión: otros productos reales siguen resolviendo bien con transferencia (el fix de 'Vida Divina' no rompe productos que sí llevan 'Vida' en su título)", async () => {
  const { resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const vidaPure = await resolverCompraAutonoma("Quiero comprar Vida Pure y pagar por transferencia");
  assert.ok(vidaPure);
  assert.equal(vidaPure!.productoId, "productos/09-proteinas-batidos/vida-pure");

  const vidaFuel = await resolverCompraAutonoma("Quiero comprar Vida Fuel y pagar por transferencia");
  assert.ok(vidaFuel);
  assert.equal(vidaFuel!.productoId, "productos/09-proteinas-batidos/vida-fuel");

  const reishi = await resolverCompraAutonoma("Quiero comprar Reishi Capsules y pagar por transferencia");
  assert.ok(reishi);
  assert.equal(reishi!.productoId, "productos/03-longevidad-bienestar/reishi-capsules");
});

test("Edge: método autónomo mencionado pero SIN ningún producto real (ni siquiera genérico) -> nunca inventa un producto", async () => {
  const { resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  assert.equal(await resolverCompraAutonoma("Quiero comprar y pagar por transferencia"), null);
  assert.equal(await resolverCompraAutonoma("Quiero comprar algo y pagar por transferencia"), null);
});

// ============================================================
// Parte B: integrado contra TEST_DATABASE_URL -- mismo arnés real que
// comercio.test.ts. Reproduce la MISMA condición que handler.ts usa
// (if (ultimoMensajeUsuario && (await debeDerivarPorCompraClara(...)))) para
// demostrar honestamente lo que pasaría en el gate real, sin enviar
// mensajes de WhatsApp de verdad y sin tocar la base real.
// ============================================================

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("purchaseIntent.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCTO_ID = "productos/01-control-de-peso/tedivina";
const TEST_PHONE = `52155997${Date.now()}PURCHASEINTENT`;

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

async function stockActual(): Promise<number> {
  const c = await crm();
  const row = await c.inventory.findByProductoId(PRODUCTO_ID);
  return row.cantidadActual;
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("Escenario 4/5 integrado: mensaje autónomo NUNCA deja la conversación en mode=HUMAN, y el flujo completo llega a Payment PENDING sin auto-confirmar y sin SALE", async () => {
  await sembrarProductoControlado(5);
  const phone = `${TEST_PHONE}AUTONOMO`;
  const texto = "Quiero comprar Té Vida Divina y pagar por transferencia";

  const db = (await import("../src/lib/db")) as any;
  const { debeDerivarPorCompraClara, resolverCompraAutonoma } = await import("../src/lib/vidaDivina/purchaseIntent");
  const { ejecutarHandoffReal } = await import("../src/lib/tools/derivar-humano");
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { cerrarVentaTransferenciaHandler } = await import("../src/lib/tools/comercio");

  const convo = db.getOrCreateConversation(phone, "Cliente Autonomo");
  assert.equal(convo.mode, "AI", "una conversación nueva empieza en modo AI");

  // Misma condición REAL que handler.ts evalúa antes de decidir si deriva
  // (ver src/lib/baileys/handler.ts, bloque de intención de compra
  // determinista) -- reproducida aquí explícitamente, sin mocks, para
  // demostrar que con este mensaje NO se entra al bloque de handoff.
  const debeDerivar = await debeDerivarPorCompraClara(texto);
  assert.equal(debeDerivar, false, "producto + transferencia ya resueltos -> no debe derivar");
  if (debeDerivar) {
    await ejecutarHandoffReal({ conversationId: convo.id, razon: "test", tipo: "compra" });
  }

  // La conversación NO debe haber caído en HUMAN por este camino -- Hermes
  // sigue libre para continuar con el flujo comercial autónomo.
  const convoTrasGate = db.getConversationById(convo.id);
  assert.equal(convoTrasGate.mode, "AI", "el gate determinista de compra NUNCA debe poner esta conversación en HUMAN");

  // El resto del flujo autónomo real (lo que Hermes ejecutaría a
  // continuación vía sus tools): crearPedido -> cerrarVentaTransferencia.
  const resuelta = await resolverCompraAutonoma(texto);
  assert.ok(resuelta);
  const pedido = await crearPedido({ phone, productoId: resuelta!.productoId, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const cierre: any = await cerrarVentaTransferenciaHandler({ orderId: pedido.orderId!, conversationId: convo.id });
  assert.equal(cierre.ok, true, cierre.message);
  assert.ok(cierre.paymentId);

  // Payment PENDING real -- nunca auto-confirmado por este flujo.
  const c = await crm();
  const pago = await c.payments.findById(cierre.paymentId);
  assert.equal(pago.estado, "pendiente");

  // Sin SALE, sin tocar inventario -- ningún movimiento generado todavía.
  assert.equal(await stockActual(), 5);
  const movimientos = await c.inventoryMovements.listByOrderId(pedido.orderId);
  assert.equal(movimientos.length, 0, "no debe existir ningún SALE hasta que un ADMIN confirme el pago (fuera de este flujo)");

  // La conversación sigue en AI al final de todo el flujo autónomo.
  const convoFinal = db.getConversationById(convo.id);
  assert.equal(convoFinal.mode, "AI");
});

test("Escenario 3 integrado: mensaje con método NO soportado (OXXO) SÍ dispara HUMAN_HANDOFF real, conservando el contexto comercial", async () => {
  const phone = `${TEST_PHONE}OXXO`;
  const texto = "Quiero comprar Té Vida Divina pero pago con OXXO";

  const db = (await import("../src/lib/db")) as any;
  const { debeDerivarPorCompraClara } = await import("../src/lib/vidaDivina/purchaseIntent");
  const { ejecutarHandoffReal } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente OXXO");
  assert.equal(convo.mode, "AI");

  const debeDerivar = await debeDerivarPorCompraClara(texto);
  assert.equal(debeDerivar, true, "OXXO no es un método autónomo soportado -- debe derivar");
  assert.ok(debeDerivar);
  const resultado = await ejecutarHandoffReal({
    conversationId: convo.id,
    razon: "Cliente pidió pagar con OXXO, método no soportado autónomamente.",
    tipo: "compra",
    producto: "Té Vida Divina",
  });
  assert.equal(resultado.ok, true, resultado.message);

  const convoTrasHandoff = db.getConversationById(convo.id);
  assert.equal(convoTrasHandoff.mode, "HUMAN", "el handoff real SÍ debe poner esta conversación en HUMAN");
});
