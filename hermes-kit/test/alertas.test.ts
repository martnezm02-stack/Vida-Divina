// alertas.test.ts — contra el CRM REAL (crm/, PostgreSQL). Cubre el fix
// real de /api/alertas (2026-09-12): el import() dinámico de crm() ya no
// usa una expresión demasiado dinámica para el bundler de Next.js/Turbopack
// (ver alertas.ts, comentario "webpackIgnore"). Estos tests corren vía tsx
// (sin bundler), así que no pueden reproducir el error de Turbopack en sí
// -- eso ya se validó en vivo contra el servidor Next.js real (curl real a
// /hermes/api/alertas, antes y después del fix) -- pero SÍ confirman que
// listHandoffAlerts()/resolveHandoffAlert() siguen funcionando igual tras
// el cambio.
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Telegram real mockeado (mismo criterio que handoffDedup.test.ts, 2026-09-12):
// handoffToHuman() de por sí SÍ envía un aviso real a Telegram -- los tests
// nuevos de este archivo crean handoffs reales de prueba (fake, resueltos
// al final) para probar los metadatos de la alerta, nunca para probar
// Telegram; se mockea para no generar avisos reales de más.
mock.module("../src/lib/telegramClient", {
  namedExports: {
    telegramConfigured: () => true,
    sendTelegramAlert: async () => true,
  },
});

// Aislamiento real contra TEST_DATABASE_URL (Parte 3, fase "Dashboard:
// limpieza de datos de prueba", 2026-09-19) -- hallazgo real: este archivo
// creaba handoffs/customers/opportunities REALES en la base de PRODUCCIÓN
// (env-loader.ts carga DATABASE_URL de crm/.env tal cual si nadie lo
// sobreescribe antes) -- el source:'TEST' de crmClient.ts NO es aislamiento
// de base de datos, solo una etiqueta dentro de la MISMA base. Mismo
// mecanismo ya usado correctamente por comercio.test.ts/securityAuthorization.test.ts.
before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("alertas.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const TEST_PHONE = `52155999${Date.now()}ALERTASFIX`;

test("listHandoffAlerts real: un handoff real nuevo aparece en la lista, con sus datos reales", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) {
    console.warn("[skip] DATABASE_URL no configurada en este proceso de test");
    return;
  }

  const creado = await handoffToHuman(TEST_PHONE, "[persona] prueba real de /api/alertas tras el fix");
  assert.equal(creado.ok, true, creado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  const propia = alertas.find((a) => a.handoffId === creado.handoffId);
  assert.ok(propia, "el handoff recién creado debe aparecer en la lista real");
  assert.equal(propia?.phone, TEST_PHONE);
  assert.match(propia?.motivo ?? "", /prueba real de \/api\/alertas/);

  // Limpieza: no dejar este handoff de prueba pendiente para siempre (evita
  // sumar más ruido a la bandeja real de alertas).
  await resolveHandoffAlert(creado.handoffId!);
});

test("resolveHandoffAlert real: marca resuelto y desaparece de la lista de pendientes", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;

  const phone = `${TEST_PHONE}RESOLVE`;
  const creado = await handoffToHuman(phone, "[persona] prueba real de resolveHandoffAlert tras el fix");
  assert.equal(creado.ok, true, creado.reason);

  const resultado = await resolveHandoffAlert(creado.handoffId!);
  assert.equal(resultado.ok, true, resultado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  assert.ok(!alertas.some((a) => a.handoffId === creado.handoffId), "ya no debe aparecer entre los pendientes");
});

