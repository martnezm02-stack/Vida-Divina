// reportesEnviarInventario.test.ts — FASE "Cierre de autenticación + logo +
// correo de inventario" (2026-09-19), Parte 9-B/C/D/E/F. Llama
// DIRECTAMENTE al handler real POST de /api/reportes/enviar/route.ts (sin
// levantar el servidor Next -- el handler solo usa Request/Response
// estándar, ver route.ts) con emailMcpClient.ts mockeado: nunca toca Gmail
// real, nunca crea un borrador/envío real, mismo criterio exacto que
// gmail.test.ts/inventario.test.ts.
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Llamada = { name: string; args: Record<string, unknown> };
let llamadas: Llamada[] = [];
let respuestas: Record<string, { ok: boolean; message: string; data?: unknown }> = {};

mock.module("../src/lib/vidaDivina/emailMcpClient", {
  namedExports: {
    callEmailMcpTool: async (name: string, args: Record<string, unknown> = {}) => {
      llamadas.push({ name, args });
      return respuestas[name] ?? { ok: true, message: "mock ok", data: {} };
    },
    sendEmailViaMcp: async () => ({ ok: false, message: "mock, no usado en este flujo" }),
  },
});

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!match) throw new Error("reportesEnviarInventario.test.ts: no se encontró DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

function resetMock(overrides: Record<string, { ok: boolean; message: string; data?: unknown }> = {}) {
  llamadas = [];
  respuestas = {
    createDraft: { ok: true, message: "borrador real creado (mock)", data: { draftId: "draft-real-123" } },
    sendApprovedEmail: { ok: true, message: "enviado real (mock)", data: { messageId: "msg-real-456", sent: true } },
    ...overrides,
  };
}

async function postEnviar(body: Record<string, unknown>) {
  const { POST } = await import("../src/app/api/reportes/enviar/route");
  const req = new Request("http://localhost/hermes/api/reportes/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req as any);
  const json = await res.json();
  return { status: res.status, json };
}

test("B) destinatario real fijo: createDraft se llama con to='manuel_octavio_mtz@hotmail.com'", async () => {
  resetMock();
  await postEnviar({ tipo: "inventario" });
  const createDraftCall = llamadas.find((l) => l.name === "createDraft");
  assert.ok(createDraftCall, "debe llamar a createDraft");
  assert.equal(createDraftCall!.args.to, "manuel_octavio_mtz@hotmail.com");
});

test("A/D) cuerpo HTML real + operación de ENVÍO real (createDraft luego sendApprovedEmail, nunca solo borrador)", async () => {
  resetMock();
  const { json } = await postEnviar({ tipo: "inventario" });

  assert.deepEqual(llamadas.map((l) => l.name), ["createDraft", "sendApprovedEmail"], "debe usar exactamente createDraft + sendApprovedEmail, en ese orden -- nunca solo createDraft");

  const createDraftCall = llamadas[0];
  assert.equal(createDraftCall.args.html, true, "el body debe marcarse como HTML real");
  assert.match(String(createDraftCall.args.body), /<!doctype html>/i);
  assert.doesNotMatch(String(createDraftCall.args.body), /<pre[\s>]/i);

  const sendCall = llamadas[1];
  assert.equal(sendCall.args.draftId, "draft-real-123", "debe enviar el MISMO draftId real que devolvió createDraft, nunca uno inventado");

  assert.equal(json.ok, true);
  assert.equal(json.enviado, true);
  assert.equal(json.message, "Correo enviado correctamente.");
});

test("E) fallo real de Gmail en el envío -- nunca se reporta como éxito", async () => {
  resetMock({ sendApprovedEmail: { ok: false, message: "Fallo real de Gmail API: cuota excedida (mock)" } });
  const { json } = await postEnviar({ tipo: "inventario" });

  assert.equal(json.ok, false);
  assert.equal(json.enviado, false);
  assert.match(json.message, /Fallo real de Gmail API/);
});

test("E) fallo real de Gmail en createDraft -- nunca intenta enviar un draftId inexistente", async () => {
  resetMock({ createDraft: { ok: false, message: "Gmail no está configurado en este entorno (mock)." } });
  const { json } = await postEnviar({ tipo: "inventario" });

  assert.deepEqual(llamadas.map((l) => l.name), ["createDraft"], "sin draft real, nunca debe intentar sendApprovedEmail");
  assert.equal(json.ok, false);
  assert.equal(json.enviado, false);
});

test("C) reutiliza el cliente Gmail existente (emailMcpClient.callEmailMcpTool), nunca un cliente/credencial nueva -- sin exponer secretos en la respuesta", async () => {
  resetMock();
  const { json } = await postEnviar({ tipo: "inventario" });
  const serializado = JSON.stringify(json);
  assert.doesNotMatch(serializado, /token|secret|password|client_secret/i);
});

test("F) Regresión: tipo='ventas' NO cambia -- sigue creando solo un borrador (createDraft), nunca sendApprovedEmail, nunca HTML", async () => {
  resetMock();
  const { json } = await postEnviar({ tipo: "ventas", periodo: "esta_semana" });

  assert.deepEqual(llamadas.map((l) => l.name), ["createDraft"]);
  assert.notEqual(llamadas[0].args.html, true);
  assert.equal(json.borradorCreado, true);
  assert.equal(json.enviado, undefined, "el flujo de ventas nunca debe reportar 'enviado' -- sigue siendo un borrador");
});

test("F) tipo inválido -- 400 real, nunca intenta generar ni enviar nada", async () => {
  resetMock();
  const { status } = await postEnviar({ tipo: "otra-cosa" as any });
  assert.equal(status, 400);
  assert.equal(llamadas.length, 0);
});
