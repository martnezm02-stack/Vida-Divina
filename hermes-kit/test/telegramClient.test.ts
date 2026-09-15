// telegramClient.test.ts — canal Telegram de avisos administrativos
// (FASE "Telegram como segundo canal de alerta", 2026-09-11). Nunca toca
// la red real de Telegram (no hay TELEGRAM_BOT_TOKEN real en este
// entorno de test) -- se mockea globalThis.fetch para probar el request
// bien formado, el éxito y el fallo, sin depender de un bot real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { telegramConfigured, sendTelegramAlert } from "../src/lib/telegramClient";

const originalFetch = globalThis.fetch;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_CHAT_ID;

function restoreEnv() {
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = originalChatId;
  globalThis.fetch = originalFetch;
}

test("telegramConfigured: false sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID", () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  assert.equal(telegramConfigured(), false);
  restoreEnv();
});

test("telegramConfigured: true con ambas variables presentes", () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:fake-token-test";
  process.env.TELEGRAM_CHAT_ID = "999999";
  assert.equal(telegramConfigured(), true);
  restoreEnv();
});

test("sendTelegramAlert: sin configurar -> false, nunca llama a fetch (no toca la red)", async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let fetchLlamado = false;
  globalThis.fetch = (async () => {
    fetchLlamado = true;
    throw new Error("no debería llamarse");
  }) as typeof fetch;

  const ok = await sendTelegramAlert("texto de prueba");
  assert.equal(ok, false);
  assert.equal(fetchLlamado, false);
  restoreEnv();
});

test("sendTelegramAlert: request bien formado (URL con token, chat_id y texto reales en el body) -> envío exitoso", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:fake-token-test";
  process.env.TELEGRAM_CHAT_ID = "999999";

  let urlCapturada = "";
  let bodyCapturado: any = null;
  globalThis.fetch = (async (url: any, opts: any) => {
    urlCapturada = String(url);
    bodyCapturado = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => "" } as Response;
  }) as typeof fetch;

  const ok = await sendTelegramAlert("🔔 NUEVO HANDOFF\nTeléfono: 5215599990000");
  assert.equal(ok, true);
  assert.equal(urlCapturada, "https://api.telegram.org/bot123:fake-token-test/sendMessage");
  assert.equal(bodyCapturado.chat_id, "999999");
  assert.match(bodyCapturado.text, /NUEVO HANDOFF/);
  restoreEnv();
});

test("sendTelegramAlert: Telegram responde error (ok:false) -> false, nunca lanza", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:fake-token-test";
  process.env.TELEGRAM_CHAT_ID = "999999";
  globalThis.fetch = (async () => ({ ok: false, status: 401, text: async () => "Unauthorized" }) as Response) as typeof fetch;

  const ok = await sendTelegramAlert("texto de prueba");
  assert.equal(ok, false);
  restoreEnv();
});

test("sendTelegramAlert: fetch lanza/timeout -> false, nunca propaga la excepción", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:fake-token-test";
  process.env.TELEGRAM_CHAT_ID = "999999";
  globalThis.fetch = (async () => {
    throw new Error("network down (simulado)");
  }) as typeof fetch;

  await assert.doesNotReject(async () => {
    const ok = await sendTelegramAlert("texto de prueba");
    assert.equal(ok, false);
  });
  restoreEnv();
});
