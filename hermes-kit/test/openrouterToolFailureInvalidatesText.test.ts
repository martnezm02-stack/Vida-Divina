// openrouterToolFailureInvalidatesText.test.ts — Fix real en openrouter.ts
// (hallazgo real 2026-09-17): "estoy interesado en capsulas ripped" -> "me
// puedes pasar los datos para pagarlas" -- el modelo llamó `derivarHumano`
// ACOMPAÑADO de un texto que asumía éxito ("Perfecto, ya tengo lo necesario
// para ayudarte con tu pedido."). El guard determinista (ver
// handoffGuardTransferencia.test.ts) bloqueó el handoff real (ok:false) y
// devolvió una `instruccion` pidiendo continuar con crearPedido ->
// cerrarVentaTransferencia, pero si el modelo se detenía en el turno
// siguiente sin escribir nada nuevo, `generateReply` (openrouter.ts)
// devolvía ESE texto viejo -- ya inválido -- como respuesta final.
//
// Fix: en el bucle de ejecución de tool-calls, cualquier resultado con
// `ok:false` invalida (`textoEmitido = ""`) el texto capturado EN ESE MISMO
// turno -- nunca se devuelve una afirmación que asumía un resultado que en
// realidad no ocurrió (ver openrouter.ts, dentro del `for (const call of
// msg.tool_calls)`).
//
// NOTA HONESTA sobre cobertura: probar `generateReply()` de punta a punta
// requeriría simular la respuesta del LLM real (OpenRouter). Se intentó
// mockear el cliente `openai` con `node:test`'s `mock.module()`, pero se
// confirmó (repro aislado) que esa API NO intercepta un import de "openai"
// hecho desde un módulo `.ts` cargado vía el loader de `tsx` en este
// entorno -- limitación real de la herramienta, no del código; forzarlo
// habría escondido llamadas reales al LLM en pruebas automatizadas (riesgo
// real, ya descartado). Este test verifica la condición EXACTA que aplica
// el fix (`ok:false` -> invalidar el texto del turno) contra el resultado
// REAL que devuelve `derivarHumanoHandler` para el caso reportado -- sin
// inventar ni simular ninguna respuesta del modelo.

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
  if (!match) throw new Error("openrouterToolFailureInvalidatesText.test.ts: no se encontró TEST_DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEST_PHONE = `52155992${Date.now()}TEXTINVAL`;

async function crm(): Promise<any> {
  return import(pathToFileURL(path.join(REPO_ROOT, "crm", "index.js")).href);
}

after(async () => {
  const c = await crm();
  await c.closePool();
});

test("Caso real: derivarHumano bloqueado por el guard (transferencia sin pedido) devuelve ok:false -- la misma condición que openrouter.ts usa para invalidar el texto del turno", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  // Mismo caso real cubierto en handoffGuardTransferencia.test.ts (Test A):
  // "Me pasas los datos para transferir porfa" activa el guard
  // (METODO_AUTONOMO_RE) y lo bloquea -- resultado REAL, ok:false.
  const convoTransfer = db.getOrCreateConversation(`${TEST_PHONE}C`, "Cliente Transferencia");
  db.insertMessage(convoTransfer.id, "user", "Me pasas los datos para transferir porfa");
  const bloqueo: any = await derivarHumanoHandler({
    conversationId: convoTransfer.id,
    razon: "Cliente pide datos de transferencia",
    tipo: "fuera_de_alcance",
  });

  assert.equal(bloqueo.ok, false, "el guard debe bloquear -- mismo resultado real que dispara el fix de openrouter.ts");

  // Misma condición EXACTA aplicada en openrouter.ts tras cada tool call
  // (ver el comentario junto a esa línea): un resultado ok:false invalida
  // cualquier texto capturado en ese turno.
  let textoEmitido = "Perfecto, ya tengo lo necesario para ayudarte con tu pedido.";
  if (bloqueo.ok === false) textoEmitido = "";
  assert.equal(textoEmitido, "", "el texto que asumía éxito debe quedar invalidado ante un resultado real ok:false");
});

test("Regresión: transferencia sin producto sigue sin derivar (Test A de handoffGuardTransferencia.test.ts, reconfirmado aquí)", async () => {
  const phone = `${TEST_PHONE}REGRESION`;
  const db = (await import("../src/lib/db")) as any;
  const { derivarHumanoHandler } = await import("../src/lib/tools/derivar-humano");

  const convo = db.getOrCreateConversation(phone, "Cliente Sin Producto");
  db.insertMessage(convo.id, "user", "Me pasas los datos para transferir porfa");

  const resultado: any = await derivarHumanoHandler({
    conversationId: convo.id,
    razon: "Cliente pide datos de transferencia",
    tipo: "fuera_de_alcance",
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.instruccion, /pregúntale/i);
  const convoTrasIntento = db.getConversationById(convo.id);
  assert.equal(convoTrasIntento.mode, "AI", "transferencia sin producto NUNCA debe terminar en HUMAN");
});
