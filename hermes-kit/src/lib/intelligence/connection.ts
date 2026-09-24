// connection.ts — Conexión SQLite local del Intelligence Store (MI-1).
//
// Almacén propio, separado de data/messages.db (el SQLite de conversaciones
// de Hermes) y separado del PostgreSQL CRM de Vida Divina (crm/). Vive en la
// misma laptop, junto a los demás datos locales de Hermes, en
// data/intelligence.db — nunca dentro del CRM.
//
// Mismo patrón de aislamiento de test que src/lib/db.ts: con
// HERMES_TEST_MODE=1 (heredado de "npm test") y sin que un test fije su
// propio HERMES_INTELLIGENCE_TEST_DB_PATH a mano, se usa un archivo temporal
// por proceso -- nunca el intelligence.db real.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ensureSchema } from "./schema";

const DATA_DIR = path.resolve(process.cwd(), "data");

const DB_PATH =
  process.env.HERMES_INTELLIGENCE_TEST_DB_PATH ??
  (process.env.HERMES_TEST_MODE === "1"
    ? path.join(os.tmpdir(), `hermes-test-intelligence-${process.pid}.db`)
    : path.join(DATA_DIR, "intelligence.db"));

let _db: Database.Database | null = null;

function build(): Database.Database {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // WAL + busy_timeout: mismo motivo que db.ts -- distintos procesos de
  // Hermes (ingesta, agente, futura API) pueden leer/escribir a la vez.
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  ensureSchema(db);

  return db;
}

/** Devuelve la conexión, inicializándola de forma perezosa la primera vez. */
export function getDb(): Database.Database {
  if (!_db) {
    _db = build();
  }
  return _db;
}

/** Ruta real en disco de la base activa (para reportes/diagnóstico). */
export function getDbPath(): string {
  return DB_PATH;
}

/** Solo para tests: fuerza a reabrir la conexión (simula cierre/reinicio de Hermes). */
export function _resetConnectionForTests(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
