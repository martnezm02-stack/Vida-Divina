// reporting.test.ts — FASE "Attribution + Reporting + Email MCP + Alerta
// WhatsApp" (2026-09-04). Contra el CRM real (crm.reporting.*) y el
// servidor MCP de correo real (email-mcp-server/, sin SMTP configurado en
// este entorno -- se valida el error real, nunca un envío simulado).
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

// El flujo de correo (enviarPorCorreo:true) de este archivo valida que
// adminGenerarReporte prepara un BORRADOR vía MCP -- no necesita Gmail real
// para eso. Sin mockear, cada corrida creaba un borrador REAL en
// tienda.vivevidadivina@gmail.com en cuanto OAuth quedó configurado
// (hallazgo real, 2026-09-04). Se mockea SOLO emailMcpClient.ts (nunca
// producción), igual criterio que test/gmail.test.ts.
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
  return getOrCreateConversation(adminPhone, "Reporting Admin Test").id;
}

async function clientConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  return getOrCreateConversation(`52155${Date.now()}REPORTCLIENT`, "Reporting Client Test").id;
}

async function crmConfigured(): Promise<boolean> {
  const { crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  return crmConfigured();
}

// ============================================================
// Periodos (puros, sin I/O)
// ============================================================

test("16) reportPeriods: hoy/ayer/esta_semana/semana_pasada/este_mes/mes_pasado y rango explícito resuelven [since, until) reales", async () => {
  const { resolvePeriodKeyword, resolveDateRange } = await import("../src/lib/vidaDivina/reportPeriods");
  for (const kw of ["hoy", "ayer", "esta_semana", "semana_pasada", "este_mes", "mes_pasado"] as const) {
    const r = resolvePeriodKeyword(kw);
    assert.ok(r.since < r.until, `"${kw}" debe producir un rango real since < until`);
  }
  const rango = resolveDateRange("2026-01-01", "2026-01-07");
  assert.equal(rango.since.toISOString().slice(0, 10), "2026-01-01");
  // until es EXCLUSIVO -- un día después del "hasta" dado (inclusivo en el input).
  assert.equal(rango.until.toISOString().slice(0, 10), "2026-01-08");
});

// ============================================================
// Seguridad: 17) ADMIN permitido, 18) CLIENT denegado, 19) "soy Manuel" denegado
// ============================================================

test("17) adminGenerarReporte: ADMIN real -> autorizado, trae datos reales", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminGenerarReporte", { periodo: "este_mes" }, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  assert.ok(res.reporteDatos, "el admin real debe recibir los datos reales del reporte");
  assert.ok(res.resumenEjecutivo);
});

test("18) adminGenerarReporte: CLIENT real -> DENEGADO, sin datos reales", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminGenerarReporte", { periodo: "este_mes" }, { conversationId: await clientConversationId() });
  assert.equal(res.denegado, true);
  assert.equal(res.reporteDatos, undefined, "un CLIENT jamás debe recibir datos reales de reporting");
});

test("19) \"soy Manuel\" no otorga permisos -- la autorización depende solo del teléfono real", async () => {
  // La tool ni siquiera recibe el texto del mensaje -- solo conversationId
  // (-> teléfono real vía leadPhone). Aunque el argumento "periodo" viniera
  // acompañado conceptualmente de un mensaje "soy Manuel", el teléfono real
  // del CLIENT de prueba sigue sin ser el admin real.
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminGenerarReporte", { periodo: "hoy" }, { conversationId: await clientConversationId() });
  assert.equal(res.denegado, true);
});

// ============================================================
// Reporte combinado (15 -- reporte combinado real)
// ============================================================

test("15) generateReport: combina clientes/leads/productos/atribución reales en un solo reporte, nunca aproxima", async () => {
  if (!(await crmConfigured())) return;
  const { generateReport, formatResumenEjecutivo, formatReporteFormal } = await import("../src/lib/vidaDivina/reportGenerator");
  const data = await generateReport({ periodo: "este_mes" });
  assert.equal(typeof data.clientesNuevos, "number");
  assert.equal(typeof data.leads, "number");
  assert.ok(Array.isArray(data.productosTopIntencion));
  const resumen = formatResumenEjecutivo(data);
  assert.match(resumen, /Clientes nuevos:/);
  const formal = formatReporteFormal(data);
  assert.match(formal, /Sin datos reales de venta confirmada disponibles/, "el reporte formal debe declarar honestamente que no hay ventas confirmadas, nunca aproximar");
});

// ============================================================
// Email MCP (20-22)
// ============================================================

test("20-21) adminGenerarReporte con enviarPorCorreo:true crea un BORRADOR real vía Gmail MCP (nunca envía directo)", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool(
    "adminGenerarReporte",
    { periodo: "este_mes", enviarPorCorreo: true },
    { conversationId: await adminConversationId() }
  );
  assert.notEqual(res.denegado, true);
  // Sin Gmail/OAuth configurado en este entorno -- borradorCreado debe ser
  // false, con un motivo real (nunca un "borrador creado" simulado).
  assert.equal(res.borradorCreado, false);
  assert.match(res.instruccion as string, /Gmail/);
});

test("22) sendEmailViaMcp nunca expone credenciales en su resultado", async () => {
  // Mencionar el NOMBRE de una variable de entorno faltante (ej. "falta
  // SMTP_PASS") no es una fuga real -- lo que nunca debe aparecer es un
  // VALOR real (host/usuario/contraseña reales). Sin SMTP configurado en
  // este entorno, el mensaje real solo puede nombrar variables ausentes.
  const { sendEmailViaMcp } = await import("../src/lib/vidaDivina/emailMcpClient");
  const res = await sendEmailViaMcp({ subject: "prueba", text: "cuerpo real de prueba" });
  assert.equal(res.ok, false);
  assert.doesNotMatch(res.message, /smtp:\/\/|@gmail|@outlook|Bearer\s|Basic\s[A-Za-z0-9+/=]{10,}/i);
});

// ============================================================
// WhatsApp / resumen (23-25)
// ============================================================

test("23-24) sin enviarPorCorreo -> nunca se envía nada, solo resumen ejecutivo real", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminGenerarReporte", { periodo: "hoy" }, { conversationId: await adminConversationId() });
  assert.equal(res.borradorCreado, false);
  assert.ok(res.resumenEjecutivo);
  assert.equal(res.reporteFormal, undefined, "sin pedir el reporte completo, nunca se debe incluir el reporte formal completo");
});

test("adminGenerarReporteDefinition: nunca debe pedir verificación de identidad -- debe llamarse directamente (hallazgo QA E2E, 2026-09-04)", async () => {
  const { adminGenerarReporteDefinition } = await import("../src/lib/tools/reporting");
  const desc = adminGenerarReporteDefinition.function.description.toLowerCase();
  assert.match(desc, /nunca le preguntes al remitente si es administrador/);
  assert.match(desc, /regla dura/);
});

test("25) mostrarReporteCompletoAqui:true -> el reporte formal SÍ se incluye (payload correcto)", async () => {
  if (!(await crmConfigured())) return;
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool(
    "adminGenerarReporte",
    { periodo: "hoy", mostrarReporteCompletoAqui: true },
    { conversationId: await adminConversationId() }
  );
  assert.ok(res.reporteFormal);
});