test("resolveHandoffAlert: handoffId inexistente -> ok:false honesto, nunca lanza", async () => {
  const { crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;
  const res = await resolveHandoffAlert("00000000-0000-0000-0000-000000000000");
  assert.equal(res.ok, false);
});

// ============================================================
// Metadatos del HANDOFF ACTUAL (2026-09-12, hallazgo real: una alerta real
// de "[compra] Cliente confirma intención de compra: 'Quiero comprar las
// cápsulas Venus, por favor.'" mostraba Producto=Té Divina, Necesidad=
// estreñimiento (de OTRA conversación anterior) e Intención de compra=no --
// contradiciendo el propio handoff). Regla: HANDOFF ACTUAL > histórico.
// ============================================================

test("Handoff de compra de Venus: producto=Cápsulas Venus (del propio mensaje citado), intención=sí, necesidad NO heredada de otro registro", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;

  const phone = `${TEST_PHONE}VENUS`;
  const motivo = `[compra] Cliente confirma intención de compra: "Quiero comprar las cápsulas Venus, por favor."`;
  const creado = await handoffToHuman(phone, motivo);
  assert.equal(creado.ok, true, creado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  const propia = alertas.find((a) => a.handoffId === creado.handoffId);
  assert.ok(propia, "debe aparecer en la bandeja real");
  assert.equal(propia?.producto, "Cápsulas Venus");
  assert.equal(propia?.intencionCompra, true);
  assert.equal(propia?.necesidad, null, "sin 'Necesidad:' explícita en el motivo actual, nunca se hereda una de otro registro");

  await resolveHandoffAlert(creado.handoffId!);
});

test("Handoff de compra de Ripped: producto=Cápsulas Ripped, intención=sí", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;

  const phone = `${TEST_PHONE}RIPPED`;
  const motivo = `[compra] Cliente confirma intención de compra: "quiero comprar las capsulas ripped"`;
  const creado = await handoffToHuman(phone, motivo);
  assert.equal(creado.ok, true, creado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  const propia = alertas.find((a) => a.handoffId === creado.handoffId);
  assert.ok(propia);
  assert.equal(propia?.producto, "Cápsulas Ripped");
  assert.equal(propia?.intencionCompra, true);

  await resolveHandoffAlert(creado.handoffId!);
});

test("Handoff real SIN producto explícito ni derivable: producto=null, nunca inventado usando historial", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;

  const phone = `${TEST_PHONE}SINPRODUCTO`;
  const motivo = `[persona] El lead solicita explícitamente hablar con una persona`;
  const creado = await handoffToHuman(phone, motivo);
  assert.equal(creado.ok, true, creado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  const propia = alertas.find((a) => a.handoffId === creado.handoffId);
  assert.ok(propia);
  assert.equal(propia?.producto, null);
  assert.equal(propia?.necesidad, null);
  assert.equal(propia?.intencionCompra, null, "tipo no es 'compra' -> nunca se afirma 'no' sin evidencia real del propio handoff");

  await resolveHandoffAlert(creado.handoffId!);
});

test("Cliente con historial de OTRO producto + nuevo handoff de producto distinto -> la alerta usa el producto del handoff ACTUAL, nunca el histórico", async () => {
  const { handoffToHuman, saveLead, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { listHandoffAlerts, resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;

  const phone = `${TEST_PHONE}HISTORIAL`;
  // Historial real: oportunidad previa sobre Té Divina / estreñimiento --
  // mismo mecanismo real que usaría la tool guardarLead en una conversación
  // anterior de este mismo cliente.
  const lead = await saveLead({
    phone,
    productoId: "productos/01-control-de-peso/tedivina",
    necesidadId: "estreñimiento",
    intencionCompra: false,
  });
  assert.equal(lead.ok, true, lead.reason);

  // Handoff NUEVO y real, de un producto totalmente distinto.
  const motivo = `[compra] Cliente confirma intención de compra: "quiero comprar las capsulas ripped"`;
  const creado = await handoffToHuman(phone, motivo);
  assert.equal(creado.ok, true, creado.reason);

  const alertas = await listHandoffAlerts({ limit: 50 });
  const propia = alertas.find((a) => a.handoffId === creado.handoffId);
  assert.ok(propia);
  assert.equal(propia?.producto, "Cápsulas Ripped", "debe usar el producto del handoff actual, no el histórico (Té Divina)");
  assert.notEqual(propia?.necesidad, "estreñimiento", "nunca hereda la necesidad histórica de otra conversación");
  assert.equal(propia?.intencionCompra, true);

  await resolveHandoffAlert(creado.handoffId!);
});
