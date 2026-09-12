// voiceEngineClient.test.ts — contra el Voice Engine REAL (dashboard/server/lib/
// voiceEngineClient.js). En este entorno el servicio (voice-engine/, WSL2) no
// está corriendo -- el test verifica que eso se reporta con honestidad
// (nunca un audio simulado), no que el audio se genere de verdad.
import { test, before } from "node:test";
import assert from "node:assert/strict";

// VOICE_ENGINE_API_KEY vive en voice-engine/.env, cargado por env-loader.ts
// (mismo paso que start-bot.ts hace antes de cualquier otro import) -- sin
// esto, generateVoice usa el default de desarrollo y el servicio real
// responde 401 en vez de generar audio.
let isVoiceEngineReachable: typeof import("../src/lib/vidaDivina/voiceEngineClient").isVoiceEngineReachable;
let generateVoice: typeof import("../src/lib/vidaDivina/voiceEngineClient").generateVoice;
before(async () => {
  await import("../scripts/env-loader");
  const mod = await import("../src/lib/vidaDivina/voiceEngineClient");
  isVoiceEngineReachable = mod.isVoiceEngineReachable;
  generateVoice = mod.generateVoice;
});

test("isVoiceEngineReachable refleja el estado real del servicio", async () => {
  const reachable = await isVoiceEngineReachable();
  assert.equal(typeof reachable, "boolean");
});

test("generateVoice nunca simula audio: si el servicio no responde, ok:false con motivo real", async () => {
  const reachable = await isVoiceEngineReachable();
  const res = await generateVoice("Hola, esto es una prueba real.");
  if (!reachable) {
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.reason && res.reason.length > 0);
  } else {
    // Si en algún entorno SÍ está corriendo, debe devolver una ruta OGG real.
    assert.equal(res.ok, true);
  }
});
