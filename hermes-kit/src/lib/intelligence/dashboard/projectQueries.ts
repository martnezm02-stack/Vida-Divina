// projectQueries.ts — Selección y listado de proyectos para el Project
// Switcher. Ningún cambio a projects.ts (MI-1): esto es solo lectura
// adicional necesaria para el Dashboard (búsqueda + límite, porque
// listProjects() devuelve TODOS los proyectos sin paginar -- en la BD real
// hay miles de proyectos de prueba acumulados de sesiones de test
// anteriores, y renderizarlos todos en el switcher rompe la UI).
//
// "Vida Divina" NUNCA se hardcodea como project_id. Solo se usa su NOMBRE
// como preferencia de selección inicial, y solo si un proyecto con ese
// nombre existe REALMENTE en la tabla projects -- nunca se crea ni se
// simula. isLikelyTestProject() es un heurístico DECLARADO (no hay ninguna
// columna real que distinga proyectos de prueba de reales todavía) --
// se usa exclusivamente para una etiqueta visual en el switcher, nunca para
// ocultar, excluir ni borrar proyectos.
import { getDb } from "../connection";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Prefijos/sufijos observados REALMENTE en los slugs de proyectos creados
// por las suites de test de este repo (getOrCreateProject(`algo-${randomUUID()}`)
// en decenas de archivos de test) -- no son una convención de producto,
// son un patrón de fixture observado en los datos reales de intelligence.db.
const TEST_PREFIXES = [
  "demo-",
  "test-",
  "proj-",
  "ig-",
  "multisource-",
  "overview-",
  "mi-list-",
  "mi-",
  "trace-",
  "pred-",
  "ep-",
  "dispatch",
  "handler",
];

export function isLikelyTestProject(slug: string): boolean {
  const s = slug.toLowerCase();
  if (UUID_RE.test(s)) return true;
  if (TEST_PREFIXES.some((prefix) => s.startsWith(prefix))) return true;
  if (s.endsWith("-test") || s.endsWith("-check") || s.includes("cross-platform-test")) return true;
  return false;
}

export interface ProjectListEntry {
  id: number;
  slug: string;
  name: string;
  createdAt: number;
  itemCount: number;
  isLikelyTest: boolean;
}

export interface ProjectListResult {
  projects: ProjectListEntry[];
  total: number;
}

/**
 * Lista paginada/buscable de proyectos, con conteo real de items (nunca
 * fabricado) para poder ordenar por actividad real. `search` filtra por
 * nombre o slug (LIKE, sin motor de búsqueda nuevo).
 */
export function listProjectsForSwitcher(options: { search?: string; limit?: number; offset?: number } = {}): ProjectListResult {
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const clauses: string[] = [];
  const values: unknown[] = [];
  if (options.search) {
    clauses.push("(p.name LIKE ? OR p.slug LIKE ?)");
    values.push(`%${options.search}%`, `%${options.search}%`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const totalRow = db
    .prepare<unknown[], { count: number }>(`SELECT COUNT(*) as count FROM projects p ${where}`)
    .get(...values);

  const rows = db
    .prepare<unknown[], { id: number; slug: string; name: string; created_at: number; item_count: number }>(
      `SELECT p.id, p.slug, p.name, p.created_at,
              (SELECT COUNT(*) FROM intelligence_items i WHERE i.project_id = p.id) as item_count
       FROM projects p
       ${where}
       ORDER BY item_count DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    total: totalRow?.count ?? 0,
    projects: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      createdAt: r.created_at,
      itemCount: r.item_count,
      isLikelyTest: isLikelyTestProject(r.slug),
    })),
  };
}

export function getProjectByIdForSwitcher(id: number): ProjectListEntry | null {
  const db = getDb();
  const row = db
    .prepare<[number], { id: number; slug: string; name: string; created_at: number; item_count: number }>(
      `SELECT p.id, p.slug, p.name, p.created_at,
              (SELECT COUNT(*) FROM intelligence_items i WHERE i.project_id = p.id) as item_count
       FROM projects p WHERE p.id = ?`
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    itemCount: row.item_count,
    isLikelyTest: isLikelyTestProject(row.slug),
  };
}

const PREFERRED_NAMES = ["vida divina"];
const PREFERRED_SLUGS = ["vida-divina", "vida_divina"];

/**
 * Proyecto inicial por defecto -- NUNCA hardcodea un project_id:
 * 1) un proyecto real llamado (por nombre o slug) "Vida Divina", si existe;
 * 2) si no, el proyecto NO heurísticamente de prueba con más items reales;
 * 3) si todos parecen de prueba, el que tenga más items reales en general;
 * 4) si absolutamente ninguno tiene items, el primero creado (fallback final).
 * Nunca se inventa un proyecto ni se crea uno nuevo aquí.
 */
export function getDefaultProject(): ProjectListEntry | null {
  const db = getDb();

  const byName = db
    .prepare<unknown[], { id: number }>(
      `SELECT id FROM projects WHERE lower(name) IN (${PREFERRED_NAMES.map(() => "?").join(",")})
         OR lower(slug) IN (${PREFERRED_SLUGS.map(() => "?").join(",")}) LIMIT 1`
    )
    .get(...PREFERRED_NAMES, ...PREFERRED_SLUGS);
  if (byName) return getProjectByIdForSwitcher(byName.id);

  const candidates = db
    .prepare<[], { id: number; slug: string; item_count: number }>(
      `SELECT p.id, p.slug, (SELECT COUNT(*) FROM intelligence_items i WHERE i.project_id = p.id) as item_count
       FROM projects p
       ORDER BY item_count DESC, p.created_at ASC`
    )
    .all();

  if (candidates.length === 0) return null;

  const realCandidate = candidates.find((c) => !isLikelyTestProject(c.slug) && c.item_count > 0);
  if (realCandidate) return getProjectByIdForSwitcher(realCandidate.id);

  const anyWithItems = candidates.find((c) => c.item_count > 0);
  if (anyWithItems) return getProjectByIdForSwitcher(anyWithItems.id);

  return getProjectByIdForSwitcher(candidates[0].id);
}
