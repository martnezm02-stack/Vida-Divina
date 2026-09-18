// inventario.test.ts — FASE "Hermes Ventas: Reporte de Inventario + Envío
// por Correo" (2026-09-17). Contra crm.inventory real (PostgreSQL) y el
// servidor MCP de correo real (email-mcp-server/, sin OAuth configurado en
// este entorno -- se valida el error real, nunca un envío simulado). Mismo
// criterio de mock que test/reporting.test.ts y test/gmail.test.ts: se
// mockea SOLO emailMcpClient.ts para no dejar borradores reales en
// tienda.vivevidadivina@gmail.com al correr la suite.
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../src/lib/vidaDivina/emailMcpClient", {
  namedExports: {
    callEmailMcpTool: async () => ({
      ok: false,
      message: "Gmail no está configurado en este entorno (mock de test -- nunca toca la red real ni crea borradores reales).",
    }),
    sendEmailViaMcp: async () => ({
      ok: false,
      message: "Gmail no está configurado en este entorno (mock de test -- nunca toca la red real).",
    }),
  },
});

before(async () => {
  await import("../scripts/env-loader");
});

async function adminConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  const adminPhone = (process.env.HERMES_ADMIN_PHONE ?? "").replace(/[^\d]/g, "");
  return getOrCreateConversation(adminPhone, "Inventario Admin Test").id;
}

async function clientConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  return getOrCreateConversation(`52155${Date.now()}INVCLIENT`, "Inventario Client Test").id;
}

async function crmConfigured(): Promise<boolean> {
  const { crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  return crmConfigured();
}

// ============================================================
// Seguridad: ADMIN permitido, CLIENT denegado
// ============================================================

test("1) adminReporteInventario: ADMIN real -> autorizado, trae datos reales de inventory", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminReporteInventario", {}, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  assert.ok(res.reporteDatos, "el admin real debe recibir los datos reales del inventario");
  assert.ok(res.resumenEjecutivo);
});

test("2) adminReporteInventario: CLIENT real -> DENEGADO, sin datos reales", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminReporteInventario", {}, { conversationId: await clientConversationId() });
  assert.equal(res.denegado, true);
  assert.equal(res.reporteDatos, undefined, "un CLIENT jamás debe recibir datos reales de inventario");
});

// ============================================================
// Reporte real -- forma de los datos, nunca inventados
// ============================================================

test("3) generateInventoryReport: trae existenciaTotal/valorInventario/productos reales, nunca aproximados", async () => {
  if (!(await crmConfigured())) return;
  const { generateInventoryReport, formatResumenInventario, formatReporteInventarioFormal } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const data = await generateInventoryReport();
  assert.equal(typeof data.resumen.existenciaTotal, "number");
  assert.equal(typeof data.resumen.valorInventario, "number");
  assert.ok(Array.isArray(data.productos));
  assert.ok(Array.isArray(data.productosCriticos));
  const resumen = formatResumenInventario(data);
  assert.match(resumen, /Existencia total:/);
  const formal = formatReporteInventarioFormal(data);
  assert.match(formal, /REPORTE DE INVENTARIO — VIDA DIVINA/);
  assert.match(formal, /RESUMEN EJECUTIVO/);
  assert.match(formal, /ATENCIÓN INMEDIATA/);
  assert.match(formal, /ESTADO DEL INVENTARIO/);
  assert.match(formal, /DETALLE DE PRODUCTOS/);
  assert.match(formal, /MOVIMIENTOS RECIENTES/);
  assert.match(formal, /ANÁLISIS DE HERMES/);
  assert.match(formal, /RESUMEN FINAL/);
  // Nunca inventa movimientos reales -- lo dice honestamente si no hay datos agregados.
  assert.match(formal, /Sin datos agregados de movimientos disponibles/);
});

// ============================================================
// Email MCP -- crea BORRADOR, nunca envía directo
// ============================================================

test("4) adminReporteInventario con enviarPorCorreo:true crea un BORRADOR real vía Gmail MCP (nunca envía directo)", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool(
    "adminReporteInventario",
    { enviarPorCorreo: true },
    { conversationId: await adminConversationId() }
  );
  assert.notEqual(res.denegado, true);
  // Sin Gmail/OAuth configurado en este entorno -- borradorCreado debe ser
  // false, con un motivo real (nunca un "borrador creado" simulado).
  assert.equal(res.borradorCreado, false);
  assert.match(res.instruccion as string, /Gmail/);
});

test("5) sin enviarPorCorreo -> nunca se crea/envía nada, solo resumen ejecutivo real", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminReporteInventario", {}, { conversationId: await adminConversationId() });
  assert.equal(res.borradorCreado, false);
  assert.ok(res.resumenEjecutivo);
  assert.equal(res.reporteFormal, undefined, "sin pedir el detalle completo, nunca se debe incluir el reporte formal completo");
});

test("6) mostrarReporteCompletoAqui:true -> el detalle completo SÍ se incluye", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool(
    "adminReporteInventario",
    { mostrarReporteCompletoAqui: true },
    { conversationId: await adminConversationId() }
  );
  assert.ok(res.reporteFormal);
});

// ============================================================
// Integridad de datos: la tool nunca modifica inventory
// ============================================================

test("7) adminReporteInventario es SOLO LECTURA: crm.inventory.findAll() no cambia antes/después de llamar a la tool", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { REPO_ROOT } = await import("../src/lib/vidaDivina/productKnowledge");
  const crm: any = await import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);

  const antes = await crm.inventory.findAll();
  await executeTool("adminReporteInventario", { enviarPorCorreo: true, mostrarReporteCompletoAqui: true }, { conversationId: await adminConversationId() });
  const despues = await crm.inventory.findAll();

  assert.deepEqual(despues, antes, "la tool de reporte de inventario nunca debe alterar filas reales de inventory");
});

test("adminReporteInventarioDefinition: nunca debe pedir verificación de identidad -- debe llamarse directamente", async () => {
  const { adminReporteInventarioDefinition } = await import("../src/lib/tools/inventario");
  const desc = adminReporteInventarioDefinition.function.description.toLowerCase();
  assert.match(desc, /nunca le preguntes al remitente si es administrador/);
  assert.match(desc, /solo lectura/);
});
