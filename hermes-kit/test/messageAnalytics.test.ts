// messageAnalytics.test.ts — Analytics admin de interacciones por producto
// (Fase "Analytics admin de interacciones por producto", 2026-09-17).
// Fixture SQLite real aislada (mismo esquema real de conversations/messages
// que data/messages.db, ver db.ts) -- nunca toca la base real del bot ni
// necesita TEST_DATABASE_URL (esto es puramente SQLite/WhatsApp, no CRM).
// Producto: contra el catálogo real (searchKnowledge), sin mocks.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

let dbPath: string;

before(() => {
  dbPath = path.join(os.tmpdir(), `messageAnalytics-test-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      jid TEXT,
      mode TEXT NOT NULL DEFAULT 'AI',
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const insertConv = db.prepare("INSERT INTO conversations (id, phone, name) VALUES (?, ?, ?)");
  const insertMsg = db.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)");

  // Timestamps reales (epoch) -- "hoy" = referencia fija usada también en
  // los tests (ver DESDE/HASTA abajo), para que el rango sea determinista.
  const HOY = Math.floor(new Date("2026-09-17T12:00:00").getTime() / 1000);
  const AYER = HOY - 86400;

  // Cliente A: pregunta por Ripped DOS veces hoy -- debe contar como 1 cliente único.
  insertConv.run(1, "5210001", "Cliente A");
  insertMsg.run(1, "user", "me interesan las capsulas ripped", HOY);
  insertMsg.run(1, "assistant", "Las Ripped Capsules cuestan $999, ¿te interesa?", HOY + 10);
  insertMsg.run(1, "user", "sí, me puedes pasar los datos para transferir lo de las ripped", HOY + 20);

  // Cliente B: pregunta por "cápsulas Ripped" (variante con acento + palabra genérica) hoy.
  insertConv.run(2, "5210002", "Cliente B");
  insertMsg.run(2, "user", "hola, quiero información de las cápsulas Ripped porfa", HOY + 30);

  // Cliente C: menciona Ripped mismo día PERO el mensaje que lo menciona es del BOT, no del cliente.
  insertConv.run(3, "5210003", "Cliente C");
  insertMsg.run(3, "user", "hola", HOY + 40);
  insertMsg.run(3, "assistant", "¿Te interesan las cápsulas Ripped? Ayudan a quemar grasa.", HOY + 50);

  // Cliente D: preguntó por Ripped mismo texto pero AYER -- fuera del rango de "hoy".
  insertConv.run(4, "5210004", "Cliente D");
  insertMsg.run(4, "user", "quiero las capsulas ripped", AYER);

  // Cliente E: pregunta por un producto totalmente distinto (Vida Pure) -- no debe contar.
  insertConv.run(5, "5210005", "Cliente E");
  insertMsg.run(5, "user", "me interesa Vida Pure", HOY + 60);

  db.close();
});

after(() => {
  fs.rmSync(dbPath, { force: true });
});

const DESDE = new Date("2026-09-17T00:00:00");
const HASTA = new Date("2026-09-18T00:00:00");

test("Detección: 'Ripped' resuelve el producto real del catálogo (Ripped Capsules)", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "Ripped", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.productoId, "productos/07-rendimiento-fisico/ripped-capsules");
});

test("Clientes únicos: el cliente A menciona Ripped DOS veces hoy -> cuenta como 1 cliente único, 2 mensajes", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "Ripped", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Clientes A y B mencionan Ripped hoy en mensajes de usuario real -> 2 únicos.
  assert.equal(r.clientesUnicos, 2, "solo A y B -- C fue el bot quien lo mencionó, D fue ayer, E es otro producto");
  assert.equal(r.totalMensajes, 3, "2 mensajes de A + 1 de B, nunca el del bot");
  assert.equal(r.totalConversaciones, 2);
});

test("Exclusión de mensajes del bot: la mención de Ripped por el ASISTENTE en la conversación del cliente C nunca cuenta", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "Ripped", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const telefonos = r.mensajes.map((m) => m.phone);
  assert.ok(!telefonos.includes("5210003"), "el cliente C nunca escribió Ripped, solo el bot -- no debe aparecer");
});

test("Rango de fechas: el cliente D preguntó AYER -- fuera del rango de 'hoy', no debe contarse", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "Ripped", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const telefonos = r.mensajes.map((m) => m.phone);
  assert.ok(!telefonos.includes("5210004"), "ayer está fuera del rango solicitado (hoy)");

  // Si se amplía el rango para incluir ayer, el cliente D SÍ debe aparecer.
  const desdeAmplio = new Date("2026-09-16T00:00:00");
  const rAmplio = await consultarInteraccionesPorProducto({ producto: "Ripped", desde: desdeAmplio, hasta: HASTA, dbPath });
  assert.equal(rAmplio.ok, true);
  if (rAmplio.ok) assert.equal(rAmplio.clientesUnicos, 3, "A, B y D dentro del rango ampliado");
});

test("Variante 'cápsulas Ripped' (con acento y palabra genérica) SÍ se detecta igual que 'Ripped' solo", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "cápsulas Ripped", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const telefonos = r.mensajes.map((m) => m.phone);
  assert.ok(telefonos.includes("5210002"), "el cliente B escribió 'cápsulas Ripped' -- debe encontrarse");
});

test("Producto no encontrado: nombre que no existe en el catálogo real -> ok:false, nunca inventa", async () => {
  const { consultarInteraccionesPorProducto } = await import("../src/lib/vidaDivina/messageAnalytics");
  const r = await consultarInteraccionesPorProducto({ producto: "Producto Inexistente Fantasma XYZ", desde: DESDE, hasta: HASTA, dbPath });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /No se encontró ningún producto real/);
});
