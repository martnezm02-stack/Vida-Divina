import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "messages.db");

// ============================================================
// Tipos
// ============================================================

export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";
export type ConnectionStatus = "disconnected" | "qr" | "connecting" | "connected";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  jid: string | null;
  mode: ConversationMode;
  // Idioma real detectado de esta conversación ("es" | "en") -- NULL en
  // conversaciones anteriores a esta columna, o si nunca se detectó nada
  // todavía. Interpretar NULL como "es" (ver languageDetection.ts#idiomaEfectivo),
  // nunca a ciegas en el tipo -- se deja como string para no acoplar este
  // archivo a los valores concretos que decida esa capa.
  language: string | null;
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationListItem extends Conversation {
  last_message_preview: string | null;
}

export interface UnansweredConvo {
  id: number;
  phone: string;
  name: string | null;
  last_role: string;
  last_at: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  created_at: number;
}

export interface ConnectionState {
  id: number;
  status: ConnectionStatus;
  qr_string: string | null;
  phone: string | null;
  updated_at: number;
}

export interface OutboxItem {
  id: number;
  conversation_id: number;
  phone: string;
  content: string;
  type: string; // 'text' | 'image'
  media_path: string | null;
  sent: number;
  created_at: number;
}

// ============================================================
// Inicialización PEREZOSA (lazy) de la base de datos.
//
// La conexión, el esquema y los statements NO se crean al importar este módulo,
// sino la primera vez que se usa de verdad (primera llamada a una función).
//
// Esto es CLAVE: `next build` importa las rutas API (que importan este módulo)
// en ~10 workers en paralelo. Si abriéramos y escribiéramos la DB al importar,
// esos workers chocarían inicializando el WAL del mismo archivo a la vez y el
// build fallaría con "database is locked" (SQLITE_BUSY) — un fallo no determinista
// que el `busy_timeout` no cubre del todo. Con init perezoso, importar el módulo
// NO toca la DB: solo la tocan el bot y el servidor cuando atienden de verdad.
// (ver errores-sesion.md #15)
// ============================================================

