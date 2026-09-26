// commercialProjects.ts — Allowlist EXPLÍCITA de proyectos comerciales
// reales del workspace "AI Marketing Intelligence & Growth OS". Nunca una
// heurística (isLikelyTestProject sigue existiendo solo como ETIQUETA
// informativa en proyectos fuera de esta lista, nunca como criterio de
// inclusión aquí).
//
// Inspección real de intelligence.db (2026-09-26): de los proyectos
// nominalmente esperados -- Vida Divina, IA Trading, Market Intelligence --
// solo "Vida Divina" existe con evidencia real (slug "vida-divina",
// bootstrap 588ecac). Ninguna búsqueda por nombre/slug ("ia trad%",
// "market intelligence", "cliente%") encontró un proyecto real para los
// otros dos -- solo coincidencias con el patrón "trading-<uuid>" de
// fixtures de test (mismo patrón ya documentado en projectQueries.ts).
// Por eso NO aparecen aquí: no se inventan.
//
// Agregar un proyecto comercial nuevo a este workspace es agregar su slug
// aquí DESPUÉS de crearlo con getOrCreateProject (mismo patrón que
// scripts/bootstrapVidaDivinaProject.ts) -- nunca antes, nunca por
// heurística de nombre.
export const COMMERCIAL_PROJECT_SLUGS: readonly string[] = ["vida-divina"];

export function isCommercialProjectSlug(slug: string): boolean {
  return COMMERCIAL_PROJECT_SLUGS.includes(slug);
}
