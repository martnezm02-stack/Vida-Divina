// reportingRepository.js
// FASE "Attribution + Reporting + Email MCP + Alerta WhatsApp" (2026-09-04).
//
// Reporting administrativo, SOLO LECTURA, sobre las tablas ya existentes
// del CRM (customers, opportunities, handoffs) -- ningún dato nuevo, ningún
// motor de reporting paralelo. Todas las consultas son SQL parametrizado
// FIJO en este archivo -- el LLM nunca construye ni envía SQL: solo elige
// QUÉ función llamar y con qué rango de fechas (ver
// hermes-kit/src/lib/tools/admin.ts#adminGenerarReporte), nunca cómo se
// consulta la base.
//
// "Ventas" real: el CRM hoy NO tiene tablas orders/payments (bloqueadas por
// decisión de negocio pendiente, docs/proceso_de_venta/pago_y_pedido.md).
// Este archivo NUNCA aproxima una venta confirmada -- topProductsByPurchaseIntent
// devuelve oportunidades con intencion_compra=true, marcadas explícitamente
// como intención, no como venta cerrada.
//
// FILTRO POR SOURCE (fix 2026-09-18, auditoría de persistencia): customers/
// opportunities/handoffs no tienen columna `source` propia -- ese origen
// (REAL/SIMULATED/TEST/FIXTURE/UNKNOWN) vive únicamente en
// conversations.source (migración 0002). Antes de este fix, todas las
// funciones de abajo agregaban sobre esas tablas SIN pasar por
// conversations, así que un lead/handoff/cliente escrito con
// source='TEST' (ver hermes-kit/src/lib/vidaDivina/crmClient.ts#HERMES_SOURCE)
// se contaba igual que uno real -- contaminando los KPIs del Dashboard.
//
// Se reutiliza EXACTAMENTE el mecanismo que ya existe en
// dashboard/server/routes/whatsapp.js (Fase 16, Parte 4/6): mismo campo
// (`conversations.source`), mismo vocabulario (CONVERSATION_SOURCES, sin
// inventar uno nuevo) y mismo default ('REAL') -- nunca se asume que algo
// es real si nadie lo declaró así al crear la conversación. `source: 'ALL'`
// (el mismo valor especial que ya usa whatsapp.js) desactiva el filtro y
// reproduce el comportamiento exacto de antes de este fix, para quien
// necesite ver el total sin distinguir origen.
//
// customers/opportunities/handoffs no tienen conversation_id todos por
// igual: opportunities y handoffs SÍ (columna directa, Fase A §12/§15) --
// para esos se hace JOIN. customers NO tiene conversation_id (es al revés:
// conversations.customer_id) -- para esos se usa EXISTS, porque un
// customer puede tener más de una conversation y no se quiere duplicar
// filas por un COUNT/GROUP BY mal hecho.

import { CONVERSATION_SOURCES } from './conversationRepository.js';

const REPORTING_SOURCE_FILTERS = Object.freeze(['ALL', ...CONVERSATION_SOURCES]);

/** @param {string} source */
function assertSourceFiltro(source) {
  if (!REPORTING_SOURCE_FILTERS.includes(source)) {
    throw new Error(`reportingRepository: "source" inválido "${source}" (válidos: ${REPORTING_SOURCE_FILTERS.join(', ')}).`);
  }
}

/**
 * @param {{query: Function}} db
 * @param {{since: Date, until: Date, source?: string}} rango
 * @returns {Promise<number>}
 */
export async function countNewCustomers(db, { since, until, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM customers WHERE created_at >= $1 AND created_at < $2',
      [since, until]
    );
    return rows[0].n;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM customers c
     WHERE c.created_at >= $1 AND c.created_at < $2
       AND EXISTS (
         SELECT 1 FROM conversations conv
         WHERE conv.customer_id = c.customer_id AND conv.source = $3
       )`,
    [since, until, source]
  );
  return rows[0].n;
}

/** Leads = oportunidades creadas en el rango (una oportunidad real ya es "alguien mostró interés por un producto real"). */
export async function countLeads(db, { since, until, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM opportunities WHERE created_at >= $1 AND created_at < $2',
      [since, until]
    );
    return rows[0].n;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM opportunities o
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.created_at >= $1 AND o.created_at < $2 AND conv.source = $3`,
    [since, until, source]
  );
  return rows[0].n;
}

