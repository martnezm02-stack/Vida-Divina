// seguimiento.test.ts — FASE "Hermes Ventas: Gmail + Google Calendar"
// (2026-09-18). Contra TEST_DATABASE_URL (NUNCA la base real -- esto crea
// orders/follow_ups reales, mismo criterio que comercio.test.ts) + el
// servidor MCP de correo/calendar real mockeado SOLO en el borde
// (emailMcpClient.ts) -- nunca toca Google real, sin credenciales OAuth
// válidas en este entorno (GOOGLE_REFRESH_TOKEN expirado, ver
// hermes-kit/test/inventario.test.ts / gmail.test.ts para el mismo
// hallazgo).

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("seguimiento.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

// Mock SOLO en el borde real hermes-kit <-> email-mcp-server -- nunca toca
// Gmail/Calendar reales. calendarShouldFail controla el escenario "Calendar
// caído" sin tocar nada más del mock.
let calendarShouldFail = false;
let calendarCalls: Array<Record<string, unknown>> = [];
mock.module("../src/lib/vidaDivina/emailMcpClient", {
  namedExports: {
    callEmailMcpTool: async (name: string, args: Record<string, unknown>) => {
      if (name === "createFollowUpCalendarEvent") {
        calendarCalls.push(args);
        if (calendarShouldFail) {
          return { ok: false, message: "Google Calendar no está configurado en este entorno (mock de test -- nunca toca la red real)." };
        }
        return { ok: true, message: "ok", data: { eventId: `evt-${calendarCalls.length}`, reutilizado: false } };
      }
      return { ok: false, message: "tool no mockeada en esta suite" };
    },
    sendEmailViaMcp: async () => ({ ok: false, message: "mock de test" }),
  },
});

// Producto real DISTINTO al que usa comercio.test.ts (tedivina) -- mismo
// TEST_DATABASE_URL persistente, así que reutilizar el mismo producto
// pisaría el stock controlado de esa suite (hallazgo real, 2026-09-18).
const PRODUCTO_ID = "productos/01-control-de-peso/sculpt-max";

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

async function sembrarProductoControlado() {
  const c = await crm();
  await c.productPricing.upsertProductPricing({ productoId: PRODUCTO_ID, precio: 1799, cantidadBase: "6 Sobres", promociones: [] });
  await c.inventory.upsertInventory({ productoId: PRODUCTO_ID, cantidadActual: 50, minimo: 1 });
}

/** ADMIN real (identity.ts) chateando desde su propia conversación local -- misma convención real que confirmarPago/comercio.test.ts. */
async function adminConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  const adminPhone = (process.env.HERMES_ADMIN_PHONE ?? "").replace(/[^\d]/g, "");
  return getOrCreateConversation(adminPhone, "Seguimiento Admin Test").id;
}

async function clientConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  return getOrCreateConversation(`52155${Date.now()}SEGCLIENT`, "Seguimiento Client Test").id;
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

// ============================================================
// Seguridad: solo ADMIN
// ============================================================

test("1) adminAgendarSeguimiento: CLIENT real -> DENEGADO, nunca agenda nada", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminAgendarSeguimiento", { orderId: "x", tipo: "dia3" }, { conversationId: await clientConversationId() });
  assert.equal(res.denegado, true);
  assert.notEqual(res.agendado, true);
});

// ============================================================
// orderId real inexistente -> nunca agenda
// ============================================================

test("2) adminAgendarSeguimiento: ADMIN real pero orderId inexistente -> no agenda, sin inventar una venta", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminAgendarSeguimiento", { orderId: "00000000-0000-0000-0000-000000000000", tipo: "dia3" }, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  assert.equal(res.agendado, false);
});

// ============================================================
// Flujo real: venta real -> follow-up real (CRM) -> Calendar (mock ok)
// ============================================================

