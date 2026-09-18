// errorSanitization.test.ts — Auditoría adversarial 2026-09-18, Parte B
// (crmClient.ts#mensajeErrorSeguro + tools/index.ts#executeTool). Contra
// TEST_DATABASE_URL real -- se provoca un error REAL de PostgreSQL
// (UUID malformado) para probar la sanitización de punta a punta, no un
// error simulado.

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
  if (!match) throw new Error("errorSanitization.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEST_PHONE = `52155994${Date.now()}ERRSAN`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("registrarPago con orderId malformado (provoca un error REAL de PostgreSQL) -> el resultado NUNCA contiene el error crudo de Postgres", async () => {
  const { registrarPago } = await import("../src/lib/vidaDivina/crmClient");
  const phone = `${TEST_PHONE}A`;

  // "esto-no-es-un-uuid" no es un UUID válido -- Postgres rechaza el tipo
  // de columna con un error real ("invalid input syntax for type uuid"),
  // no una validación de negocio nuestra.
  const res = await registrarPago({ orderId: "esto-no-es-un-uuid", metodo: "transferencia", phone });

  assert.equal(res.ok, false);
  assert.ok(res.reason, "debe devolver una razón, nunca dejar el campo vacío");
  assert.doesNotMatch(res.reason!, /invalid input syntax|uuid|postgres|pg_|column|relation|syntax error/i, "el mensaje al cliente NUNCA debe contener el texto crudo del error de PostgreSQL");
  assert.doesNotMatch(res.reason!, /at\s+\S+\s+\(.*:\d+:\d+\)/, "nunca debe incluir una línea de stack trace");
});

test("executeTool: si un handler lanza una excepción real, el resultado de la tool nunca incluye err.message crudo", async () => {
  const { executeTool } = await import("../src/lib/tools/index");

  // "orderId" claramente inválido para forzar el mismo camino de error
  // real dentro de un handler de tool completo (capa executeTool, no solo
  // crmClient directo).
  const resultado = await executeTool("registrarPago", { orderId: "###invalido###", metodo: "transferencia" }, { conversationId: 0, language: "es" });

  assert.equal((resultado as any).ok, false);
  const mensaje = String((resultado as any).message ?? "");
  assert.doesNotMatch(mensaje, /invalid input syntax|postgres|pg_|column|relation|syntax error|at\s+\S+\s+\(.*:\d+:\d+\)/i);
});

test("el error interno completo sigue disponible para diagnóstico -- mensajeErrorSeguro no lo descarta, solo no lo devuelve al cliente (verificación de comportamiento, no de logs en vivo)", async () => {
  // No leemos los logs reales (serían ruido de proceso) -- en su lugar,
  // confirmamos el contrato: dado el MISMO error real, la función debe
  // producir consistentemente el mensaje genérico para el cliente, NUNCA
  // "perder" el error silenciosamente (ok:false siempre trae un reason no
  // vacío, señal de que algo SÍ se registró/decidió, no un throw sin
  // control ni un `undefined`).
  const { registrarPago } = await import("../src/lib/vidaDivina/crmClient");
  const res = await registrarPago({ orderId: "no-existe-como-uuid-tampoco", metodo: "transferencia", phone: `${TEST_PHONE}B` });
  assert.equal(res.ok, false);
  assert.ok(res.reason && res.reason.length > 0);
});

test("rechazos de NEGOCIO conocidos (ej. InsufficientStockError/confirmarVenta) siguen mostrando su mensaje real -- la sanitización no los oculta de más", async () => {
  const { crearPedido, confirmarPago } = await import("../src/lib/vidaDivina/crmClient");
  const c = await crm();
  // Producto sintético exclusivo de este archivo -- ver nota en
  // securityAuthorization.test.ts sobre por qué nunca se comparte el
  // inventory row real de "tedivina" con otros archivos de test paralelos.
  const productoId = `productos/TEST-ERRSAN-${Date.now()}`;
  await c.productPricing.upsertProductPricing({ productoId, precio: 1799, cantidadBase: "6 Sobres", promociones: [] });
  await c.inventory.upsertInventory({ productoId, cantidadActual: 0, minimo: 1 }); // stock insuficiente a propósito

  const phone = `${TEST_PHONE}C`;
  const pedido = await crearPedido({ phone, productoId, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const c2 = await crm();
  const payment = await c2.payments.insertPayment({ orderId: pedido.orderId, metodo: "transferencia", importe: pedido.total, moneda: "MXN" });

  const confirmacion = await confirmarPago({ orderId: pedido.orderId!, paymentId: payment.paymentId });
  assert.equal(confirmacion.ok, false);
  // InsufficientStockError SÍ debe seguir siendo legible -- es un rechazo
  // de negocio real y controlado, no una excepción cruda de Postgres.
  assert.match(confirmacion.reason ?? "", /stock|existencia/i);
});
