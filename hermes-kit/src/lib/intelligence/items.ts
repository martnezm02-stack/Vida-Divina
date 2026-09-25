// items.ts — Intelligence Item: la unidad principal investigada (anuncio,
// publicación, video, contenido de creador...). Incluye clasificación
// creativa y elementos creativos (1:1, embebidos como columnas -- ver
// schema.ts) y el cálculo de active_days, siempre derivado.
import { getDb } from "./connection";
import type {
  IntelligenceItem,
  IntelligenceItemInput,
  IntelligenceItemSearchFilter,
  IntelligenceItemUpdate,
  IntelligenceItemWithDerived,
} from "./types";

const UPDATABLE_COLUMNS = [
  "actor_id",
  "canonical_url",
  "content_type",
  "title",
  "description",
  "published_at",
  "format",
  "style",
  "theme",
  "market",
  "audience",
  "objective",
  "product",
  "funnel_stage",
  "language",
  "media_type",
  "hook",
  "angle",
  "problem",
  "mechanism",
  "promise",
  "cta",
  "offer",
  "social_proof",
] as const;

/** active_days siempre se deriva de last_seen_at - first_seen_at -- nunca se almacena. */
export function withActiveDays(item: IntelligenceItem): IntelligenceItemWithDerived {
  const activeDays = Math.max(
    0,
    Math.floor((item.last_seen_at - item.first_seen_at) / 86400)
  );
  return { ...item, active_days: activeDays };
}

/**
 * Crea un intelligence item, o si ya existe uno idéntico por identidad
 * (project_id + source_id + external_id, o si falta external_id por
 * project_id + canonical_url), lo "toca": extiende last_seen_at al máximo
 * observado y aplica los campos no nulos recibidos como actualización --
 * nunca duplica una fila para el mismo contenido.
 */
