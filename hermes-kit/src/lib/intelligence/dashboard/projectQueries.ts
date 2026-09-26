// projectQueries.ts — Selección y listado de proyectos para el Project
// Switcher del workspace COMERCIAL. Ningún cambio a projects.ts (MI-1):
// esto es solo lectura adicional necesaria para el Dashboard.
//
// El workspace comercial es una ALLOWLIST EXPLÍCITA
// (commercialProjects.ts), nunca una heurística: la BD real tiene ~3948
// proyectos, la inmensa mayoría fixtures de test acumulados de sesiones de
// test anteriores. listProjectsForSwitcher()/getDefaultProject() SOLO
// consultan dentro de esa allowlist -- ningún proyecto TEST/INTERNAL
// aparece nunca en el switcher comercial, sin necesidad de ocultarlos ni
// borrarlos de la base de datos (siguen ahí, intactos, fuera de esta vista).
//
// isLikelyTestProject() es un heurístico DECLARADO, independiente de la
// allowlist -- se conserva solo para etiquetar informativamente cualquier
// proyecto que se consulte por id fuera del workspace comercial (p.ej.
// diagnóstico), nunca para decidir inclusión en el switcher.
import { getDb } from "../connection";
import { COMMERCIAL_PROJECT_SLUGS } from "./commercialProjects";

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
 * Lista buscable de proyectos DENTRO del workspace comercial (allowlist
 * explícita) únicamente, con conteo real de items. `search` filtra por
 * nombre o slug (LIKE, sin motor de búsqueda nuevo) sobre ese subconjunto
 * -- nunca sobre la tabla completa de proyectos.
 */
export function listProjectsForSwitcher(options: { search?: string; limit?: number; offset?: number } = {}): ProjectListResult {
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  if (COMMERCIAL_PROJECT_SLUGS.length === 0) {
    return { total: 0, projects: [] };
  }

  const clauses: string[] = [`p.slug IN (${COMMERCIAL_PROJECT_SLUGS.map(() => "?").join(",")})`];
  const values: unknown[] = [...COMMERCIAL_PROJECT_SLUGS];
  if (options.search) {
    clauses.push("(p.name LIKE ? OR p.slug LIKE ?)");
    values.push(`%${options.search}%`, `%${options.search}%`);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;

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

/** Total real de proyectos en el Intelligence Store completo (comerciales + internos/test) -- solo para el aviso administrativo de Configuración, nunca listado individualmente. El conteo comercial ya lo da `listProjectsForSwitcher({}).total`, sin duplicar la consulta. */
export function countAllProjects(): number {
  const db = getDb();
  return db.prepare<[], { count: number }>("SELECT COUNT(*) as count FROM projects").get()!.count;
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

/**
 * Proyecto inicial por defecto -- exclusivamente dentro de la allowlist
 * comercial (commercialProjects.ts), nunca fuera de ella:
 * 1) "Vida Divina" por nombre, si está en la allowlist y existe;
 * 2) si no, el proyecto de la allowlist con más items reales;
 * 3) si la allowlist está vacía o ninguno de sus proyectos existe aún, null
 *    (estado vacío explícito -- nunca cae a un proyecto TEST/INTERNAL).
 * Nunca se inventa ni se crea un proyecto aquí.
 */
export function getDefaultProject(): ProjectListEntry | null {
  if (COMMERCIAL_PROJECT_SLUGS.length === 0) return null;
  const db = getDb();

  const byName = db
    .prepare<unknown[], { id: number }>(
      `SELECT id FROM projects
       WHERE slug IN (${COMMERCIAL_PROJECT_SLUGS.map(() => "?").join(",")})
         AND lower(name) IN (${PREFERRED_NAMES.map(() => "?").join(",")})
       LIMIT 1`
    )
    .get(...COMMERCIAL_PROJECT_SLUGS, ...PREFERRED_NAMES);
  if (byName) return getProjectByIdForSwitcher(byName.id);

  const candidates = db
    .prepare<unknown[], { id: number }>(
      `SELECT p.id
       FROM projects p
       WHERE p.slug IN (${COMMERCIAL_PROJECT_SLUGS.map(() => "?").join(",")})
       ORDER BY (SELECT COUNT(*) FROM intelligence_items i WHERE i.project_id = p.id) DESC, p.created_at ASC`
    )
    .all(...COMMERCIAL_PROJECT_SLUGS);

  if (candidates.length === 0) return null;
  return getProjectByIdForSwitcher(candidates[0].id);
}