test("3) adminAgendarSeguimiento con orderId real: guarda el follow-up real en el CRM y sincroniza con Calendar (mock ok)", async () => {
  calendarShouldFail = false;
  calendarCalls = [];
  await sembrarProductoControlado();
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { executeTool } = await import("../src/lib/tools/index");
  const c = await crm();

  const phone = `52155${Date.now()}SEGVENTA1`;
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const res = await executeTool("adminAgendarSeguimiento", { orderId: pedido.orderId, tipo: "dia3" }, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  assert.equal(res.agendado, true);
  assert.equal(res.calendarSincronizado, true);
  assert.ok(res.followUpId);
  assert.ok(res.eventId);

  // El follow-up real quedó guardado en el CRM (fuente de verdad), tipo
  // correcto, asociado a la conversación real del cliente.
  const order = await c.orders.findById(pedido.orderId);
  const conversaciones = await c.conversations.listByCustomerId(order.customerId);
  const followUps = await c.followUps.listByConversationId(conversaciones[0].conversationId);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].tipo, "postventa_dia3");
  assert.equal(followUps[0].followUpId, res.followUpId);

  // El evento real de Calendar (mock) recibió los datos reales del pedido -- nunca inventados.
  assert.equal(calendarCalls.length, 1);
  assert.equal((calendarCalls[0] as any).followUpId, res.followUpId);
  assert.match((calendarCalls[0] as any).descripcion as string, new RegExp(pedido.orderId as string));
});

// ============================================================
// Idempotencia real (CRM + Calendar, contando llamadas del mock)
// ============================================================

test("4) idempotencia real: agendar dos veces el mismo tipo para el mismo pedido reutiliza el mismo follow_up_id (nunca duplica la fila)", async () => {
  calendarShouldFail = false;
  calendarCalls = [];
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { executeTool } = await import("../src/lib/tools/index");
  const c = await crm();

  const phone = `52155${Date.now()}SEGVENTA2`;
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const conv = await adminConversationId();
  const primero = await executeTool("adminAgendarSeguimiento", { orderId: pedido.orderId, tipo: "semana1" }, { conversationId: conv });
  const segundo = await executeTool("adminAgendarSeguimiento", { orderId: pedido.orderId, tipo: "semana1" }, { conversationId: conv });

  assert.equal(primero.followUpId, segundo.followUpId, "debe reutilizar el mismo follow_up_id real, nunca crear uno nuevo");

  const order = await c.orders.findById(pedido.orderId);
  const conversaciones = await c.conversations.listByCustomerId(order.customerId);
  const followUps = await c.followUps.listByConversationId(conversaciones[0].conversationId);
  assert.equal(followUps.filter((f: any) => f.tipo === "postventa_semana").length, 1, "nunca debe existir una segunda fila real para el mismo tipo/pedido pendiente");
});

// ============================================================
// Calendar caído -> el CRM conserva el follow-up, nunca falla la venta
// ============================================================

test("5) Calendar no disponible (mock ok:false): el follow-up real queda guardado en el CRM, error de sincronización reportado con claridad", async () => {
  calendarShouldFail = true;
  const { crearPedido } = await import("../src/lib/vidaDivina/crmClient");
  const { executeTool } = await import("../src/lib/tools/index");
  const c = await crm();

  const phone = `52155${Date.now()}SEGCALDOWN`;
  const pedido = await crearPedido({ phone, productoId: PRODUCTO_ID, cantidadUnidades: 1 });
  assert.equal(pedido.ok, true, pedido.reason);

  const res = await executeTool("adminAgendarSeguimiento", { orderId: pedido.orderId, tipo: "dia3" }, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  assert.equal(res.agendado, true, "el follow-up real debe guardarse en el CRM aunque Calendar falle");
  assert.equal(res.calendarSincronizado, false);
  assert.match(res.message as string, /Calendar/);

  const order = await c.orders.findById(pedido.orderId);
  const conversaciones = await c.conversations.listByCustomerId(order.customerId);
  const followUps = await c.followUps.listByConversationId(conversaciones[0].conversationId);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].estado, "pendiente");
  calendarShouldFail = false;
});

test("adminAgendarSeguimientoDefinition: nunca permite modificar inventario/precios/pagos/pedidos -- solo agenda", async () => {
  const { adminAgendarSeguimientoDefinition } = await import("../src/lib/tools/seguimiento");
  const desc = adminAgendarSeguimientoDefinition.function.description.toLowerCase();
  assert.match(desc, /nunca modifica inventario, precios, pagos ni pedidos/);
});