/** Calificados = oportunidades con intención de compra real marcada. */
export async function countQualifiedLeads(db, { since, until, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM opportunities WHERE created_at >= $1 AND created_at < $2 AND intencion_compra = true',
      [since, until]
    );
    return rows[0].n;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM opportunities o
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.created_at >= $1 AND o.created_at < $2 AND o.intencion_compra = true AND conv.source = $3`,
    [since, until, source]
  );
  return rows[0].n;
}

export async function countHandoffs(db, { since, until, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM handoffs WHERE creado_en >= $1 AND creado_en < $2',
      [since, until]
    );
    return rows[0].n;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM handoffs h
     JOIN conversations conv ON conv.conversation_id = h.conversation_id
     WHERE h.creado_en >= $1 AND h.creado_en < $2 AND conv.source = $3`,
    [since, until, source]
  );
  return rows[0].n;
}

export async function countOpenHandoffs(db, { since, until, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM handoffs WHERE creado_en >= $1 AND creado_en < $2 AND resuelto_en IS NULL',
      [since, until]
    );
    return rows[0].n;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM handoffs h
     JOIN conversations conv ON conv.conversation_id = h.conversation_id
     WHERE h.creado_en >= $1 AND h.creado_en < $2 AND h.resuelto_en IS NULL AND conv.source = $3`,
    [since, until, source]
  );
  return rows[0].n;
}

export async function listOpportunities(db, { since, until, limit = 100, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      `SELECT * FROM opportunities WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`,
      [since, until, limit]
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT o.* FROM opportunities o
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.created_at >= $1 AND o.created_at < $2 AND conv.source = $3
     ORDER BY o.created_at DESC LIMIT $4`,
    [since, until, source, limit]
  );
  return rows;
}

/**
 * Productos con más INTENCIÓN de compra real en el rango -- nunca "más
 * vendidos" (no hay tabla de ventas confirmadas todavía).
 * @returns {Promise<Array<{productoId: string, intentos: number}>>}
 */
export async function topProductsByPurchaseIntent(db, { since, until, limit = 10, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      `SELECT producto_id AS "productoId", COUNT(*)::int AS intentos
       FROM opportunities
       WHERE created_at >= $1 AND created_at < $2 AND intencion_compra = true
       GROUP BY producto_id
       ORDER BY intentos DESC
       LIMIT $3`,
      [since, until, limit]
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT o.producto_id AS "productoId", COUNT(*)::int AS intentos
     FROM opportunities o
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.created_at >= $1 AND o.created_at < $2 AND o.intencion_compra = true AND conv.source = $3
     GROUP BY o.producto_id
     ORDER BY intentos DESC
     LIMIT $4`,
    [since, until, source, limit]
  );
  return rows;
}

const TOUCH_COLUMNS = Object.freeze({
  platform: { first: 'first_touch_platform', last: 'last_touch_platform' },
  source: { first: 'first_touch_source', last: 'last_touch_source' },
  medium: { first: 'first_touch_medium', last: 'last_touch_medium' },
  campaign: { first: 'first_touch_campaign', last: 'last_touch_campaign' },
  campaignId: { first: 'first_touch_campaign_id', last: 'last_touch_campaign_id' },
  contentId: { first: 'first_touch_content_id', last: 'last_touch_content_id' },
});

/**
 * Desglose real de clientes NUEVOS del rango por una dimensión de
 * atribución (platform/source/campaign/contentId...), en first_touch o
 * last_touch. "unknown" agrupa a quienes no tienen ese dato real -- nunca
 * se omiten ni se inventan.
 * @param {'platform'|'source'|'medium'|'campaign'|'campaignId'|'contentId'} dimension
 * @param {'first'|'last'} touch
 * @param {string} [source] - filtro por conversations.source (ver cabecera del archivo), default 'REAL'.
 */
export async function attributionBreakdown(db, { since, until, dimension, touch = 'first', limit = 20, source = 'REAL' }) {
  const columna = TOUCH_COLUMNS[dimension]?.[touch];
  if (!columna) throw new Error(`reportingRepository.attributionBreakdown: dimensión/touch inválido ("${dimension}"/"${touch}").`);
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      `SELECT COALESCE(${columna}, 'unknown') AS valor, COUNT(*)::int AS n
       FROM customers
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY valor
       ORDER BY n DESC
       LIMIT $3`,
      [since, until, limit]
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT COALESCE(${columna}, 'unknown') AS valor, COUNT(*)::int AS n
     FROM customers c
     WHERE c.created_at >= $1 AND c.created_at < $2
       AND EXISTS (
         SELECT 1 FROM conversations conv
         WHERE conv.customer_id = c.customer_id AND conv.source = $4
       )
     GROUP BY valor
     ORDER BY n DESC
     LIMIT $3`,
    [since, until, limit, source]
  );
  return rows;
}

