// watchdog.test.ts — alertHandoff(): dos canales administrativos
// independientes (WhatsApp existente + Telegram nuevo, FASE "Telegram como
// segundo canal de alerta", 2026-09-11). Se mockea telegramClient.ts (nunca
// toca la red real) para probar que ninguno de los dos canales depende del
// otro y que un fallo nunca rompe el flujo. WhatsApp "falla" de forma
// natural en este entorno de test (no hay currentSock real -- nunca se
// llamó startWatchdog con un socket Baileys real), lo cual es justo el
// escenario que prueba que Telegram sigue intentando igual.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let telegramLlamadoCon: string | null = null;
let telegramDebeFallar = false;

mock.module("../src/lib/telegramClient", {
  namedExports: {
    telegramConfigured: () => true,
    sendTelegramAlert: async (text: string) => {
      telegramLlamadoCon = text;
      if (telegramDebeFallar) return false;
      return true;
    },
  },
});

test("alertHandoff: WhatsApp sin conexión real en este entorno (currentSock null) no impide que Telegram se intente -- son independientes", async () => {
  const { alertHandoff } = await import("../src/lib/watchdog");
  telegramLlamadoCon = null;
  telegramDebeFallar = false;

  const ok = await alertHandoff("5215599990000", "[compra] Lead listo para comprar Tongkat", "Cliente de Prueba");

  assert.equal(ok, true, "debe ser true porque Telegram (el canal mockeado) sí tuvo éxito, aunque WhatsApp no");
  assert.ok(telegramLlamadoCon, "sendTelegramAlert debe haberse llamado igual");
  assert.match(telegramLlamadoCon!, /NUEVO HANDOFF/);
  assert.match(telegramLlamadoCon!, /Cliente: Cliente de Prueba/);
  assert.match(telegramLlamadoCon!, /Teléfono: 5215599990000/);
  assert.match(telegramLlamadoCon!, /Motivo: \[compra\] Lead listo para comprar Tongkat/);
});

test("alertHandoff: si Telegram falla, nunca lanza -- el llamador (handoffToHuman) sigue su flujo normal", async () => {
  const { alertHandoff } = await import("../src/lib/watchdog");
  telegramDebeFallar = true;

  await assert.doesNotReject(async () => {
    // ok puede ser false (ambos canales fallaron en este entorno de test),
    // pero la promesa NUNCA debe rechazar -- eso es lo que garantiza que un
    // fallo de aviso nunca rompe el handoff real.
    await alertHandoff("5215599990001", "[persona] Pide hablar con alguien");
  });
  telegramDebeFallar = false;
});

test("alertHandoff: sin nombre -- el mensaje de Telegram omite la línea 'Cliente' (nunca la inventa)", async () => {
  const { alertHandoff } = await import("../src/lib/watchdog");
  telegramLlamadoCon = null;

  await alertHandoff("5215599990002", "[reclamo] Pedido llegó dañado");

  assert.ok(telegramLlamadoCon);
  assert.doesNotMatch(telegramLlamadoCon!, /Cliente:/);
});
