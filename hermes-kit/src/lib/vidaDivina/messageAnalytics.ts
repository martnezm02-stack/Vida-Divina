// messageAnalytics.ts — Analítica de interacciones por producto (Fase
// "Analytics admin de interacciones por producto", 2026-09-17).
//
// Fuente de verdad: el SQLite REAL de WhatsApp (data/messages.db) -- NUNCA
// el espejo parcial de PostgreSQL (`messages`/`conversations` ahí solo se
// llenan cuando hay un handoff, ver crm/repositories/messageRepository.js).
// Conexión de solo lectura, independiente de la conexión de escritura de
// `db.ts` -- no toca su contexto compartido ni sus prepared statements.
//
// Producto: reutiliza el catálogo real ya existente (`searchKnowledge`),
// nunca un catálogo/alias paralelo. Las "variantes razonables" del nombre
// (ej. "Ripped" / "cápsulas Ripped") se resuelven con las mismas palabras
// distintivas reales del título/keywords del producto (mismo criterio que
// `PALABRAS_VACIAS` en productKnowledge.ts), nunca una lista de sinónimos
// inventada aparte.
//
// SQL siempre parametrizado (`?`), nunca construido con texto libre del
// LLM: el LLM solo elige QUÉ producto y QUÉ rango, nunca cómo se consulta
// la base (mismo criterio que crm/repositories/reportingRepository.js).

import Database from "better-sqlite3";
import path from "node:path";
import { searchKnowledge, PALABRAS_VACIAS } from "./productKnowledge";

const DB_PATH = path.resolve(process.cwd(), "data", "messages.db");

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Palabras realmente distintivas del producto (título + palabras clave reales) -- nunca genéricas de presentación. */
function tokensDistintivos(titulo: string, palabrasClave: string[]): string[] {
  const crudos = [titulo, ...palabrasClave].flatMap((t) => normalizar(t).split(/[^a-z0-9]+/));
  const distintivos = crudos.filter((t) => t.length >= 4 && !PALABRAS_VACIAS.has(t));
  return [...new Set(distintivos)];
}

export interface MensajeInteraccion {
  conversationId: number;
  phone: string;
  nombre: string | null;
  content: string;
  createdAt: number; // epoch real (unixepoch), igual que messages.created_at
}

export type InteraccionesPorProductoResult =
  | {
      ok: true;
      productoId: string;
      tituloProducto: string;
      desde: string; // ISO real solicitado
      hasta: string; // ISO real solicitado
      clientesUnicos: number;
      totalMensajes: number;
      totalConversaciones: number;
      mensajes: MensajeInteraccion[];
    }
  | { ok: false; reason: string };

/**
 * Cuenta clientes REALES únicos (por teléfono) que preguntaron/mencionaron
 * un producto real en mensajes de CLIENTE (role='user', nunca del bot) en
 * un rango de fechas real -- sobre el SQLite real de WhatsApp, nunca el
 * espejo parcial de Postgres. Nunca aproxima ni infiere: si el producto no
 * se encuentra en el catálogo real, devuelve `ok:false` con el motivo.
 *
 * `dbPath` es SOLO para pruebas (apuntar a un SQLite de prueba aislado) --
 * en producción nunca se pasa, y por defecto usa siempre el `data/messages.db` real.
 */
export async function consultarInteraccionesPorProducto(input: {
  producto: string;
  desde: Date;
  hasta: Date;
  limiteMensajes?: number;
  dbPath?: string;
}): Promise<InteraccionesPorProductoResult> {
  const hits = await searchKnowledge(input.producto, { limit: 1 });
  const hit = hits[0];
  if (!hit) {
    return { ok: false, reason: `No se encontró ningún producto real que coincida con "${input.producto}" en el catálogo (docs/productos/).` };
  }

  const tokens = tokensDistintivos(hit.titulo, hit.palabrasClave);
  if (tokens.length === 0) {
    return { ok: false, reason: `El producto "${hit.titulo}" no tiene ninguna palabra distintiva real para buscar en los mensajes.` };
  }

  const desdeEpoch = Math.floor(input.desde.getTime() / 1000);
  const hastaEpoch = Math.floor(input.hasta.getTime() / 1000);
  const condiciones = tokens.map(() => "lower(m.content) LIKE ?").join(" OR ");
  const params = tokens.map((t) => `%${t}%`);

  const db = new Database(input.dbPath ?? DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const filas = db
      .prepare(
        `SELECT m.id AS messageId, m.conversation_id AS conversationId, m.content AS content,
                m.created_at AS createdAt, c.phone AS phone, c.name AS nombre
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.role = 'user'
           AND m.created_at >= ? AND m.created_at < ?
           AND (${condiciones})
         ORDER BY m.created_at ASC`
      )
      .all(desdeEpoch, hastaEpoch, ...params) as Array<{
      messageId: number;
      conversationId: number;
      content: string;
      createdAt: number;
      phone: string;
      nombre: string | null;
    }>;

    const clientesUnicos = new Set(filas.map((f) => f.phone)).size;
    const conversacionesUnicas = new Set(filas.map((f) => f.conversationId)).size;
    const limite = input.limiteMensajes ?? 50;

    return {
      ok: true,
      productoId: hit.id,
      tituloProducto: hit.titulo,
      desde: input.desde.toISOString(),
      hasta: input.hasta.toISOString(),
      clientesUnicos,
      totalMensajes: filas.length,
      totalConversaciones: conversacionesUnicas,
      mensajes: filas.slice(0, limite).map((f) => ({
        conversationId: f.conversationId,
        phone: f.phone,
        nombre: f.nombre,
        content: f.content,
        createdAt: f.createdAt,
      })),
    };
  } finally {
    db.close();
  }
}
