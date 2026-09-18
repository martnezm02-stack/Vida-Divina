// consultaAnalyticsAdmin.test.ts — Enrutamiento determinista PRE-LLM para
// consultas ADMIN de interacciones por producto (hallazgo real 2026-09-17:
// un ADMIN preguntó "¿Cuántos clientes han preguntado hoy por las cápsulas
// Ripped?" y el LLM respondió que no tenía acceso, sin llamar a la tool
// real). `intentarConsultaAnalyticsAdmin` (handler.ts) reconoce el patrón,
// reutiliza EXACTAMENTE `adminConsultarInteraccionesProductoHandler` (mismo
// gate de identidad, mismo `messageAnalytics.ts`, mismo SQLite real de
// WhatsApp) y responde con el resultado real de la tool -- nunca inventa
// nada, nunca crea una segunda consulta.
//
// Contra el SQLite real de WhatsApp (data/messages.db) -- mismo patrón ya
// establecido en solicitudPagoDeterminista.test.ts/handoffGuardTransferencia.test.ts
// (no existe un "SQLite de prueba" separado para esta base local). Se
// insertan mensajes con teléfonos únicos por timestamp para no chocar con
// datos reales; las aserciones de conteo NO asumen una base vacía (otros
// tests de esta sesión ya insertaron menciones de "Ripped" antes) -- se
// verifica el comportamiento REAL (ejecuta/no ejecuta, contenido real de
// la respuesta), no una cifra exacta.

import { test, before } from "node:test";
import assert from "node:assert/strict";

before(async () => {
  await import("../scripts/env-loader");
});

function fakeSock(sendMessage: (jid: string, content: unknown) => Promise<unknown>) {
  return { sendMessage } as any;
}
function fakeSockOk() {
  const enviados: string[] = [];
  const sock = fakeSock(async (_jid, content: any) => {
    enviados.push(content.text);
    return { key: { id: `WAMID-${enviados.length}` } };
  });
  return { sock, enviados };
}

const ADMIN_PHONE = "+522225240044"; // HERMES_ADMIN_PHONE real de .env.local (ver identity.test.ts/comercio.test.ts)
const NO_ADMIN_PHONE = `52155989${Date.now()}NOADMIN`;
const TEST_TAG = `AnalyticsRoute${Date.now()}`;

test("1) ADMIN + consulta de CONTEO ('¿Cuántos clientes han preguntado hoy por las cápsulas Ripped?') -> ejecuta la tool real y responde con datos reales", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  // Garantiza al menos un match real hoy (el conteo exacto no se asume --
  // puede haber más de otros tests de esta sesión).
  const convoFixture = db.getOrCreateConversation(`52155988${Date.now()}${TEST_TAG}`, "Cliente Fixture");
  db.insertMessage(convoFixture.id, "user", "me interesan las capsulas ripped");

  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "¿Cuántos clientes han preguntado hoy por las cápsulas Ripped?";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE, convoAdmin.id, texto);

  assert.equal(manejado, true, "debe ejecutar la tool real, no dejarlo al LLM");
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /cliente/i);
  assert.match(enviados[0], /Ripped/i, "debe mencionar el producto real detectado (Ripped Capsules)");
  assert.match(enviados[0], /\d+/, "debe incluir una cifra real, nunca aproximada");
});

test("2) ADMIN + consulta de DETALLE ('Dame el detalle de los clientes que preguntaron hoy por Ripped.') -> ejecuta la tool real e incluye el listado real", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const telefonoFixture = `52155987${Date.now()}${TEST_TAG}`;
  const convoFixture = db.getOrCreateConversation(telefonoFixture, "Cliente Detalle Fixture");
  db.insertMessage(convoFixture.id, "user", "hola quiero información de las cápsulas Ripped");

  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "Dame el detalle de los clientes que preguntaron hoy por Ripped.";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE, convoAdmin.id, texto);

  assert.equal(manejado, true);
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /Ripped/i);
  // El detalle real (líneas "- nombre (teléfono): mensaje") debe venir
  // incluido -- el fixture recién insertado puede no aparecer si ya hay más
  // de 10 menciones reales más antiguas hoy (el listado se ordena por fecha
  // ascendente y se limita, ver messageAnalytics.ts -- no se toca aquí),
  // así que se verifica la ESTRUCTURA real del detalle, no un teléfono fijo.
  assert.match(enviados[0], /\n- .+\(\d+.*\):\s*"/, "debe incluir al menos una línea real de detalle de cliente");
});

test("3) Falta producto ('¿Cuántos clientes han preguntado hoy?', sin decir cuál producto) -> NO ejecuta, deja que el LLM lo pida", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "¿Cuántos clientes han preguntado hoy?";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE, convoAdmin.id, texto);

  assert.equal(manejado, false, "sin producto no debe ejecutar nada -- el LLM debe pedirlo");
  assert.equal(enviados.length, 0);
});