/**
 * Cruce real: para un producto dado, cuántas oportunidades con intención de
 * compra real tienen cada origen de contenido real (first_touch_content_id
 * del customer dueño de la oportunidad). Responde "¿qué contenido generó
 * más intención de compra de producto X?" -- nunca inventa una atribución
 * si el customer no tiene content_id real (se agrupa como 'unknown').
 */
export async function contentAttributionForProduct(db, { productoId, since, until, limit = 20, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      `SELECT COALESCE(c.first_touch_content_id, 'unknown') AS "contentId",
              COALESCE(c.first_touch_platform, 'unknown') AS platform,
              COUNT(*)::int AS intentos
       FROM opportunities o
       JOIN customers c ON c.customer_id = o.customer_id
       WHERE o.producto_id = $1 AND o.intencion_compra = true
         AND o.created_at >= $2 AND o.created_at < $3
       GROUP BY "contentId", platform
       ORDER BY intentos DESC
       LIMIT $4`,
      [productoId, since, until, limit]
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT COALESCE(c.first_touch_content_id, 'unknown') AS "contentId",
            COALESCE(c.first_touch_platform, 'unknown') AS platform,
            COUNT(*)::int AS intentos
     FROM opportunities o
     JOIN customers c ON c.customer_id = o.customer_id
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.producto_id = $1 AND o.intencion_compra = true
       AND o.created_at >= $2 AND o.created_at < $3
       AND conv.source = $5
     GROUP BY "contentId", platform
     ORDER BY intentos DESC
     LIMIT $4`,
    [productoId, since, until, limit, source]
  );
  return rows;
}

/** Clientes reales de una plataforma real dada que tienen intención de compra de un producto real dado. */
export async function customersByPlatformAndProduct(db, { platform, productoId, since, until, limit = 100, source = 'REAL' }) {
  assertSourceFiltro(source);
  if (source === 'ALL') {
    const { rows } = await db.query(
      `SELECT c.customer_id AS "customerId", c.nombre, o.producto_id AS "productoId", o.created_at AS "createdAt"
       FROM opportunities o
       JOIN customers c ON c.customer_id = o.customer_id
       WHERE o.producto_id = $1 AND o.intencion_compra = true
         AND o.created_at >= $2 AND o.created_at < $3
         AND (c.first_touch_platform = $4 OR c.last_touch_platform = $4)
       ORDER BY o.created_at DESC
       LIMIT $5`,
      [productoId, since, until, platform, limit]
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT c.customer_id AS "customerId", c.nombre, o.producto_id AS "productoId", o.created_at AS "createdAt"
     FROM opportunities o
     JOIN customers c ON c.customer_id = o.customer_id
     JOIN conversations conv ON conv.conversation_id = o.conversation_id
     WHERE o.producto_id = $1 AND o.intencion_compra = true
       AND o.created_at >= $2 AND o.created_at < $3
       AND (c.first_touch_platform = $4 OR c.last_touch_platform = $4)
       AND conv.source = $6
     ORDER BY o.created_at DESC
     LIMIT $5`,
    [productoId, since, until, platform, limit, source]
  );
  return rows;
}
