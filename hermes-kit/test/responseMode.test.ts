// responseMode.test.ts — decisión texto/voz (lógica pura, sin red/DB reales
// más allá de settings, que caen a sus defaults si la tabla no existe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideResponseMode } from "../src/lib/vidaDivina/responseMode";

test("respuesta normal sin audio entrante -> texto", () => {
  const f = decideResponseMode({ userText: "¿qué es el tongkat ali?", isIncomingAudio: false, responseText: "El Tongkat Ali es una raíz..." });
  assert.equal(f, "text");
});

test("usuario pide audio explícitamente -> voz", () => {
  const f = decideResponseMode({ userText: "mándamelo en audio porfa", isIncomingAudio: false, responseText: "Claro, te lo explico." });
  assert.equal(f, "voice");
});

test("usuario pide 'explícamelo por audio' -> voz (hallazgo real del E2E, 2026-09-04)", () => {
  const f = decideResponseMode({ userText: "Explícamelo por audio", isIncomingAudio: false, responseText: "Claro, te lo cuento." });
  assert.equal(f, "voice");
});

test("usuario pide nota de voz -> voz", () => {
  const f = decideResponseMode({ userText: "¿me puedes mandar una nota de voz?", isIncomingAudio: false, responseText: "Sin problema." });
  assert.equal(f, "voice");
});

test("audio entrante con respuesta sustancial -> voz", () => {
  const f = decideResponseMode({
    userText: "",
    isIncomingAudio: true,
    responseText: "Este producto tiene varios ingredientes reales que te puedo explicar con calma, uno por uno, para que sepas exactamente qué contiene.",
  });
  assert.equal(f, "voice");
});

test("audio entrante con respuesta trivial -> texto (nunca voz innecesaria)", () => {
  const f = decideResponseMode({ userText: "", isIncomingAudio: true, responseText: "Sí, claro." });
  assert.equal(f, "text");
});
