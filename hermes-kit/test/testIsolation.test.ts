// testIsolation.test.ts — regresión real (Parte 3/12, fase "Dashboard:
// limpieza de datos de prueba", 2026-09-19): prueba que "npm test" YA NO
// puede dejar basura operacional en la base real, incluso si un archivo de
// test nuevo se olvida de aislarse a mano.
//
// Cubre el mecanismo central (no un archivo individual): "npm test" exporta
// HERMES_TEST_MODE=1 (ver package.json#scripts.test); con esa variable
// presente y SIN que este archivo fije su propio DATABASE_URL/
// HERMES_TEST_DB_PATH a mano, env-loader.ts y db.ts deben redirigir por
// defecto a la base/archivo de TEST, nunca a los reales de producción.
//
// Importante: este archivo NO debe importar ../scripts/env-loader en un
// before() que fije DATABASE_URL a mano (eso probaría el aislamiento
// EXPLÍCITO, ya cubierto por crmClient.test.ts/alertas.test.ts/etc.) --
// aquí se deja el comportamiento POR DEFECTO tal cual, para probar
// exactamente lo que un test nuevo y descuidado heredaría.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

test("HERMES_TEST_MODE=1 (heredado de npm test) está presente en este proceso", () => {
  assert.equal(process.env.HERMES_TEST_MODE, "1", "este test debe correr vía 'npm test' (cross-env HERMES_TEST_MODE=1), no de forma suelta sin esa variable");
});

test("env-loader.ts: sin override manual, redirige DATABASE_URL a TEST_DATABASE_URL real -- nunca a la base de producción", async () => {
  assert.equal(process.env.DATABASE_URL, undefined, "este test debe ser el primero en importar env-loader en su proceso -- si ya está seteada, la prueba no es válida");

  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const real = texto.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  const test_ = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
  assert.ok(real && test_, "crm/.env debe tener DATABASE_URL y TEST_DATABASE_URL reales");
  const dbUrlReal = real!.slice(real!.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  const dbUrlTest = test_!.slice(test_!.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  assert.notEqual(dbUrlReal, dbUrlTest, "precondición real: producción y test deben apuntar a bases distintas en crm/.env");

  await import("../scripts/env-loader");

  assert.equal(process.env.DATABASE_URL, dbUrlTest, "por defecto, con HERMES_TEST_MODE=1, DATABASE_URL debe quedar igual a TEST_DATABASE_URL");
  assert.notEqual(process.env.DATABASE_URL, dbUrlReal, "DATABASE_URL nunca debe terminar apuntando a la base real de producción en un proceso de test");
});

test("db.ts: sin override manual, con HERMES_TEST_MODE=1, usa un archivo SQLite temporal -- nunca data/messages.db real", async () => {
  const dataDir = path.resolve(process.cwd(), "data");
  const realDbPath = path.join(dataDir, "messages.db");
  const statAntes = fs.existsSync(realDbPath) ? fs.statSync(realDbPath).mtimeMs : null;

  const marcador = `52155${Date.now()}TESTISOLATION`;
  const { getOrCreateConversation } = await import("../src/lib/db");
  getOrCreateConversation(marcador, "Test Isolation Marker");

  const statDespues = fs.existsSync(realDbPath) ? fs.statSync(realDbPath).mtimeMs : null;
  assert.equal(statDespues, statAntes, "escribir una conversación de test NUNCA debe tocar el messages.db real (mismo mtime antes/después)");

  // Mismo cálculo determinista que db.ts#DB_PATH usa quando HERMES_TEST_MODE=1
  // y nadie fija HERMES_TEST_DB_PATH a mano -- ver src/lib/db.ts.
  const tempDbPath = process.env.HERMES_TEST_DB_PATH ?? path.join(os.tmpdir(), `hermes-test-messages-${process.pid}.db`);
  assert.ok(fs.existsSync(tempDbPath), `el archivo temporal de test (${tempDbPath}) debe existir tras escribir`);
});
