// projectQueries.test.ts — Selección/listado de proyectos para el
// workspace COMERCIAL del Project Switcher. Cubre el bug real reportado en
// runtime: el switcher mostraba miles de proyectos TEST/INTERNAL (la BD
// real acumula ~3948). La corrección es una ALLOWLIST EXPLÍCITA
// (commercialProjects.ts) -- listProjectsForSwitcher()/getDefaultProject()
// NUNCA buscan fuera de ella, sin importar cuántos proyectos existan en la
// tabla completa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem } from "../../../src/lib/intelligence";
import { listProjectsForSwitcher, getDefaultProject, isLikelyTestProject } from "../../../src/lib/intelligence/dashboard/projectQueries";
import { COMMERCIAL_PROJECT_SLUGS } from "../../../src/lib/intelligence/dashboard/commercialProjects";

test("COMMERCIAL_PROJECT_SLUGS: allowlist explícita, no vacía, contiene 'vida-divina' -- ningún otro slug supuesto (ia-trading/market-intelligence) se inventó sin evidencia real", () => {
  assert.ok(COMMERCIAL_PROJECT_SLUGS.includes("vida-divina"));
  assert.equal(COMMERCIAL_PROJECT_SLUGS.length, 1, "hoy solo Vida Divina tiene evidencia real -- IA Trading/Market Intelligence no existen todavía, no se agregan por adelantado");
});

test("isLikelyTestProject: heurístico informativo, independiente de la allowlist -- detecta patrones reales de fixtures", () => {
  assert.equal(isLikelyTestProject("demo-instagram-real-db-check"), true);
  assert.equal(isLikelyTestProject(`proj-${randomUUID()}`), true);
  assert.equal(isLikelyTestProject("cliente-x"), false);
  assert.equal(isLikelyTestProject("vida-divina"), false);
});

test("listProjectsForSwitcher: NUNCA devuelve un proyecto fuera de la allowlist, sin importar cuántos proyectos TEST/INTERNAL existan", () => {
  const uniqueMarker = randomUUID();
  // Proyecto fuera de la allowlist, con actividad real y hasta con "vida" en el nombre -- debe seguir invisible.
  const outsider = getOrCreateProject(`vida-divina-parecido-${uniqueMarker}`, `Vida Divina Parecido ${uniqueMarker}`);
  const source = getOrCreateSource(`source-${uniqueMarker}`);
  upsertIntelligenceItem({ project_id: outsider.id, source_id: source.id, content_type: "video" });

  const result = listProjectsForSwitcher({ search: uniqueMarker });
  assert.equal(result.total, 0, "un proyecto fuera de la allowlist nunca aparece, aunque coincida la búsqueda por nombre");
  assert.equal(result.projects.length, 0);
});

test("listProjectsForSwitcher: el proyecto canónico 'vida-divina' SÍ aparece cuando existe y coincide la búsqueda", () => {
  getOrCreateProject("vida-divina", "Vida Divina");

  const result = listProjectsForSwitcher({ search: "vida divina" });
  assert.ok(result.projects.some((p) => p.slug === "vida-divina"));
});

test("getDefaultProject: nunca elige un proyecto fuera de la allowlist, incluso con miles de proyectos TEST/INTERNAL con más actividad", () => {
  const uniqueMarker = randomUUID();
  const source = getOrCreateSource(`source-${uniqueMarker}`);
  const testFixture = getOrCreateProject(`demo-fixture-${uniqueMarker}`);
  for (let i = 0; i < 50; i++) {
    upsertIntelligenceItem({ project_id: testFixture.id, source_id: source.id, external_id: `fixture-item-${i}`, content_type: "video" });
  }

  const vidaDivina = getOrCreateProject("vida-divina", "Vida Divina");

  const result = getDefaultProject();
  assert.equal(result?.id, vidaDivina.id, "debe preferir 'vida-divina' (allowlist) aunque un proyecto fuera de la allowlist tenga 50x más items");
});

test("listProjectsForSwitcher: itemCount refleja actividad real, nunca fabricada", () => {
  getOrCreateProject("vida-divina", "Vida Divina");
  const uniqueMarker = randomUUID();
  const source = getOrCreateSource(`source-${uniqueMarker}`);
  const vidaDivina = getOrCreateProject("vida-divina");
  upsertIntelligenceItem({ project_id: vidaDivina.id, source_id: source.id, external_id: `count-check-${uniqueMarker}-1`, content_type: "video" });

  const result = listProjectsForSwitcher({ search: "vida-divina" });
  const entry = result.projects.find((p) => p.slug === "vida-divina");
  assert.ok((entry?.itemCount ?? 0) >= 1);
});
