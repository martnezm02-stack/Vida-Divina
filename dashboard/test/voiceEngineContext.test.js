// voiceEngineContext.test.js — "contexto de generación de voz" (2026-09-11):
// generate_speech(text, context="default") en Voice Engine, transportado
// desde cada consumidor real. Aquí se prueba SOLO la construcción real del
// request HTTP (nunca se toca la red real ni se genera audio): se mockea
// http.request (mock.method, sin necesitar --experimental-test-module-mocks
// -- import http from 'node:http' es el mismo objeto vivo en todos los
// módulos) para capturar el body JSON real que generateNewVoiceover()
// escribiría a POST /v1/speak.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EventEmitter } from "node:events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

let cuerposCapturados = [];

function mockHttpRequestCapturandoBody() {
  cuerposCapturados = [];
  mock.method(http, "request", (_options, callback) => {
    const req = new EventEmitter();
    req.write = (chunk) => cuerposCapturados.push(JSON.parse(chunk));
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      setImmediate(() => {
        callback(res);
        // output_filename claramente falso -- lo que pase DESPUÉS de la
        // respuesta (traducción de ruta WSL, existsSync, WAV real) no es lo
        // que este test valida; solo importa el body ya capturado arriba.
        res.emit("data", Buffer.from(JSON.stringify({ output_filename: "no-existe-fake.wav", sample_rate: 24000, generation_seconds: 0.01 })));
        res.emit("end");
      });
    };
    req.destroy = () => {};
    req.setTimeout = () => {};
    return req;
  });
}

before(() => {
  mockHttpRequestCapturandoBody();
});

after(() => {
  mock.reset();
});

test("generateNewVoiceover: sin context explícito -> 'default' (compatibilidad con un consumidor legacy)", async () => {
  const { generateNewVoiceover } = await import("../server/lib/voiceEngineClient.js");
  mockHttpRequestCapturandoBody();
  await generateNewVoiceover({ text: "hola" }).catch(() => {});
  assert.equal(cuerposCapturados.length, 1);
  assert.equal(cuerposCapturados[0].context, "default");
});

test("generateNewVoiceover: context explícito se transporta literal al body real de POST /v1/speak", async () => {
  const { generateNewVoiceover } = await import("../server/lib/voiceEngineClient.js");
  for (const contexto of ["whatsapp", "advertisement", "video", "manual"]) {
    mockHttpRequestCapturandoBody();
    await generateNewVoiceover({ text: "hola", context: contexto }).catch(() => {});
    assert.equal(cuerposCapturados.length, 1);
    assert.equal(cuerposCapturados[0].context, contexto);
  }
});

// ============================================================
// Verificación estática de que cada consumidor real ya identificado en la
// auditoría pasa el contexto correcto -- son literales de una palabra en
// cada call site (ver implementación), así que se verifica leyendo el
// código fuente real en vez de levantar cada handler HTTP completo
// (autenticación/negocio no relacionados con este cambio).
// ============================================================

function leer(rutaRelativaAlRepo) {
  return readFileSync(path.join(REPO_ROOT, rutaRelativaAlRepo), "utf8");
}

test("Consumidor real: Hermes/WhatsApp (hermes-kit/voiceEngineClient.ts) envía context: 'whatsapp'", () => {
  const src = leer("hermes-kit/src/lib/vidaDivina/voiceEngineClient.ts");
  assert.match(src, /generateNewVoiceover\(\{[^}]*context:\s*"whatsapp"/);
});

test("Consumidor real: Content Plan/campañas (campaignPilot.js) envía context: 'advertisement'", () => {
  const src = leer("dashboard/server/routes/campaignPilot.js");
  assert.match(src, /generateNewVoiceover\(\{[^}]*context:\s*'advertisement'/);
});

test("Consumidor real: Crear contenido/Reels (generation.js#handleCreate) envía context: 'video'", () => {
  const src = leer("dashboard/server/routes/generation.js");
  assert.match(src, /generateNewVoiceover\(\{ text: voiceoverText, context: 'video' \}\)/);
});

test("Consumidor real: Creative Director/anuncios (generation.js#handleProduceCreative + Start) envía context: 'advertisement'", () => {
  const src = leer("dashboard/server/routes/generation.js");
  const ocurrencias = [...src.matchAll(/generateNewVoiceover\(\{ text: voiceoverTextFinal, context: 'advertisement' \}\)/g)];
  // Dos call sites reales: handleProduceCreative (síncrono) y
  // handleProduceCreativeStart (arranque async del mismo flujo).
  assert.equal(ocurrencias.length, 2);
});

test("Consumidor real: Video Workspace (projects.js#handleRegenerateSceneVoice) envía context: 'video'", () => {
  const src = leer("dashboard/server/routes/projects.js");
  assert.match(src, /generateNewVoiceover\(\{[^}]*context:\s*'video'/);
});

test("Consumidor real: generador manual de voz (voiceGenerator.js) envía context: 'manual'", () => {
  const src = leer("dashboard/server/routes/voiceGenerator.js");
  // Coincidencia literal exacta (no una regex con [^}]*): esta llamada
  // real anida otro objeto ({ voiceProfileId }) antes de "context", lo que
  // rompería un carácter de clase que excluye "}" -- se busca el texto
  // real tal cual quedó escrito en el archivo.
  assert.ok(src.includes("generateNewVoiceover({ text, voiceParams: { voiceProfileId }, context: 'manual' })"));
});

// ============================================================
// Idioma real de la respuesta -> Voice Engine (2026-09-12, "Idioma +
// Nombre visible"): hermes-kit ya pasa `language: idiomaDetectado` dentro
// de `voiceParams` (ver src/lib/vidaDivina/voiceEngineClient.ts) -- aquí se
// confirma, contra la construcción REAL del body de /v1/speak (mock de
// http.request, sin red real), que ese `language` dinámico ("es"/"en")
// llega literal, y que `context` sigue siendo "whatsapp" sin cambios.
// ============================================================

test("generateNewVoiceover: language='en' en voiceParams llega literal al body real de POST /v1/speak, junto con context='whatsapp' sin alterar", async () => {
  const { generateNewVoiceover } = await import("../server/lib/voiceEngineClient.js");
  mockHttpRequestCapturandoBody();
  await generateNewVoiceover({ text: "hello", voiceParams: { language: "en" }, context: "whatsapp" }).catch(() => {});
  assert.equal(cuerposCapturados.length, 1);
  assert.equal(cuerposCapturados[0].language, "en");
  assert.equal(cuerposCapturados[0].context, "whatsapp");
});

test("generateNewVoiceover: language='es' en voiceParams llega literal al body real de POST /v1/speak", async () => {
  const { generateNewVoiceover } = await import("../server/lib/voiceEngineClient.js");
  mockHttpRequestCapturandoBody();
  await generateNewVoiceover({ text: "hola", voiceParams: { language: "es" }, context: "whatsapp" }).catch(() => {});
  assert.equal(cuerposCapturados.length, 1);
  assert.equal(cuerposCapturados[0].language, "es");
});

test("Consumidor real: Hermes/WhatsApp (voiceEngineClient.ts) reenvía voiceProfile.language tal cual, sin fijarlo -- context sigue siendo 'whatsapp' fijo", () => {
  const src = leer("hermes-kit/src/lib/vidaDivina/voiceEngineClient.ts");
  assert.match(src, /generateNewVoiceover\(\{[^}]*text[^}]*voiceParams:\s*voiceProfile/);
  assert.match(src, /context:\s*"whatsapp"/);
});