function build() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // PRAGMA WAL: permite que bot y dashboard lean/escriban el mismo archivo a la vez.
  db.pragma("journal_mode = WAL");
  // busy_timeout: red de seguridad en runtime. Si bot y dashboard coinciden
  // escribiendo, esperar hasta 5s a que se libere el lock en vez de fallar al
  // instante con SQLITE_BUSY. (El problema del build se resuelve con el init perezoso.)
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      jid TEXT,
      mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS connection_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
        NOT NULL DEFAULT 'disconnected',
      qr_string TEXT,
      phone TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      content TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_pending
      ON outbox(sent, created_at);

    -- Métricas: consumo de tokens/coste por llamada al LLM
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      model TEXT,
      in_tokens INTEGER NOT NULL DEFAULT 0,
      out_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_usage_time ON usage(created_at);

    -- Métricas detalladas por LLAMADA real al LLM (auditoría de costo,
    -- 2026-09-11): "usage" ya guardaba el total agregado, pero un turno con
    -- tool hace 2+ llamadas reales y "usage" no distinguía cuántas ni el
    -- costo de cada una, ni si el costo venía de OpenRouter (real) o de la
    -- tabla local de tarifas (estimado) -- para el modelo activo en ese
    -- momento (openai/gpt-4o-mini-2024-07-18) ni siquiera estaba en la
    -- tabla local, así que "usage.cost_usd" quedaba en 0 real. Tabla hija de
    -- "usage_calls", nunca duplica conversations/messages -- solo referencia
    -- su id real (message_id = id del mensaje del lead que disparó el turno).
    CREATE TABLE IF NOT EXISTS usage_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      message_id INTEGER,
      call_index INTEGER NOT NULL,
      model TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      cost_source TEXT NOT NULL DEFAULT 'estimated',
      tool_name TEXT,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_usage_calls_conv ON usage_calls(conversation_id, created_at);

    -- Métricas OPERATIVAS de Voice Engine (2026-09-11) -- NUNCA un costo
    -- monetario: Voice Engine corre local (Chatterbox), no tiene precio por
    -- llamada. Estos campos son solo para diagnóstico/capacidad real
    -- (segmentos, duración, éxito/fallo) -- "cost_usd" NO existe en esta
    -- tabla a propósito, para que nadie la sume por error al costo externo
    -- real (ver usage_calls, la única tabla con costo monetario real).
    CREATE TABLE IF NOT EXISTS voice_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      message_id INTEGER,
      characters INTEGER NOT NULL DEFAULT 0,
      words INTEGER NOT NULL DEFAULT 0,
      attempted INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      fallback_to_text INTEGER NOT NULL DEFAULT 0,
      duration_seconds REAL,
      generation_seconds REAL,
      sample_rate INTEGER,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_voice_calls_conv ON voice_calls(conversation_id, created_at);

    -- Métricas: eventos de tools (para leads y embudo)
    CREATE TABLE IF NOT EXISTS tool_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      tool TEXT NOT NULL,
      has_email INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_toolev_time ON tool_events(created_at);

    -- Métricas: caché de análisis con IA (dudas frecuentes) por periodo
    CREATE TABLE IF NOT EXISTS insights (
      period_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Ajustes editables en caliente desde el dashboard (modelo, pausa, buffer...)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migración: columna `jid` en conversations. Guarda la dirección completa del contacto
  // (p.ej. <numero>@s.whatsapp.net o <lid>@lid) para poder responderle por el dominio correcto.
  // En DBs creadas con versiones anteriores la tabla ya existe sin esta columna; la añadimos si falta.
  const cols = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "jid")) {
    db.exec("ALTER TABLE conversations ADD COLUMN jid TEXT");
  }
  // Migración: columna `language` (2026-09-12, "idioma de la conversación").
  // NULL en filas existentes -- se interpreta como "es" en la capa de
  // aplicación (idiomaEfectivo), nunca se rellena a ciegas aquí para no
  // inventar un dato que nunca se detectó de verdad.
  if (!cols.some((c) => c.name === "language")) {
    db.exec("ALTER TABLE conversations ADD COLUMN language TEXT");
  }

  const obCols = db.prepare("PRAGMA table_info(outbox)").all() as Array<{ name: string }>;
  if (!obCols.some((c) => c.name === "type")) {
    db.exec("ALTER TABLE outbox ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
  }
  if (!obCols.some((c) => c.name === "media_path")) {
    db.exec("ALTER TABLE outbox ADD COLUMN media_path TEXT");
  }

  // Migración: columna `detail` en tool_events (2026-09-11) -- genérica,
  // NUNCA solo para derivarHumano: guarda un discriminador corto y real
  // cuando la propia tool lo tenga (ej. derivarHumano.tipo:
  // "compra"/"persona"/"reclamo"/"fuera_de_alcance") para poder medir el
  // costo externo real de las conversaciones que terminan en compra (ver
  // "E. COSTO TOTAL DE ATENCIÓN" del encargo) sin inventar una tabla
  // paralela -- nunca guarda payloads completos ni datos sensibles.
  const teCols = db.prepare("PRAGMA table_info(tool_events)").all() as Array<{ name: string }>;
  if (!teCols.some((c) => c.name === "detail")) {
    db.exec("ALTER TABLE tool_events ADD COLUMN detail TEXT");
  }

  // --- Conversations ---
  const stmtGetConvByPhone = db.prepare<[string], Conversation>(
    "SELECT * FROM conversations WHERE phone = ?"
  );
  const stmtInsertConv = db.prepare(
    "INSERT INTO conversations (phone, name, jid) VALUES (?, ?, ?)"
  );
  const stmtUpdateConvName = db.prepare(
    "UPDATE conversations SET name = ? WHERE id = ? AND (name IS NULL OR name = '')"
  );
  const stmtUpdateConvJid = db.prepare(
    "UPDATE conversations SET jid = ? WHERE id = ?"
  );
  const stmtGetConvById = db.prepare<[number], Conversation>(
    "SELECT * FROM conversations WHERE id = ?"
  );
  const stmtListConvs = db.prepare<[], ConversationListItem>(`
    SELECT
      c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview
    FROM conversations c
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  `);
  const stmtSetMode = db.prepare("UPDATE conversations SET mode = ? WHERE id = ?");
  const stmtSetLanguage = db.prepare("UPDATE conversations SET language = ? WHERE id = ?");
  // Watchdog: conversaciones en modo AI cuyo ÚLTIMO mensaje es del lead (no
  // contestado) con una antigüedad entre [newer, older] segundos. Señal directa
  // de "el bot no está respondiendo".
  const stmtUnanswered = db.prepare<[number, number], UnansweredConvo>(`
    SELECT id, phone, name, last_role, last_at FROM (
      SELECT c.id AS id, c.phone AS phone, c.name AS name,
        (SELECT m.role FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_role,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
      FROM conversations c
      WHERE c.mode = 'AI'
    )
    WHERE last_role = 'user' AND last_at < ? AND last_at >= ?
  `);

  // --- Messages ---
  const stmtInsertMessage = db.prepare(
    "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
  );
  const stmtUpdateLastMessageAt = db.prepare(
    "UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?"
  );
  const stmtGetMessages = db.prepare<[number, number], Message>(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `);
  const insertMessageTx = db.transaction(
    (conversationId: number, role: MessageRole, content: string): number => {
      const info = stmtInsertMessage.run(conversationId, role, content);
      stmtUpdateLastMessageAt.run(conversationId);
      return info.lastInsertRowid as number;
    }
  );

  // --- Connection state ---
  const stmtGetConnState = db.prepare<[], ConnectionState>(
    "SELECT * FROM connection_state WHERE id = 1"
  );
  const stmtUpdateConnAll = db.prepare(`
    UPDATE connection_state
    SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch()
    WHERE id = 1
  `);

  // --- Outbox ---
  const stmtEnqueueOutbox = db.prepare(
    "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
  );
  const stmtEnqueueOutboxMedia = db.prepare(
    "INSERT INTO outbox (conversation_id, phone, content, type, media_path) VALUES (?, ?, ?, ?, ?)"
  );
  const stmtGetPendingOutbox = db.prepare<[number], OutboxItem>(
    "SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?"
  );
  const stmtMarkOutboxSent = db.prepare("UPDATE outbox SET sent = 1 WHERE id = ?");
  const stmtListOutboxByConversation = db.prepare<[number], OutboxItem>(
    "SELECT * FROM outbox WHERE conversation_id = ? AND type != 'text' ORDER BY created_at ASC"
  );

  // --- Borrado de conversaciones (atómico) ---
  const stmtDeleteMessages = db.prepare(
    "DELETE FROM messages WHERE conversation_id = ?"
  );
  const stmtDeletePendingOutbox = db.prepare(
    "DELETE FROM outbox WHERE conversation_id = ? AND sent = 0"
  );
  const stmtDeleteConv = db.prepare("DELETE FROM conversations WHERE id = ?");
  const deleteConversationTx = db.transaction((conversationId: number): void => {
    stmtDeleteMessages.run(conversationId);
    stmtDeletePendingOutbox.run(conversationId);
    stmtDeleteConv.run(conversationId);
  });

  // --- Reconciliación @lid → número real (WhatsApp 2025+) ---
  // Cuando una persona que estaba guardada por su LID ahora llega resuelta a su
  // número real, unificamos su conversación para que no aparezca duplicada.
  const stmtSetConvPhoneJid = db.prepare(
    "UPDATE conversations SET phone = ?, jid = ? WHERE id = ?"
  );
  const stmtMoveMessages = db.prepare(
    "UPDATE messages SET conversation_id = ? WHERE conversation_id = ?"
  );
  const stmtMoveOutbox = db.prepare(
    "UPDATE outbox SET conversation_id = ? WHERE conversation_id = ?"
  );
  const reconcileLidToPnTx = db.transaction(
    (lidPhone: string, realPhone: string, jid: string): void => {
      const lidConvo = stmtGetConvByPhone.get(lidPhone);
      if (!lidConvo) return; // no había conversación vieja con el LID
      const realConvo = stmtGetConvByPhone.get(realPhone);
      if (!realConvo) {
        // Re-indexar la conversación del LID al número real (conserva historial).
        stmtSetConvPhoneJid.run(realPhone, jid, lidConvo.id);
      } else if (realConvo.id !== lidConvo.id) {
        // Ya existían las dos (split previo al arreglo): fusionar mensajes y
        // outbox en la del número real y borrar la del LID.
        stmtMoveMessages.run(realConvo.id, lidConvo.id);
        stmtMoveOutbox.run(realConvo.id, lidConvo.id);
        stmtUpdateConvJid.run(jid, realConvo.id);
        stmtUpdateLastMessageAt.run(realConvo.id);
        stmtDeleteConv.run(lidConvo.id);
      }
    }
  );

  return {
    db,
    stmtGetConvByPhone,
    stmtInsertConv,
    stmtUpdateConvName,
    stmtUpdateConvJid,
    stmtGetConvById,
    stmtListConvs,
    stmtSetMode,
    stmtSetLanguage,
    stmtUnanswered,
    stmtGetMessages,
    insertMessageTx,
    stmtGetConnState,
    stmtUpdateConnAll,
    stmtEnqueueOutbox,
    stmtEnqueueOutboxMedia,
    stmtGetPendingOutbox,
    stmtMarkOutboxSent,
    stmtListOutboxByConversation,
    deleteConversationTx,
    reconcileLidToPnTx,
  };
}

let _ctx: ReturnType<typeof build> | null = null;

/** Devuelve el contexto de la DB, inicializándolo de forma perezosa la primera vez. */
function ctx(): ReturnType<typeof build> {
  if (!_ctx) {
    _ctx = build();
  }
  return _ctx;
}

// ============================================================
// Conversations
// ============================================================

export function getOrCreateConversation(
  phone: string,
  name?: string,
  jid?: string
): Conversation {
  const c = ctx();
  const existing = c.stmtGetConvByPhone.get(phone);
  if (existing) {
    if (name && (!existing.name || existing.name === "")) {
      c.stmtUpdateConvName.run(name, existing.id);
      existing.name = name;
    }
    // Mantener el jid al día (backfill de filas antiguas y cambios de dirección).
    if (jid && existing.jid !== jid) {
      c.stmtUpdateConvJid.run(jid, existing.id);
      existing.jid = jid;
    }
    return existing;
  }
  const info = c.stmtInsertConv.run(phone, name ?? null, jid ?? null);
  return {
    id: info.lastInsertRowid as number,
    phone,
    name: name ?? null,
    jid: jid ?? null,
    mode: "AI",
    language: null,
    last_message_at: null,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Reconciliación @lid → número real: si una persona estaba guardada por su LID
 * (antes del arreglo del @lid) y ahora llega resuelta a su número real, unifica
 * su conversación —re-indexa la vieja o fusiona las dos si ya se habían partido—
 * para que no aparezca duplicada en el panel ni pierda su historial.
 * Best-effort: nunca rompe la recepción de mensajes.
 */
export function reconcileLidToPn(lidPhone: string, realPhone: string, jid: string): void {
  if (!lidPhone || !realPhone || lidPhone === realPhone) return;
  try {
    ctx().reconcileLidToPnTx(lidPhone, realPhone, jid);
  } catch {
    // la reconciliación nunca debe romper el flujo de mensajes
  }
}

export function getConversationById(id: number): Conversation | null {
  return ctx().stmtGetConvById.get(id) ?? null;
}

/** Lectura pura por teléfono -- a diferencia de getOrCreateConversation, NUNCA crea una fila nueva. */
export function getConversationByPhone(phone: string): Conversation | null {
  return ctx().stmtGetConvByPhone.get(phone) ?? null;
}

export function listConversations(): ConversationListItem[] {
  return ctx().stmtListConvs.all();
}

/**
 * Watchdog: conversaciones en modo AI cuyo último mensaje es del lead y lleva
 * sin respuesta entre `minSinRespuestaSec` y `maxAntiguedadSec` segundos. Señal
 * directa de que el bot no está contestando (bug mudo, saldo, error…).
 */
export function getUnansweredConversations(
  minSinRespuestaSec = 180,
  maxAntiguedadSec = 7200
): UnansweredConvo[] {
  const now = Math.floor(Date.now() / 1000);
  return ctx().stmtUnanswered.all(now - minSinRespuestaSec, now - maxAntiguedadSec);
}

export function setMode(conversationId: number, mode: ConversationMode): void {
  ctx().stmtSetMode.run(mode, conversationId);
}

/** Persiste el idioma real detectado de esta conversación ("es"|"en") -- ver languageDetection.ts. Se llama cada turno, nunca solo la primera vez. */
export function setConversationLanguage(conversationId: number, language: string): void {
  ctx().stmtSetLanguage.run(language, conversationId);
}

// ============================================================
// Messages
// ============================================================

export function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string
): number {
  return ctx().insertMessageTx(conversationId, role, content);
}

export function getMessages(conversationId: number, limit = 50): Message[] {
  return ctx().stmtGetMessages.all(conversationId, limit).reverse();
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  // Consulta DESC + reverse en JS, mucho más eficiente que ORDER BY ASC sobre toda la tabla
  return ctx().stmtGetMessages.all(conversationId, limit).reverse();
}

// ============================================================
// Connection state
// ============================================================

export function getConnectionState(): ConnectionState {
  return ctx().stmtGetConnState.get() as ConnectionState;
}

interface SetConnectionInput {
  status?: ConnectionStatus;
  qr_string?: string | null;
  phone?: string | null;
}

/**
 * Actualiza el estado de conexión.
 * IMPORTANTE: Preserva los campos no provistos.
 * Solo pasar null EXPLÍCITO borra un campo.
 * Si pasas {status: 'connecting'}, qr_string y phone NO se tocan.
 */
export function setConnectionState(input: SetConnectionInput): void {
  const current = getConnectionState();
  const next = {
    status: input.status ?? current.status,
    qr_string: "qr_string" in input ? input.qr_string : current.qr_string,
    phone: "phone" in input ? input.phone : current.phone,
  };
  ctx().stmtUpdateConnAll.run(next.status, next.qr_string, next.phone);
}

// ============================================================
// Outbox (mensajes humanos que el bot debe enviar)
// ============================================================

export function enqueueOutbox(
  conversationId: number,
  phone: string,
  content: string
): number {
  const info = ctx().stmtEnqueueOutbox.run(conversationId, phone, content);
  return info.lastInsertRowid as number;
}

/**
 * Encola cualquier MEDIA (imagen, audio de voz, vídeo de testimonio/comercial)
 * para que el bot la envíe por Baileys -- misma columna `type` ya existente
 * en la tabla `outbox` (antes solo usada con 'image'). `caption` es el pie
 * de foto o, para audio, se ignora (WhatsApp no soporta pie en notas de voz).
 */
export function enqueueOutboxMedia(
  conversationId: number,
  phone: string,
  mediaPath: string,
  caption = "",
  type: "image" | "audio" | "video" | "document" = "image"
): number {
  const info = ctx().stmtEnqueueOutboxMedia.run(conversationId, phone, caption, type, mediaPath);
  return info.lastInsertRowid as number;
}

/** Encola una IMAGEN para que el bot la envíe (content = pie de foto, opcional). */
export function enqueueOutboxImage(
  conversationId: number,
  phone: string,
  mediaPath: string,
  caption = ""
): number {
  return enqueueOutboxMedia(conversationId, phone, mediaPath, caption, "image");
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return ctx().stmtGetPendingOutbox.all(limit);
}

export function markOutboxSent(id: number): void {
  ctx().stmtMarkOutboxSent.run(id);
}

/** Media (imagen/audio/vídeo) real enviada en una conversación -- usado para dar contexto completo al humano en un handoff. */
export function listOutboxMediaByConversation(conversationId: number): OutboxItem[] {
  return ctx().stmtListOutboxByConversation.all(conversationId);
}

// ============================================================
// Borrado de conversaciones (atómico)
// ============================================================

export function deleteConversation(conversationId: number): void {
  ctx().deleteConversationTx(conversationId);
}

// ============================================================
// Métricas (analytics)
// ============================================================

export function insertUsage(
  conversationId: number | null,
  model: string,
  inTokens: number,
  outTokens: number,
  costUsd: number
): void {
  ctx()
    .db.prepare(
      "INSERT INTO usage (conversation_id, model, in_tokens, out_tokens, cost_usd) VALUES (?, ?, ?, ?, ?)"
    )
    .run(conversationId, model, inTokens, outTokens, costUsd);
}

export interface UsageCallInput {
  conversationId: number | null;
  messageId: number | null;
  callIndex: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  costSource: "openrouter" | "estimated";
  toolName?: string | null;
  durationMs?: number | null;
}

/** Una fila por CADA llamada real al LLM (ver nota de la tabla usage_calls). */
export function insertUsageCall(input: UsageCallInput): void {
  ctx()
    .db.prepare(
      `INSERT INTO usage_calls
        (conversation_id, message_id, call_index, model, prompt_tokens, completion_tokens, total_tokens, cached_tokens, cost_usd, cost_source, tool_name, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.conversationId,
      input.messageId,
      input.callIndex,
      input.model,
      input.promptTokens,
      input.completionTokens,
      input.totalTokens,
      input.cachedTokens,
      input.costUsd,
      input.costSource,
      input.toolName ?? null,
      input.durationMs ?? null
    );
}

export function insertToolEvent(
  conversationId: number | null,
  tool: string,
  hasEmail: boolean,
  detail: string | null = null
): void {
  ctx()
    .db.prepare(
      "INSERT INTO tool_events (conversation_id, tool, has_email, detail) VALUES (?, ?, ?, ?)"
    )
    .run(conversationId, tool, hasEmail ? 1 : 0, detail);
}

export interface VoiceCallInput {
  conversationId: number | null;
  messageId: number | null;
  characters: number;
  words: number;
  attempted: boolean;
  success: boolean;
  fallbackToText: boolean;
  durationSeconds?: number | null;
  generationSeconds?: number | null;
  sampleRate?: number | null;
  reason?: string | null;
}

/** Una fila por CADA intento de generar una nota de voz -- SOLO métricas operativas, nunca un costo monetario (ver nota de la tabla voice_calls). */
export function insertVoiceCall(input: VoiceCallInput): void {
  ctx()
    .db.prepare(
      `INSERT INTO voice_calls
        (conversation_id, message_id, characters, words, attempted, success, fallback_to_text, duration_seconds, generation_seconds, sample_rate, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.conversationId,
      input.messageId,
      input.characters,
      input.words,
      input.attempted ? 1 : 0,
      input.success ? 1 : 0,
      input.fallbackToText ? 1 : 0,
      input.durationSeconds ?? null,
      input.generationSeconds ?? null,
      input.sampleRate ?? null,
      input.reason ?? null
    );
}

// ============================================================
// Costo EXTERNO real de atención (2026-09-11) -- SOLO usage_calls
// (OpenRouter/LLM real). voice_calls NUNCA se suma aquí -- Voice Engine es
// local, sin costo monetario por llamada (ver nota de esquema arriba).
// Si en el futuro se agrega una tool/API externa de pago real, su costo
// real se sumaría aquí también, nunca estimado.
// ============================================================

/** Costo externo real total de UNA conversación (suma de todas sus llamadas LLM reales). */
export function getCostByConversation(conversationId: number): number {
  const row = ctx()
    .db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM usage_calls WHERE conversation_id = ?")
    .get(conversationId) as { c: number };
  return row.c;
}

/** Costo externo real total de TODAS las conversaciones de un teléfono real (join real por conversations.phone, nunca una tabla paralela). */
export function getCostByPhone(phone: string): number {
  const row = ctx()
    .db.prepare(
      `SELECT COALESCE(SUM(uc.cost_usd), 0) AS c
       FROM usage_calls uc
       JOIN conversations c ON c.id = uc.conversation_id
       WHERE c.phone = ?`
    )
    .get(phone) as { c: number };
  return row.c;
}

export interface PurchaseConversionCost {
  conversationId: number;
  phone: string;
  costUsd: number;
}

/**
 * Costo externo real de las conversaciones que terminaron en handoff de
 * COMPRA real (derivarHumano con tipo:"compra", ver tool_events.detail) --
 * nunca "persona"/"reclamo"/"fuera_de_alcance", que son handoffs reales
 * pero no de compra.
 */
export function getCostByPurchaseConversion(): PurchaseConversionCost[] {
  return ctx()
    .db.prepare(
      `SELECT c.id AS conversationId, c.phone AS phone, COALESCE(SUM(uc.cost_usd), 0) AS costUsd
       FROM conversations c
       JOIN tool_events te ON te.conversation_id = c.id AND te.tool = 'derivarHumano' AND te.detail = 'compra'
       LEFT JOIN usage_calls uc ON uc.conversation_id = c.id
       GROUP BY c.id, c.phone`
    )
    .all() as PurchaseConversionCost[];
}

export function getInsight(periodKey: string): { data_json: string; created_at: number } | null {
  return (
    (ctx()
      .db.prepare("SELECT data_json, created_at FROM insights WHERE period_key = ?")
      .get(periodKey) as { data_json: string; created_at: number } | undefined) ?? null
  );
}

export function setInsight(periodKey: string, dataJson: string): void {
  ctx()
    .db.prepare(
      "INSERT INTO insights (period_key, data_json, created_at) VALUES (?, ?, unixepoch()) " +
        "ON CONFLICT(period_key) DO UPDATE SET data_json = excluded.data_json, created_at = unixepoch()"
    )
    .run(periodKey, dataJson);
}

export interface DayBucket {
  day: string; // YYYY-MM-DD (hora local)
  convos: number;
  userMsgs: number;
  botMsgs: number;
  leads: number;
  costUsd: number;
}

export interface AnalyticsData {
  days: DayBucket[];
  totals: {
    convos: number;
    userMsgs: number;
    botMsgs: number;
    leads: number;
    leadsConEmail: number;
    costUsd: number;
    inTokens: number;
    outTokens: number;
    avgRespSec: number | null;
  };
  funnel: { escribieron: number; email: number; enlace: number };
}

const DAY = "date(created_at, 'unixepoch', 'localtime')";

/** Agrega todas las métricas locales desde `sinceTs` (epoch s). */
export function getAnalytics(sinceTs: number): AnalyticsData {
  const db = ctx().db;
  const buckets = new Map<string, DayBucket>();
  const day = (d: string): DayBucket => {
    let b = buckets.get(d);
    if (!b) {
      b = { day: d, convos: 0, userMsgs: 0, botMsgs: 0, leads: 0, costUsd: 0 };
      buckets.set(d, b);
    }
    return b;
  };

  // Mensajes por día y rol
  for (const r of db
    .prepare(
      `SELECT ${DAY} AS d, role, COUNT(*) AS n FROM messages WHERE created_at >= ? GROUP BY d, role`
    )
    .all(sinceTs) as Array<{ d: string; role: string; n: number }>) {
    if (r.role === "user") day(r.d).userMsgs += r.n;
    else day(r.d).botMsgs += r.n;
  }

  // Conversaciones nuevas por día
  for (const r of db
    .prepare(`SELECT ${DAY} AS d, COUNT(*) AS n FROM conversations WHERE created_at >= ? GROUP BY d`)
    .all(sinceTs) as Array<{ d: string; n: number }>) {
    day(r.d).convos += r.n;
  }

  // Leads guardados por día
  for (const r of db
    .prepare(
      `SELECT ${DAY} AS d, COUNT(*) AS n FROM tool_events WHERE tool = 'guardarLead' AND created_at >= ? GROUP BY d`
    )
    .all(sinceTs) as Array<{ d: string; n: number }>) {
    day(r.d).leads += r.n;
  }

  // Coste por día -- usage_calls es la fuente de verdad real del costo LLM
  // (usage_calls.cost_usd, una fila por llamada real a OpenRouter con
  // usage:{include:true} -- ver openrouter.ts#trackCall), nunca la tabla
  // `usage` antigua que ya no refleja el costo real.
  for (const r of db
    .prepare(`SELECT ${DAY} AS d, SUM(cost_usd) AS c FROM usage_calls WHERE created_at >= ? GROUP BY d`)
    .all(sinceTs) as Array<{ d: string; c: number }>) {
    day(r.d).costUsd += r.c ?? 0;
  }

  const days = [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));

  const usageTot = db
    .prepare(
      "SELECT COALESCE(SUM(prompt_tokens),0) AS i, COALESCE(SUM(completion_tokens),0) AS o, COALESCE(SUM(cost_usd),0) AS c FROM usage_calls WHERE created_at >= ?"
    )
    .get(sinceTs) as { i: number; o: number; c: number };

  const leadsTot = db
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(has_email),0) AS e FROM tool_events WHERE tool='guardarLead' AND created_at >= ?"
    )
    .get(sinceTs) as { n: number; e: number };

  // Tiempo medio de respuesta: para cada mensaje del bot, segundos desde el
  // último mensaje del lead anterior en la misma conversación.
  const resp = db
    .prepare(
      `SELECT AVG(diff) AS avg FROM (
         SELECT m.created_at - (
           SELECT MAX(u.created_at) FROM messages u
           WHERE u.conversation_id = m.conversation_id AND u.role='user' AND u.created_at <= m.created_at
         ) AS diff
         FROM messages m
         WHERE m.role IN ('assistant','human') AND m.created_at >= ?
       ) WHERE diff IS NOT NULL AND diff >= 0 AND diff < 3600`
    )
    .get(sinceTs) as { avg: number | null };

  // Embudo
  const escribieron = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT conversation_id) AS n FROM messages WHERE role='user' AND created_at >= ?"
      )
      .get(sinceTs) as { n: number }
  ).n;
  const email = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT conversation_id) AS n FROM tool_events WHERE has_email=1 AND created_at >= ?"
      )
      .get(sinceTs) as { n: number }
  ).n;
  // Cuántas conversaciones recibieron el enlace de compra. Pon tu enlace en
  // CHECKOUT_URL; si no, cuenta cualquier enlace enviado por el agente.
  const linkMatch = process.env.CHECKOUT_URL ? `%${process.env.CHECKOUT_URL}%` : "%http%";
  const enlace = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT conversation_id) AS n FROM messages WHERE role IN ('assistant','human') AND created_at >= ? AND content LIKE ?"
      )
      .get(sinceTs, linkMatch) as { n: number }
  ).n;

  const totals = {
    convos: days.reduce((s, d) => s + d.convos, 0),
    userMsgs: days.reduce((s, d) => s + d.userMsgs, 0),
    botMsgs: days.reduce((s, d) => s + d.botMsgs, 0),
    leads: leadsTot.n,
    leadsConEmail: leadsTot.e,
    costUsd: usageTot.c,
    inTokens: usageTot.i,
    outTokens: usageTot.o,
    avgRespSec: resp.avg,
  };

  return { days, totals, funnel: { escribieron, email, enlace } };
}

// ============================================================
// Ajustes editables en caliente (modelo, pausa, buffer, audios...)
// ============================================================

export function getSetting(key: string): string | null {
  const r = ctx().db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  ctx()
    .db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = ctx().db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Mensajes de leads (role user) desde `sinceTs`, para clasificar dudas con IA. */
export function getUserMessagesSince(sinceTs: number, limit = 300): string[] {
  return (
    ctx()
      .db.prepare(
        "SELECT content FROM messages WHERE role='user' AND created_at >= ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(sinceTs, limit) as Array<{ content: string }>
  ).map((r) => r.content);
}