test("4) Usuario NO ADMIN con la misma frase exacta -> NO ejecuta este camino", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const convoNoAdmin = db.getOrCreateConversation(NO_ADMIN_PHONE, "Cliente No Admin");
  const { sock, enviados } = fakeSockOk();

  const texto = "¿Cuántos clientes han preguntado hoy por las cápsulas Ripped?";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", NO_ADMIN_PHONE, convoNoAdmin.id, texto);

  assert.equal(manejado, false, "un no-admin nunca puede activar este camino, aunque use la frase exacta");
  assert.equal(enviados.length, 0);
});

test("5) Consulta comercial normal ('quiero comprar las capsulas ripped') desde el ADMIN -> no cambia, no activa este camino", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const convoAdmin = db.getOrCreateConversation(ADMIN_PHONE, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "quiero comprar las capsulas ripped";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE, convoAdmin.id, texto);

  assert.equal(manejado, false, "una consulta comercial normal nunca debe activar el atajo de analytics, ni siendo el ADMIN");
  assert.equal(enviados.length, 0);
});

// ============================================================
// Reproducción EXACTA del fallo real confirmado en producción
// (2026-09-17): el routing/regex/tool YA funcionaban, pero
// `resolveIdentity` nunca coincidía porque el teléfono REAL que entrega
// WhatsApp para el admin mexicano trae el "1" móvil extra
// ("5212225240044", 13 dígitos) -- distinto de la forma corta configurada
// en HERMES_ADMIN_PHONE ("522225240044"/"+522225240044", 12 dígitos, la
// usada en el resto de este archivo vía ADMIN_PHONE). Root cause real:
// identity.ts#isAdminPhone (ver identity.test.ts para el fix aislado) --
// aquí se reproduce el camino COMPLETO con el teléfono real y las frases
// EXACTAS reportadas (sin acentos, tal cual las escribió el admin real).
// ============================================================

const ADMIN_PHONE_REAL_WHATSAPP = "5212225240044"; // forma real con el "1" móvil, la que de verdad entrega WhatsApp

test("6) Reproducción real: teléfono REAL de WhatsApp (con el '1' móvil) + 'cuantos clientes preguntaron hoy por las capsulas ripped?' (sin acentos, frase real) -> SÍ ejecuta la tool real", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const convoAdminReal = db.getOrCreateConversation(ADMIN_PHONE_REAL_WHATSAPP, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "cuantos clientes preguntaron hoy por las capsulas ripped?";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE_REAL_WHATSAPP, convoAdminReal.id, texto);

  assert.equal(manejado, true, "con el teléfono real (forma con el 1 móvil), la tool real SÍ debe ejecutarse");
  assert.equal(enviados.length, 1);
  assert.doesNotMatch(enviados[0], /no tengo acceso/i, "nunca debe caer en la respuesta improvisada del LLM negando acceso");
  assert.match(enviados[0], /Ripped/i);
});

test("7) Reproducción real: teléfono REAL de WhatsApp + 'dame el detalle de los clientes que preguntaron hoy por las capsulas ripped' (frase real exacta, sin acentos) -> SÍ ejecuta la tool real", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const convoAdminReal = db.getOrCreateConversation(ADMIN_PHONE_REAL_WHATSAPP, "Manuel");
  const { sock, enviados } = fakeSockOk();

  const texto = "dame el detalle de los clientes que preguntaron hoy por las capsulas ripped";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", ADMIN_PHONE_REAL_WHATSAPP, convoAdminReal.id, texto);

  assert.equal(manejado, true);
  assert.equal(enviados.length, 1);
  assert.doesNotMatch(enviados[0], /no tengo acceso/i);
  assert.match(enviados[0], /Ripped/i);
});

test("8) CUSTOMER real (teléfono cualquiera, NO admin) con la frase real exacta -> BLOQUEADA, no ejecuta", async () => {
  const db = (await import("../src/lib/db")) as any;
  const { intentarConsultaAnalyticsAdmin } = await import("../src/lib/baileys/handler");

  const telefonoCliente = `52155986${Date.now()}${TEST_TAG}CUSTOMER`;
  const convoCliente = db.getOrCreateConversation(telefonoCliente, "Cliente Real");
  const { sock, enviados } = fakeSockOk();

  const texto = "cuantos clientes preguntaron hoy por las capsulas ripped?";
  const manejado = await intentarConsultaAnalyticsAdmin(sock, "jid-fake@s.whatsapp.net", telefonoCliente, convoCliente.id, texto);

  assert.equal(manejado, false, "un cliente real nunca puede activar analytics, sin importar la frase");
  assert.equal(enviados.length, 0);
});
