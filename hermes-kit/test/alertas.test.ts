// alertas.test.ts — contra el CRM REAL (crm/, PostgreSQL). Cubre el fix
// real de /api/alertas (2026-09-12): el import() dinámico de crm() ya no
// usa una expresión demasiado dinámica para el bundler de Next.js/Turbopack
// (ver alertas.ts, comentario "webpackIgnore"). Estos tests corren vía tsx
// (sin bundler), así que no pueden reproducir el error de Turbopack en sí
// -- eso ya se validó en vivo contra el servidor Next.js real (curl real a
// /hermes/api/alertas, antes y después del fix) -- pero SÍ confirman que
// listHandoffAlerts()/resolveHandoffAlert() siguen funcionando igual tras
// el cambio.
import { test, before } from "node:test";
import assert from "node:assert/strict";

before(async () => {
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
