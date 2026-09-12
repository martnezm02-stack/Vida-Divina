// handoffDedup.test.ts — contra el CRM REAL (crm/, PostgreSQL), nunca un
// mock, mismo criterio que crmClient.test.ts. Cubre el fix real de
// deduplicación (2026-09-11): un handoff pendiente ANTIGUO ya no debe
// bloquear uno nuevo de un evento distinto, y resolveHandoff() ya debe
// poder invocarse desde el Dashboard (ver src/app/api/alertas/resolve).
//
// Backdatea filas reales vía crm/db/pool.js#getPool() DIRECTO -- solo en
// este archivo de test, para simular "hace más de 30 minutos" sin esperar
// 30 minutos reales. Nunca se hace esto desde código de producción (que
// sigue pasando siempre por crm/index.js, como exige su cabecera).
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

let telegramLlamadas: string[] = [];
mock.module("../src/lib/telegramClient", {
  namedExports: {
    telegramConfigured: () => true,
    sendTelegramAlert: async (text: string) => {
      telegramLlamadas.push(text);
      return true;
    },
  },
});

before(async () => {
  await import("../scripts/env-loader");
});

const REPO_ROOT = "C:/Users/manue/Vida Divina";
const TEST_PHONE = `52155999${Date.now()}HANDOFFDEDUP`;

async function backdatearHandoff(handoffId: string, horasAtras: number): Promise<void> {
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const { getPool } = await import(pathToFileURL(path.join(REPO_ROOT, "crm/db/pool.js")).href as any);
  const pool = getPool();
  await pool.query("UPDATE handoffs SET creado_en = now() - ($2 || ' hours')::interval WHERE handoff_id = $1", [
    handoffId,
    String(horasAtras),
  ]);
}

test("handoffToHuman: mismo evento (llamada inmediata siguiente) SIGUE deduplicando -- regresión del comportamiento original", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) {
    console.warn("[skip] DATABASE_URL no configurada en este proceso de test");
    return;
  }
  telegramLlamadas = [];

  const r1 = await handoffToHuman(TEST_PHONE, "[persona] primer intento de este evento");
  assert.equal(r1.ok, true, r1.reason);
  assert.notEqual(r1.duplicate, true, "primer handoff real, nunca duplicado");

  const r2 = await handoffToHuman(TEST_PHONE, "[persona] segundo intento, mismo evento inmediato");
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.duplicate, true, "una segunda llamada inmediata debe seguir tratándose como el mismo evento");
  assert.equal(r2.handoffId, r1.handoffId, "debe reutilizar el mismo handoffId, nunca crear uno nuevo");

  // Solo UN aviso de Telegram real (el del primer handoff, no duplicado).
  assert.equal(telegramLlamadas.length, 1);
});

test("handoffToHuman: un handoff pendiente ANTIGUO (backdateado 2h) NO bloquea uno nuevo de otro evento", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  if (!crmConfigured()) return;
  const phone = `${TEST_PHONE}OLD`;
  telegramLlamadas = [];

  const viejo = await handoffToHuman(phone, "[compra] evento antiguo, de hace más de 30 minutos");
  assert.equal(viejo.ok, true, viejo.reason);
  assert.ok(viejo.handoffId);
  await backdatearHandoff(viejo.handoffId!, 2); // lo empuja fuera de HANDOFF_DEDUP_WINDOW_MS (30 min)

  const nuevo = await handoffToHuman(phone, "[fuera_de_alcance] evento nuevo y no relacionado, hoy");
  assert.equal(nuevo.ok, true, nuevo.reason);
  assert.notEqual(nuevo.duplicate, true, "un handoff de hace 2h no debe tratarse como el mismo evento");
  assert.notEqual(nuevo.handoffId, viejo.handoffId, "debe crear una fila NUEVA, distinta de la antigua");

  // Ambos generaron su propio aviso real de Telegram -- el bug real hacía
  // que el segundo (el que importaba, el de hoy) nunca llegara a alertar.
  assert.equal(telegramLlamadas.length, 2);
});

test("resolveHandoffAlert: marca resuelto un handoff real y, tras eso, uno nuevo (incluso inmediato) sí puede crearse", async () => {
  const { handoffToHuman, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;
  const phone = `${TEST_PHONE}RESOLVE`;
  telegramLlamadas = [];

  const primero = await handoffToHuman(phone, "[reclamo] primer handoff, se va a resolver");
  assert.equal(primero.ok, true, primero.reason);

  const resolucion = await resolveHandoffAlert(primero.handoffId!);
  assert.equal(resolucion.ok, true, resolucion.reason);

  // Resolver dos veces el mismo no debe romper nada (resolveHandoff real ya
  // es idempotente: WHERE resuelto_en IS NULL) -- debe devolver ok:false
  // honesto, nunca lanzar.
  const resolucion2 = await resolveHandoffAlert(primero.handoffId!);
  assert.equal(resolucion2.ok, false);

  // Con el anterior YA resuelto, un handoff nuevo -- incluso segundos
  // después -- debe poder crearse (nunca tratado como duplicado de uno ya resuelto).
  const segundo = await handoffToHuman(phone, "[compra] segundo handoff, después de resolver el primero");
  assert.equal(segundo.ok, true, segundo.reason);
  assert.notEqual(segundo.duplicate, true);
  assert.notEqual(segundo.handoffId, primero.handoffId);
});

test("resolveHandoffAlert: handoffId inexistente -> ok:false honesto, nunca lanza", async () => {
  const { crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const { resolveHandoffAlert } = await import("../src/lib/vidaDivina/alertas");
  if (!crmConfigured()) return;
  const res = await resolveHandoffAlert("00000000-0000-0000-0000-000000000000");
  assert.equal(res.ok, false);
});
