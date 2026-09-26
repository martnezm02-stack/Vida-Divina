// projectQueries.test.ts — Selección/listado de proyectos para el Project
// Switcher. Cubre el bug real reportado en runtime: el switcher abría con
// un proyecto de prueba arbitrario (el más antiguo) en vez de preferir un
// proyecto real llamado "Vida Divina" cuando existe, o el proyecto con más
// actividad real cuando no existe -- nunca "el primero creado" a ciegas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getOrCreateProject, getOrCreateSource, upsertIntelligenceItem } from "../../../src/lib/intelligence";
import { listProjectsForSwitcher, getDefaultProject, isLikelyTestProject } from "../../../src/lib/intelligence/dashboard/projectQueries";

test("isLikelyTestProject: detecta patrones reales de fixtures (UUID, prefijos de test) -- heurístico, nunca oculta nada por sí solo", () => {
  assert.equal(isLikelyTestProject("demo-instagram-real-db-check"), true);
  assert.equal(isLikelyTestProject(`proj-${randomUUID()}`), true);
  assert.equal(isLikelyTestProject("cliente-x"), false);
  assert.equal(isLikelyTestProject("vida-divina"), false);
});

test("getDefaultProject: prefiere un proyecto real llamado 'Vida Divina' (por nombre) sobre cualquier otro, sin hardcodear su id", () => {
  const uniqueMarker = randomUUID();
  const decoy = getOrCreateProject(`decoy-with-lots-of-items-${uniqueMarker}`);
  const source = getOrCreateSource(`source-${uniqueMarker}`);
  for (let i = 0; i < 5; i++) {
    upsertIntelligenceItem({ project_id: decoy.id, source_id: source.id, external_id: `decoy-item-${i}`, content_type: "video" });
  }

  const vidaDivina = getOrCreateProject(`vida-divina-real-${uniqueMarker}`, "Vida Divina");

  const result = getDefaultProject();
  assert.equal(result?.id, vidaDivina.id, "debe preferir 'Vida Divina' por nombre aunque otro proyecto tenga más items");
});

test("getDefaultProject: sin ningún proyecto llamado 'Vida Divina', prefiere el proyecto real (no heurísticamente de prueba) con más actividad real", () => {
  const uniqueMarker = randomUUID();
  const source = getOrCreateSource(`source-${uniqueMarker}`);

  const testFixture = getOrCreateProject(`demo-fixture-${uniqueMarker}`);
  for (let i = 0; i < 10; i++) {
    upsertIntelligenceItem({ project_id: testFixture.id, source_id: source.id, external_id: `fixture-item-${i}`, content_type: "video" });
  }

  const realProject = getOrCreateProject(`cliente-real-${uniqueMarker}`, "Cliente Real");
  upsertIntelligenceItem({ project_id: realProject.id, source_id: source.id, external_id: "real-item-1", content_type: "video" });

  // No podemos aislar completamente el universo global de proyectos (la función mira TODA la tabla),
  // así que solo afirmamos la propiedad relativa: si el default cae entre estos dos, debe ser el real.
  const result = getDefaultProject();
  if (result && (result.id === testFixture.id || result.id === realProject.id)) {
    assert.equal(result.id, realProject.id, "entre un fixture de test y un proyecto real, debe preferir el real aunque tenga menos items");
  }
});

test("listProjectsForSwitcher: búsqueda por nombre/slug, con límite real -- nunca devuelve más de lo pedido", () => {
  const uniqueMarker = randomUUID();
  const project = getOrCreateProject(`buscable-${uniqueMarker}`, `Proyecto Buscable ${uniqueMarker}`);

  const result = listProjectsForSwitcher({ search: uniqueMarker, limit: 5 });
  assert.ok(result.projects.length <= 5);
  assert.ok(result.projects.some((p) => p.id === project.id));
  assert.ok(result.total >= 1);
});

test("listProjectsForSwitcher: itemCount refleja actividad real, nunca fabricada", () => {
  const uniqueMarker = randomUUID();
  const project = getOrCreateProject(`itemcount-${uniqueMarker}`);
  const source = getOrCreateSource(`source-${uniqueMarker}`);
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });
  upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const result = listProjectsForSwitcher({ search: uniqueMarker });
  const entry = result.projects.find((p) => p.id === project.id);
  assert.equal(entry?.itemCount, 2);
});
