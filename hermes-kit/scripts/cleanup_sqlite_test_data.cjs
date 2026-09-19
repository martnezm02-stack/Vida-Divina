// cleanup_sqlite_test_data.cjs — script de un solo uso (fase "Limpieza real
// y completa de datos de prueba", 2026-09-19). Elimina, dentro de UNA
// transacción, exactamente las conversaciones (y todo lo que cuelga de
// ellas) que cumplen el criterio source-verificado:
//   a) phone contiene un carácter no-dígito (nunca un WhatsApp real), O
//   b) phone === '522225240044' (HERMES_ADMIN_PHONE en su forma corta de
//      12 dígitos -- verificado contra el código real: reporting.test.ts
//      la crea literalmente vía getOrCreateConversation(adminPhone,
//      "Reporting Admin Test"); identity.test.ts documenta que WhatsApp
//      real SIEMPRE entrega la forma con el "1" móvil extra, 13 dígitos,
//      "5212225240044" -- la forma corta nunca la usa un WhatsApp real).
// Conserva explícitamente: id 422 (5212213498810, Lucero) e id 469
// (5212225240044, Manuel) -- ambas verificadas como reales.
// Idempotente: una segunda ejecución no debe encontrar nada que borrar.
const Database = require("better-sqlite3");
const path = require("node:path");

const DB_PATH = path.resolve(process.cwd(), "data", "messages.db");
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

function contar(tabla, where = "") {
  return db.prepare(`SELECT COUNT(*) n FROM ${tabla} ${where}`).get().n;
}

console.log("=== ANTES ===");
const antes = {
  conversations: contar("conversations"),
  messages: contar("messages"),
  outbox: contar("outbox"),
  tool_events: contar("tool_events"),
  usage_calls: contar("usage_calls"),
  voice_calls: contar("voice_calls"),
  usage: contar("usage"),
};
console.log(antes);

const rows = db.prepare("SELECT id, phone FROM conversations").all();
const idsABorrar = rows
  .filter((r) => !/^[0-9]+$/.test(r.phone) || r.phone === "522225240044")
  .map((r) => r.id);

console.log("conversaciones identificadas para borrar:", idsABorrar.length);

const run = db.transaction((ids) => {
  const placeholders = ids.map(() => "?").join(",");
  const tablas = ["messages", "outbox", "tool_events", "usage_calls", "voice_calls", "usage"];
  for (const t of tablas) {
    const info = db.prepare(`DELETE FROM ${t} WHERE conversation_id IN (${placeholders})`).run(...ids);
    console.log(`  ${t} eliminados:`, info.changes);
  }
  const infoConv = db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...ids);
  console.log("  conversations eliminadas:", infoConv.changes);
});

if (idsABorrar.length > 0) {
  run(idsABorrar);
} else {
  console.log("Nada que borrar -- idempotente confirmado.");
}

console.log("=== DESPUES ===");
const despues = {
  conversations: contar("conversations"),
  messages: contar("messages"),
  outbox: contar("outbox"),
  tool_events: contar("tool_events"),
  usage_calls: contar("usage_calls"),
  voice_calls: contar("voice_calls"),
  usage: contar("usage"),
};
console.log(despues);

console.log("=== CONVERSACIONES RESTANTES ===");
console.log(db.prepare("SELECT id, phone, name FROM conversations").all());

db.close();