export function upsertIntelligenceItem(
  input: IntelligenceItemInput
): { item: IntelligenceItemWithDerived; created: boolean } {
  const db = getDb();

  const existing = findExistingItem(input);
  const tagsJson = input.tags !== undefined ? JSON.stringify(input.tags) : null;
  const metadataJson = input.metadata !== undefined ? JSON.stringify(input.metadata) : null;

  if (existing) {
    const lastSeen = Math.max(existing.last_seen_at, input.last_seen_at ?? nowSeconds());
    const firstSeen = Math.min(existing.first_seen_at, input.first_seen_at ?? existing.first_seen_at);

    db.prepare(
      `UPDATE intelligence_items SET
        actor_id = COALESCE(?, actor_id),
        canonical_url = COALESCE(?, canonical_url),
        content_type = COALESCE(?, content_type),
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        published_at = COALESCE(?, published_at),
        format = COALESCE(?, format),
        style = COALESCE(?, style),
        theme = COALESCE(?, theme),
        market = COALESCE(?, market),
        audience = COALESCE(?, audience),
        objective = COALESCE(?, objective),
        product = COALESCE(?, product),
        funnel_stage = COALESCE(?, funnel_stage),
        language = COALESCE(?, language),
        media_type = COALESCE(?, media_type),
        hook = COALESCE(?, hook),
        angle = COALESCE(?, angle),
        problem = COALESCE(?, problem),
        mechanism = COALESCE(?, mechanism),
        cta = COALESCE(?, cta),
        offer = COALESCE(?, offer),
        social_proof = COALESCE(?, social_proof),
        tags_json = COALESCE(?, tags_json),
        metadata_json = COALESCE(?, metadata_json),
        first_seen_at = ?,
        last_seen_at = ?,
        updated_at = unixepoch()
      WHERE id = ?`
    ).run(
      input.actor_id ?? null,
      input.canonical_url ?? null,
      input.content_type ?? null,
      input.title ?? null,
      input.description ?? null,
      input.published_at ?? null,
      input.format ?? null,
      input.style ?? null,
      input.theme ?? null,
      input.market ?? null,
      input.audience ?? null,
      input.objective ?? null,
      input.product ?? null,
      input.funnel_stage ?? null,
      input.language ?? null,
      input.media_type ?? null,
      input.hook ?? null,
      input.angle ?? null,
      input.problem ?? null,
      input.mechanism ?? null,
      input.cta ?? null,
      input.offer ?? null,
      input.social_proof ?? null,
      tagsJson,
      metadataJson,
      firstSeen,
      lastSeen,
      existing.id
    );
    return { item: withActiveDays(getIntelligenceItemById(existing.id)!), created: false };
  }

  const firstSeen = input.first_seen_at ?? nowSeconds();
  const lastSeen = input.last_seen_at ?? firstSeen;

  const info = db
    .prepare(
      `INSERT INTO intelligence_items (
        project_id, source_id, actor_id, external_id, canonical_url, content_type,
        title, description, published_at, first_seen_at, last_seen_at,
        format, style, theme, market, audience, objective, product, funnel_stage,
        language, media_type,
        hook, angle, problem, mechanism, cta, offer, social_proof,
        tags_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.project_id,
      input.source_id,
      input.actor_id ?? null,
      input.external_id ?? null,
      input.canonical_url ?? null,
      input.content_type,
      input.title ?? null,
      input.description ?? null,
      input.published_at ?? null,
      firstSeen,
      lastSeen,
      input.format ?? null,
      input.style ?? null,
      input.theme ?? null,
      input.market ?? null,
      input.audience ?? null,
      input.objective ?? null,
      input.product ?? null,
      input.funnel_stage ?? null,
      input.language ?? null,
      input.media_type ?? null,
      input.hook ?? null,
      input.angle ?? null,
      input.problem ?? null,
      input.mechanism ?? null,
      input.cta ?? null,
      input.offer ?? null,
      input.social_proof ?? null,
      tagsJson,
      metadataJson
    );

  return {
    item: withActiveDays(getIntelligenceItemById(info.lastInsertRowid as number)!),
    created: true,
  };
}

function findExistingItem(input: IntelligenceItemInput): IntelligenceItem | null {
  const db = getDb();
  if (input.external_id) {
    const byExternalId = db
      .prepare<[number, number, string], IntelligenceItem>(
        `SELECT * FROM intelligence_items
         WHERE project_id = ? AND source_id = ? AND external_id = ?`
      )
      .get(input.project_id, input.source_id, input.external_id);
    if (byExternalId) return byExternalId;
  }
  if (input.canonical_url) {
    const byUrl = db
      .prepare<[number, string], IntelligenceItem>(
        `SELECT * FROM intelligence_items WHERE project_id = ? AND canonical_url = ?`
      )
      .get(input.project_id, input.canonical_url);
    if (byUrl) return byUrl;
  }
  return null;
}

export function getIntelligenceItemById(id: number): IntelligenceItem | null {
  return (
    getDb()
      .prepare<[number], IntelligenceItem>("SELECT * FROM intelligence_items WHERE id = ?")
      .get(id) ?? null
  );
}

export function updateIntelligenceItem(
  id: number,
  update: IntelligenceItemUpdate
): IntelligenceItemWithDerived | null {
  const db = getDb();
  const existing = getIntelligenceItemById(id);
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const col of UPDATABLE_COLUMNS) {
    if (col in update && (update as Record<string, unknown>)[col] !== undefined) {
      setClauses.push(`${col} = ?`);
      values.push((update as Record<string, unknown>)[col]);
    }
  }
  if (update.tags !== undefined) {
    setClauses.push("tags_json = ?");
    values.push(JSON.stringify(update.tags));
  }
  if (update.metadata !== undefined) {
    setClauses.push("metadata_json = ?");
    values.push(JSON.stringify(update.metadata));
  }
  if (update.first_seen_at !== undefined) {
    setClauses.push("first_seen_at = ?");
    values.push(update.first_seen_at);
  }
  if (update.last_seen_at !== undefined) {
    setClauses.push("last_seen_at = ?");
    values.push(update.last_seen_at);
  }

  if (setClauses.length === 0) return withActiveDays(existing);

  setClauses.push("updated_at = unixepoch()");
  values.push(id);

  db.prepare(`UPDATE intelligence_items SET ${setClauses.join(", ")} WHERE id = ?`).run(
    ...(values as [])
  );
  return withActiveDays(getIntelligenceItemById(id)!);
}

export function searchIntelligenceItems(
  filter: IntelligenceItemSearchFilter
): IntelligenceItemWithDerived[] {
  const db = getDb();
  const clauses: string[] = ["project_id = ?"];
  const values: unknown[] = [filter.project_id];

  const eqFilters: Array<[keyof IntelligenceItemSearchFilter, string]> = [
    ["source_id", "source_id"],
    ["actor_id", "actor_id"],
    ["content_type", "content_type"],
    ["market", "market"],
    ["audience", "audience"],
    ["format", "format"],
    ["style", "style"],
    ["funnel_stage", "funnel_stage"],
    ["hook", "hook"],
    ["angle", "angle"],
  ];
  for (const [key, column] of eqFilters) {
    if (filter[key] !== undefined) {
      clauses.push(`${column} = ?`);
      values.push(filter[key]);
    }
  }
  if (filter.tag !== undefined) {
    clauses.push("tags_json LIKE ?");
    values.push(`%${JSON.stringify(filter.tag).slice(1, -1)}%`);
  }
  if (filter.published_after !== undefined) {
    clauses.push("published_at >= ?");
    values.push(filter.published_after);
  }
  if (filter.published_before !== undefined) {
    clauses.push("published_at <= ?");
    values.push(filter.published_before);
  }
  if (filter.first_seen_after !== undefined) {
    clauses.push("first_seen_at >= ?");
    values.push(filter.first_seen_after);
  }
  if (filter.last_seen_after !== undefined) {
    clauses.push("last_seen_at >= ?");
    values.push(filter.last_seen_after);
  }
  if (filter.min_active_days !== undefined) {
    clauses.push("(last_seen_at - first_seen_at) >= ?");
    values.push(filter.min_active_days * 86400);
  }

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const rows = db
    .prepare<unknown[], IntelligenceItem>(
      `SELECT * FROM intelligence_items
       WHERE ${clauses.join(" AND ")}
       ORDER BY last_seen_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return rows.map(withActiveDays);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
