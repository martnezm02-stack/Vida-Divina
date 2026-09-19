// crmClient.test.ts — contra el CRM REAL (crm/, PostgreSQL), nunca un mock,
// pero contra TEST_DATABASE_URL, NUNCA contra la base de producción.
//
// CORRECCIÓN (Parte 3, fase "Dashboard: limpieza de datos de prueba",
// 2026-09-19): el comentario anterior decía "source:'TEST'... para no
// mezclarse jamás con datos reales" -- eso era una idea equivocada real:
// source:'TEST' es solo una ETIQUETA dentro de la misma base, nunca
// aislamiento de base de datos. Sin la línea de abajo, env-loader.ts carga
// el DATABASE_URL real de crm/.env tal cual, y este archivo escribía
// customers/conversations/handoffs reales en la base de PRODUCCIÓN cada
// vez que corría "npm test" -- confirmado por inspección directa de la
// base real (teléfonos con sufijo HERMESTEST). Mismo mecanismo ya usado
// correctamente por comercio.test.ts/securityAuthorization.test.ts.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  if (!match) throw new Error("crmClient.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

// El CRM es real y persistente entre ejecuciones (no se resetea entre runs
// de test) -- un teléfono fijo haría que la 2ª ejecución encontrara la
// oportunidad de la 1ª y el test de "sin producto" dejara de ser válido.
// Un teléfono único por ejecución mantiene los tests repetibles de verdad.
const TEST_PHONE = `52155999${Date.now()}HERMESTEST`;

test("crmClient real: find-or-create de contexto es idempotente", async () => {
  const { getOrCreateConversationContext, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) {
    console.warn("[skip] DATABASE_URL no configurada en este proceso de test");
    return;
  }
  const ctx1 = await getOrCreateConversationContext(TEST_PHONE, { nombre: "Hermes Test" });
  const ctx2 = await getOrCreateConversationContext(TEST_PHONE);
  assert.equal(ctx1.customerId, ctx2.customerId);
  assert.equal(ctx1.conversationId, ctx2.conversationId);
});

test("crmClient real: saveLead sin producto registra el contacto pero pospone la oportunidad (producto_id es NOT NULL en el schema real)", async () => {
  const { saveLead, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) return;
  const res = await saveLead({ phone: TEST_PHONE, nombre: "Hermes Test", productoId: null, intencionCompra: false });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.opportunityId, undefined);
});

test("crmClient real: saveLead CON un producto real abre la oportunidad", async () => {
  const { saveLead, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { searchKnowledge } = await import("../src/lib/vidaDivina/productKnowledge");
  if (!crmConfigured()) return;
  const [hit] = await searchKnowledge("tongkat", { limit: 1 });
  const res = await saveLead({ phone: TEST_PHONE, nombre: "Hermes Test", productoId: hit.id, intencionCompra: false });
  assert.equal(res.ok, true, res.reason);
  assert.ok(res.opportunityId);
});

test("crmClient real: qualifyLead actualiza el estado real (ya hay oportunidad de la prueba anterior)", async () => {
  const { qualifyLead, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) return;
  const res = await qualifyLead({ phone: TEST_PHONE, temperatura: "Caliente" });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.estado, "PrecioEnviado");
});

test("crmClient real: handoffToHuman registra un handoff real", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) return;
  const res = await handoffToHuman(TEST_PHONE, "prueba automatizada Hermes end-to-end");
  assert.equal(res.ok, true, res.reason);
  assert.ok(res.handoffId);
});

test("crmClient real: handoffToHuman vuelca el historial real al log de mensajes del CRM (FASE handoff comercial, 2026-09-04)", async () => {
  const { handoffToHuman, crmConfigured, getOrCreateConversationContext } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) return;
  const marcador = `mensaje real de prueba ${Date.now()}`;
  const res = await handoffToHuman(TEST_PHONE, "prueba de volcado de historial", {
    mensajes: [{ role: "user", content: marcador, createdAt: Math.floor(Date.now() / 1000) }],
    media: [{ tipo: "video", descripcion: "[media enviada: video] testimonio de prueba" }],
  });
  assert.equal(res.ok, true, res.reason);

  const ctx = await getOrCreateConversationContext(TEST_PHONE);
  // Import directo del namespace real del CRM para leer los mensajes ya
  // escritos -- misma ruta de import que usa crmClient.ts internamente.
  const { REPO_ROOT } = await import("../src/lib/vidaDivina/productKnowledge");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const crm: any = await import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href).catch(() => null);
  if (crm) {
    const mensajes = await crm.messages.listByConversationId(ctx.conversationId, { limit: 50 });
    assert.ok(mensajes.some((m: any) => m.texto === marcador), "el mensaje real debe aparecer en crm.messages");
    assert.ok(mensajes.some((m: any) => m.recursoTipo === "video"), "la media enviada debe quedar registrada con su tipo real");
  }
});
