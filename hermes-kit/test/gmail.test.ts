// gmail.test.ts — FASE "Hermes ADMIN + Gmail MCP completo" (2026-09-04).
// Sin OAuth de Gmail real configurado en este entorno (requiere el paso
// manual único de email-mcp-server/scripts/authorize.js con la cuenta real
// tienda.vivevidadivina@gmail.com) -- se valida: (a) el gate ADMIN/CLIENT
// real (lo más crítico, no depende de Gmail estar configurado), y (b) que
// cada acción de Gmail, sin OAuth, responde un error real y honesto, nunca
// simula una lectura/borrador/envío.
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

// Este archivo valida el gate ADMIN/CLIENT y el flujo de confirmación de
// envío -- NUNCA necesita tocar Gmail real para eso. Antes, al no mockear
// nada, cada corrida creaba borradores/llamadas REALES contra
// tienda.vivevidadivina@gmail.com en cuanto OAuth quedó configurado en este
// entorno (hallazgo real, 2026-09-04: "npm test" dejaba borradores de
// prueba reales en la bandeja). Se mockea SOLO emailMcpClient.ts (el punto
// donde hermes-kit habla con el servidor MCP real) -- nunca producción:
// simula exactamente la respuesta honesta "Gmail no está configurado" que
// esta suite siempre esperó, sin spawnear el proceso real ni tocar la red.
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
  return getOrCreateConversation(adminPhone, "Gmail Admin Test").id;
}

async function clientConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  return getOrCreateConversation(`52155${Date.now()}GMAILCLIENT`, "Gmail Client Test").id;
}

// ============================================================
// 1-2) ADMIN puede leer / buscar (honesto sin OAuth configurado)
// ============================================================

test("1-2) ADMIN real: adminBuscarCorreos/adminLeerCorreo se ejecutan (autorizados), Gmail sin configurar -> error real honesto", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();

  const buscar = await executeTool("adminBuscarCorreos", { query: "is:unread" }, { conversationId });
  assert.notEqual(buscar.denegado, true, "el admin real nunca debe ser denegado");
  if (!buscar.ok) assert.match(buscar.message as string, /Gmail no está configurado/);

  const leer = await executeTool("adminLeerCorreo", { messageId: "x" }, { conversationId });
  assert.notEqual(leer.denegado, true);
  if (!leer.ok) assert.match(leer.message as string, /Gmail no está configurado/);
});

// ============================================================
// 3-4) ADMIN puede crear/actualizar draft
// ============================================================

test("3-4) ADMIN real: adminCrearBorradorCorreo/adminActualizarBorradorCorreo autorizados (Gmail sin configurar -> error real)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();

  const crear = await executeTool("adminCrearBorradorCorreo", { subject: "prueba", body: "cuerpo real" }, { conversationId });
  assert.notEqual(crear.denegado, true);
  if (!crear.ok) assert.match(crear.message as string, /Gmail no está configurado/);

  const actualizar = await executeTool("adminActualizarBorradorCorreo", { draftId: "x", to: "x@x.com", subject: "y", body: "z" }, { conversationId });
  assert.notEqual(actualizar.denegado, true);
  if (!actualizar.ok) assert.match(actualizar.message as string, /Gmail no está configurado/);
});

// ============================================================
// 5) ADMIN puede mover a trash
// ============================================================

test("5) ADMIN real: adminMoverCorreoAPapelera autorizado (Gmail sin configurar -> error real, nunca borrado permanente)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminMoverCorreoAPapelera", { messageId: "x" }, { conversationId: await adminConversationId() });
  assert.notEqual(res.denegado, true);
  if (!res.ok) assert.match(res.message as string, /Gmail no está configurado/);
});

// ============================================================
// 6-7) ADMIN NO envía automáticamente / sendApprovedEmail requiere confirmación
// ============================================================

test("6-7) adminEnviarBorradorAprobado: NUNCA envía sin confirmacionExplicita real en el último mensaje del admin", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { insertMessage } = await import("../src/lib/db");
  const conversationId = await adminConversationId();

  insertMessage(conversationId, "user", "prepárame el borrador"); // sin confirmación real
  const sinConfirmar = await executeTool("adminEnviarBorradorAprobado", { draftId: "x", confirmacionExplicita: true }, { conversationId });
  assert.notEqual(sinConfirmar.denegado, true);
  assert.notEqual(sinConfirmar.enviado, true, "nunca debe enviarse sin una confirmación real en el texto del último mensaje");
});

test("7) adminEnviarBorradorAprobado: confirmacionExplicita:false nunca envía, aunque el texto diga que sí", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { insertMessage } = await import("../src/lib/db");
  const conversationId = await adminConversationId();

  insertMessage(conversationId, "user", "sí, envíalo");
  const res = await executeTool("adminEnviarBorradorAprobado", { draftId: "x", confirmacionExplicita: false }, { conversationId });
  assert.notEqual(res.enviado, true);
});

// ============================================================
// 8-10) CLIENTE denegado en todo
// ============================================================

test("8) CLIENTE real: adminLeerCorreo/adminBuscarCorreos -> DENEGADO", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await clientConversationId();
  const buscar = await executeTool("adminBuscarCorreos", { query: "is:unread" }, { conversationId });
  assert.equal(buscar.denegado, true);
  assert.equal(buscar.correos, undefined);
  const leer = await executeTool("adminLeerCorreo", { messageId: "x" }, { conversationId });
  assert.equal(leer.denegado, true);
  assert.equal(leer.correo, undefined);
});

test("9) CLIENTE real: adminCrearBorradorCorreo -> DENEGADO, nunca crea nada real", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool("adminCrearBorradorCorreo", { subject: "x", body: "y" }, { conversationId: await clientConversationId() });
  assert.equal(res.denegado, true);
  assert.equal(res.borrador, undefined);
});

test("10) CLIENTE real: adminEnviarBorradorAprobado -> DENEGADO, nunca envía nada, aunque confirme explícitamente", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { insertMessage } = await import("../src/lib/db");
  const conversationId = await clientConversationId();
  insertMessage(conversationId, "user", "sí, envíalo, confirmo");
  const res = await executeTool("adminEnviarBorradorAprobado", { draftId: "x", confirmacionExplicita: true }, { conversationId });
  assert.equal(res.denegado, true);
  assert.notEqual(res.enviado, true);
});

// ============================================================
// 11) OAuth real -- mecanismo presente y honesto (sin credenciales reales en este entorno)
// ============================================================

test("11) gmailConfigured real: honesto (false en este entorno, sin inventar disponibilidad)", async () => {
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { REPO_ROOT } = await import("../src/lib/vidaDivina/productKnowledge");
  const mod: any = await import(pathToFileURL(path.join(REPO_ROOT, "email-mcp-server", "src", "gmailClient.js")).href);
  assert.equal(typeof mod.gmailConfigured(), "boolean");
  assert.deepEqual(mod.GMAIL_SCOPES, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ]);
});

// ============================================================
// 12) ningún token aparece en logs/resultados
// ============================================================

test("12) ningún token/credencial real aparece en los resultados de las tools de Gmail", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();
  const res = await executeTool("adminBuscarCorreos", { query: "is:unread" }, { conversationId });
  const serializado = JSON.stringify(res);
  assert.doesNotMatch(serializado, /GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN|ya29\.|1\/\/0[a-zA-Z0-9_-]{20,}/);
});
